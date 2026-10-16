// @ts-check
// Virtual file system on IndexedDB.
//
// - 'vfs-nodes' holds metadata (one record per file/folder, unique `path` index, `parent`
//   index for listing, multi-entry `tags` index); 'vfs-content' holds file content (a string
//   for text, a Blob for binary) keyed by node id. Metadata listings never load content.
// - Every multi-step change (rename/move of a folder with all descendants, recursive copy,
//   trash, restore) is one transaction: it happens completely or not at all.
// - Trashed items move under '/.trash' and remember where they came from.
// - '/system' is read-only for apps; the OS writes there with `{ system: true }`.
// - Changes are announced as 'vfs:changed' on the bus; `watch()` filters them by path.
import { isTextMime, mimeFromPath, FOLDER_MIME } from './mime.js';
import { basename, dirname, extname, isInside, join, normalize, segments, validateName } from './path.js';

export const VFS_STORE_SCHEMA = {
  'vfs-nodes': {
    keyPath: 'id',
    indexes: {
      path: { keyPath: 'path', unique: true },
      parent: { keyPath: 'parent' },
      tags: { keyPath: 'tags', multiEntry: true },
    },
  },
  'vfs-content': {},
};
const NODES = 'vfs-nodes';
const CONTENT = 'vfs-content';
const STORES = [NODES, CONTENT];

export const TRASH = '/.trash';
export const SYSTEM = '/system';
export const DEFAULT_FOLDERS = [
  'Desktop',
  'Documents',
  'Downloads',
  'Pictures',
  'Music',
  'Videos',
  'Projects',
  '.config',
];

/**
 * @typedef {object} VfsNode
 * @property {string} id
 * @property {'file' | 'folder'} type
 * @property {string} name
 * @property {string | null} parent   parent node id (null for '/')
 * @property {string} path
 * @property {string} mime
 * @property {number} size            bytes (0 for folders)
 * @property {number} created
 * @property {number} modified
 * @property {string[]} tags
 * @property {Record<string, unknown>} meta
 * @property {boolean} [readOnly]
 * @property {{ at: number, originalPath: string }} [trash]
 */

/** @typedef {'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'EACCES' | 'EINVAL' | 'ENOTEMPTY'} VfsErrorCode */

export class VfsError extends Error {
  /** @param {VfsErrorCode} code @param {string} message @param {string} [path] */
  constructor(code, message, path) {
    super(path ? `${message}: ${path}` : message);
    this.name = 'VfsError';
    this.code = code;
    this.path = path;
  }
}

/** @typedef {string | Blob | ArrayBuffer | ArrayBufferView} FileData */

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.db
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {string} options.user           home folder name (/home/<user>)
 * @param {() => number} [options.now]
 * @param {() => string} [options.newId]
 */
export function createVfs({ db, bus, user, now = Date.now, newId = () => crypto.randomUUID() }) {
  const home = `/home/${user}`;
  const protectedPaths = new Set(['/', '/home', home, TRASH, SYSTEM, ...DEFAULT_FOLDERS.map((f) => join(home, f))]);
  /** Folders the OS relies on: never trashed, deleted, renamed or moved. */
  const isProtected = (/** @type {string} */ path) => protectedPaths.has(path);

  /** @param {string} path */
  function abs(path) {
    if (typeof path !== 'string' || !path.startsWith('/'))
      throw new VfsError('EINVAL', 'Expected an absolute path', String(path));
    return normalize(path);
  }

  /** @param {import('../storage/types.js').StoreOps} tx @param {string} path @returns {Promise<VfsNode | undefined>} */
  async function nodeAt(tx, path) {
    const [node] = await tx.getAll(NODES, { index: 'path', range: { only: path }, limit: 1 });
    return node;
  }

  /** @param {import('../storage/types.js').StoreOps} tx @param {string} path */
  async function mustExist(tx, path) {
    const node = await nodeAt(tx, path);
    if (!node) throw new VfsError('ENOENT', 'No such file or folder', path);
    return node;
  }

  /** @param {import('../storage/types.js').StoreOps} tx @param {string} parentId @returns {Promise<VfsNode[]>} */
  const childrenOf = (tx, parentId) => tx.getAll(NODES, { index: 'parent', range: { only: parentId } });

  /** All nodes inside a folder (not including it), parents before children. */
  /** @param {import('../storage/types.js').StoreOps} tx @param {VfsNode} folder @returns {Promise<VfsNode[]>} */
  async function descendants(tx, folder) {
    /** @type {VfsNode[]} */
    const out = [];
    /** @type {VfsNode[]} */
    let level = [folder];
    while (level.length) {
      /** @type {VfsNode[]} */
      const next = [];
      for (const n of level) if (n.type === 'folder') next.push(...(await childrenOf(tx, n.id)));
      out.push(...next);
      level = next;
    }
    return out;
  }

  /** @param {VfsNode} node @param {boolean} system */
  function assertWritable(node, system) {
    if (node.readOnly && !system) throw new VfsError('EACCES', 'Read-only', node.path);
  }

  /**
   * @param {'created' | 'modified' | 'deleted' | 'moved' | 'trashed' | 'restored'} type
   * @param {VfsNode} node
   * @param {string} [oldPath]
   */
  function announce(type, node, oldPath) {
    bus.emit('vfs:changed', { type, path: node.path, oldPath, nodeType: node.type, id: node.id });
  }

  /** @param {FileData} data @returns {{ content: string | Blob, size: number, text: boolean }} */
  function toContent(data) {
    if (typeof data === 'string') return { content: data, size: new TextEncoder().encode(data).byteLength, text: true };
    if (data instanceof Blob) return { content: data, size: data.size, text: false };
    if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      const blob = new Blob([/** @type {BlobPart} */ (data)]);
      return { content: blob, size: blob.size, text: false };
    }
    throw new VfsError('EINVAL', 'File data must be a string, Blob, ArrayBuffer or typed array');
  }

  /**
   * Creates a node record (no transaction handling).
   * @param {import('../storage/types.js').StoreOps} tx
   * @param {VfsNode} parent
   * @param {string} name
   * @param {Partial<VfsNode>} fields
   */
  async function insert(tx, parent, name, fields) {
    const nameError = validateName(name);
    if (nameError) throw new VfsError('EINVAL', nameError, name);
    if (parent.type !== 'folder') throw new VfsError('ENOTDIR', 'Not a folder', parent.path);
    const path = join(parent.path, name);
    if (await nodeAt(tx, path)) throw new VfsError('EEXIST', 'Already exists', path);
    const t = now();
    /** @type {VfsNode} */
    const node = {
      id: newId(),
      type: 'file',
      name,
      parent: parent.id,
      path,
      mime: mimeFromPath(path),
      size: 0,
      created: t,
      modified: t,
      tags: [],
      meta: {},
      ...fields,
    };
    if (parent.readOnly) node.readOnly = true;
    await tx.put(NODES, node);
    return node;
  }

  /** Creates missing folders along `path` (inside the open transaction). */
  /** @param {import('../storage/types.js').StoreOps} tx @param {string} path @param {boolean} system */
  async function ensureFolder(tx, path, system) {
    let current = await mustExist(tx, '/');
    /** @type {VfsNode[]} */
    const created = [];
    for (const part of segments(path)) {
      const next = await nodeAt(tx, join(current.path, part));
      if (next) {
        if (next.type !== 'folder') throw new VfsError('ENOTDIR', 'Not a folder', next.path);
        current = next;
        continue;
      }
      assertWritable(current, system);
      current = await insert(tx, current, part, { type: 'folder', mime: FOLDER_MIME });
      created.push(current);
    }
    return { folder: current, created };
  }

  /**
   * Re-paths a node and all its descendants after a rename/move (inside a transaction).
   * @param {import('../storage/types.js').StoreOps} tx
   * @param {VfsNode} node
   * @param {VfsNode} newParent
   * @param {string} newName
   * @param {Partial<VfsNode>} [extra]
   */
  async function relocate(tx, node, newParent, newName, extra = {}) {
    const oldPath = node.path;
    const newPath = join(newParent.path, newName);
    const inside = node.type === 'folder' ? await descendants(tx, node) : [];
    /** @type {VfsNode} */
    const moved = { ...node, ...extra, name: newName, parent: newParent.id, path: newPath, modified: now() };
    if (node.type === 'file' && extname(newName) !== extname(node.name)) moved.mime = mimeFromPath(newPath);
    // Free the old paths first so the unique index never sees two records with one path.
    for (const d of inside) await tx.put(NODES, { ...d, path: `\u0000moving/${d.id}` });
    await tx.put(NODES, moved);
    for (const d of inside) await tx.put(NODES, { ...d, path: newPath + d.path.slice(oldPath.length) });
    return moved;
  }

  /**
   * "name.txt" → "name (2).txt", "name (3).txt", … until free.
   * @param {import('../storage/types.js').StoreOps} tx
   * @param {VfsNode} parent
   * @param {string} name
   */
  async function freeName(tx, parent, name) {
    if (!(await nodeAt(tx, join(parent.path, name)))) return name;
    const ext = name.startsWith('.') ? '' : extname(name);
    const stem = ext ? name.slice(0, -ext.length) : name;
    for (let i = 2; ; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!(await nodeAt(tx, join(parent.path, candidate)))) return candidate;
    }
  }

  /**
   * @template T
   * @param {(tx: import('../storage/types.js').StoreOps) => Promise<T>} fn
   */
  const write = (fn) => db.transaction(STORES, 'readwrite', fn);
  /**
   * @template T
   * @param {(tx: import('../storage/types.js').StoreOps) => Promise<T>} fn
   */
  const read = (fn) => db.transaction(STORES, 'readonly', fn);

  const vfs = {
    home,
    trashPath: TRASH,

    /** Creates '/', '/home/<user>' with the default folders, '/system' and the trash. Idempotent. */
    async init() {
      await write(async (tx) => {
        if (!(await nodeAt(tx, '/'))) {
          const t = now();
          await tx.put(NODES, {
            id: 'root',
            type: 'folder',
            name: '',
            parent: null,
            path: '/',
            mime: FOLDER_MIME,
            size: 0,
            created: t,
            modified: t,
            tags: [],
            meta: {},
          });
        }
        for (const folder of DEFAULT_FOLDERS) await ensureFolder(tx, join(home, folder), true);
        await ensureFolder(tx, TRASH, true);
        const { folder: system } = await ensureFolder(tx, SYSTEM, true);
        if (!system.readOnly) await tx.put(NODES, { ...system, readOnly: true });
      });
    },

    /** @param {string} path @returns {Promise<VfsNode | null>} */
    async stat(path) {
      return (await read((tx) => nodeAt(tx, abs(path)))) ?? null;
    },

    /** @param {string} path */
    async exists(path) {
      return (await this.stat(path)) !== null;
    },

    /**
     * The path itself if free, else the first free "name (2).ext", "name (3).ext", …
     * @param {string} path
     */
    async uniquePath(path) {
      const p = abs(path);
      return read(async (tx) => {
        const parent = await nodeAt(tx, dirname(p));
        return parent ? join(parent.path, await freeName(tx, parent, basename(p))) : p;
      });
    },

    /**
     * Folder contents: folders first, then files, by name (locale-aware, numeric).
     * @param {string} path
     * @param {{ hidden?: boolean }} [options] include dot-files
     * @returns {Promise<VfsNode[]>}
     */
    async list(path, { hidden = true } = {}) {
      const p = abs(path);
      const children = await read(async (tx) => {
        const folder = await mustExist(tx, p);
        if (folder.type !== 'folder') throw new VfsError('ENOTDIR', 'Not a folder', p);
        return childrenOf(tx, folder.id);
      });
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      return children
        .filter((n) => hidden || !n.name.startsWith('.'))
        .sort((a, b) => (a.type === b.type ? collator.compare(a.name, b.name) : a.type === 'folder' ? -1 : 1));
    },

    /**
     * @param {string} path
     * @param {{ recursive?: boolean, system?: boolean }} [options]
     */
    async mkdir(path, { recursive = false, system = false } = {}) {
      const p = abs(path);
      const created = await write(async (tx) => {
        if (recursive) return (await ensureFolder(tx, p, system)).created;
        const parent = await mustExist(tx, dirname(p));
        assertWritable(parent, system);
        return [await insert(tx, parent, basename(p), { type: 'folder', mime: FOLDER_MIME })];
      });
      for (const node of created) announce('created', node);
      return created.at(-1) ?? /** @type {VfsNode} */ (await this.stat(p));
    },

    /**
     * Creates or overwrites a file.
     * @param {string} path
     * @param {FileData} data
     * @param {{ mime?: string, createParents?: boolean, tags?: string[], meta?: Record<string, unknown>, system?: boolean }} [options]
     */
    async writeFile(path, data, { mime, createParents = false, tags, meta, system = false } = {}) {
      const p = abs(path);
      if (p === '/') throw new VfsError('EISDIR', 'Is a folder', p);
      const { content, size } = toContent(data);
      const result = await write(async (tx) => {
        /** @type {VfsNode[]} */
        let createdFolders = [];
        let parent;
        if (createParents) ({ folder: parent, created: createdFolders } = await ensureFolder(tx, dirname(p), system));
        else parent = await mustExist(tx, dirname(p));
        const existing = await nodeAt(tx, p);
        let node;
        if (existing) {
          if (existing.type === 'folder') throw new VfsError('EISDIR', 'Is a folder', p);
          assertWritable(existing, system);
          node = {
            ...existing,
            size,
            modified: now(),
            ...(mime ? { mime } : {}),
            ...(tags ? { tags: [...new Set(tags)] } : {}),
            ...(meta ? { meta } : {}),
          };
          await tx.put(NODES, node);
        } else {
          assertWritable(parent, system);
          node = await insert(tx, parent, basename(p), {
            size,
            ...(mime ? { mime } : {}),
            tags: [...new Set(tags ?? [])],
            meta: meta ?? {},
          });
        }
        await tx.put(CONTENT, content, node.id);
        return { node, created: !existing, createdFolders };
      });
      for (const f of result.createdFolders) announce('created', f);
      announce(result.created ? 'created' : 'modified', result.node);
      return result.node;
    },

    /**
     * @param {string} path
     * @param {{ as?: 'text' | 'blob' | 'arraybuffer' }} [options] default: text for text files, Blob otherwise
     * @returns {Promise<string | Blob | ArrayBuffer>}
     */
    async readFile(path, { as } = {}) {
      const p = abs(path);
      const { node, content } = await read(async (tx) => {
        const node = await mustExist(tx, p);
        if (node.type === 'folder') throw new VfsError('EISDIR', 'Is a folder', p);
        return { node, content: await tx.get(CONTENT, node.id) };
      });
      const value = content ?? '';
      const mode = as ?? (typeof value === 'string' || isTextMime(node.mime) ? 'text' : 'blob');
      if (mode === 'text') return typeof value === 'string' ? value : value.text();
      const blob = typeof value === 'string' ? new Blob([value], { type: node.mime }) : value;
      return mode === 'blob' ? blob : blob.arrayBuffer();
    },

    /** @param {string} path @returns {Promise<string>} */
    async readText(path) {
      return /** @type {Promise<string>} */ (this.readFile(path, { as: 'text' }));
    },

    /**
     * @param {string} path
     * @param {string} newName
     * @param {{ system?: boolean }} [options]
     */
    async rename(path, newName, { system = false } = {}) {
      const p = abs(path);
      const nameError = validateName(newName);
      if (nameError) throw new VfsError('EINVAL', nameError, newName);
      const node = await write(async (tx) => {
        const node = await mustExist(tx, p);
        if (isProtected(p)) throw new VfsError('EACCES', 'This folder cannot be renamed', p);
        assertWritable(node, system);
        const parent = await mustExist(tx, dirname(p));
        if (newName !== node.name && (await nodeAt(tx, join(parent.path, newName)))) {
          throw new VfsError('EEXIST', 'Already exists', join(parent.path, newName));
        }
        return relocate(tx, node, parent, newName);
      });
      announce('moved', node, p);
      return node;
    },

    /**
     * Moves a file or folder to a new path (`to` is the full destination path).
     * @param {string} from
     * @param {string} to
     * @param {{ system?: boolean }} [options]
     */
    async move(from, to, { system = false } = {}) {
      const src = abs(from);
      const dest = abs(to);
      if (src === dest) return /** @type {VfsNode} */ (await this.stat(src));
      const node = await write(async (tx) => {
        const node = await mustExist(tx, src);
        if (isProtected(src)) throw new VfsError('EACCES', 'This folder cannot be moved', src);
        if (node.type === 'folder' && isInside(src, dest))
          throw new VfsError('EINVAL', 'Cannot move a folder into itself', dest);
        assertWritable(node, system);
        const parent = await mustExist(tx, dirname(dest));
        if (parent.type !== 'folder') throw new VfsError('ENOTDIR', 'Not a folder', parent.path);
        assertWritable(parent, system);
        if (await nodeAt(tx, dest)) throw new VfsError('EEXIST', 'Already exists', dest);
        const nameError = validateName(basename(dest));
        if (nameError) throw new VfsError('EINVAL', nameError, dest);
        return relocate(tx, node, parent, basename(dest));
      });
      announce('moved', node, src);
      return node;
    },

    /**
     * Copies a file or folder (recursively) to `to`.
     * @param {string} from
     * @param {string} to
     */
    async copy(from, to) {
      const src = abs(from);
      const dest = abs(to);
      if (isInside(src, dest)) throw new VfsError('EINVAL', 'Cannot copy a folder into itself', dest);
      const root = await write(async (tx) => {
        const node = await mustExist(tx, src);
        const parent = await mustExist(tx, dirname(dest));
        assertWritable(parent, false);
        /** @type {Map<string, VfsNode>} source id → copy */
        const copies = new Map();
        const t = now();
        const all = [node, ...(node.type === 'folder' ? await descendants(tx, node) : [])];
        for (const source of all) {
          const targetParent =
            source === node ? parent : /** @type {VfsNode} */ (copies.get(/** @type {string} */ (source.parent)));
          const name = source === node ? basename(dest) : source.name;
          const copy = await insert(tx, targetParent, name, {
            type: source.type,
            mime: source.mime,
            size: source.size,
            tags: [...source.tags],
            meta: structuredClone(source.meta),
            created: t,
            modified: t,
          });
          copies.set(source.id, copy);
          if (source.type === 'file') {
            const content = await tx.get(CONTENT, source.id);
            if (content !== undefined) await tx.put(CONTENT, content, copy.id);
          }
        }
        return /** @type {VfsNode} */ (copies.get(node.id));
      });
      announce('created', root);
      return root;
    },

    /**
     * Moves an item to the trash, remembering where it was.
     * @param {string} path
     */
    async trash(path) {
      const p = abs(path);
      if (isInside(TRASH, p)) throw new VfsError('EINVAL', 'Already in the trash', p);
      const node = await write(async (tx) => {
        const node = await mustExist(tx, p);
        if (isProtected(p)) throw new VfsError('EACCES', 'This folder cannot be deleted', p);
        assertWritable(node, false);
        const trash = await mustExist(tx, TRASH);
        // Unique name inside the trash: "<id>-<name>" keeps restore unambiguous.
        return relocate(tx, node, trash, `${node.id}-${node.name}`, { trash: { at: now(), originalPath: p } });
      });
      announce('trashed', node, p);
      return node;
    },

    /** @returns {Promise<VfsNode[]>} items directly in the trash, newest first */
    async listTrash() {
      const items = await read(async (tx) => childrenOf(tx, (await mustExist(tx, TRASH)).id));
      return items.sort((a, b) => (b.trash?.at ?? 0) - (a.trash?.at ?? 0));
    },

    /**
     * Restores a trashed item to its original place (with " (2)" etc. if that name is taken;
     * missing parent folders are recreated).
     * @param {string} trashedPath path inside the trash (from listTrash)
     */
    async restore(trashedPath) {
      const p = abs(trashedPath);
      const node = await write(async (tx) => {
        const node = await mustExist(tx, p);
        if (!node.trash) throw new VfsError('EINVAL', 'Not in the trash', p);
        const original = node.trash.originalPath;
        const { folder: parent } = await ensureFolder(tx, dirname(original), false);
        const name = await freeName(tx, parent, basename(original));
        const { trash: _trash, ...rest } = node;
        return relocate(tx, /** @type {VfsNode} */ (rest), parent, name);
      });
      announce('restored', node, p);
      return node;
    },

    /**
     * Deletes a file or folder (recursively) for good, including its content.
     * @param {string} path
     * @param {{ system?: boolean }} [options]
     */
    async deletePermanently(path, { system = false } = {}) {
      const p = abs(path);
      const node = await write(async (tx) => {
        const node = await mustExist(tx, p);
        if (isProtected(p)) throw new VfsError('EACCES', 'This folder cannot be deleted', p);
        assertWritable(node, system);
        for (const n of [node, ...(await descendants(tx, node))]) {
          await tx.delete(NODES, n.id);
          if (n.type === 'file') await tx.delete(CONTENT, n.id);
        }
        return node;
      });
      announce('deleted', node);
    },

    /**
     * Permanently deletes trash items that were trashed before `before` (auto-empty).
     * @param {number} before timestamp
     * @returns {Promise<number>} items deleted
     */
    async purgeTrash(before) {
      let count = 0;
      for (const item of await this.listTrash()) {
        if ((item.trash?.at ?? Infinity) >= before) continue;
        // Another tab may purge at the same time; a vanished item is fine.
        await this.deletePermanently(item.path).then(
          () => count++,
          () => {},
        );
      }
      return count;
    },

    async emptyTrash() {
      const items = await this.listTrash();
      for (const item of items) await this.deletePermanently(item.path);
      return items.length;
    },

    /**
     * @param {string} path
     * @param {string[]} tags
     */
    async setTags(path, tags) {
      return this.updateNode(path, { tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))] });
    },

    /**
     * Merges `meta` into the node's metadata (e.g. { favorite: true }).
     * @param {string} path
     * @param {Record<string, unknown>} meta
     */
    async setMeta(path, meta) {
      const node = await this.stat(path);
      if (!node) throw new VfsError('ENOENT', 'No such file or folder', path);
      return this.updateNode(path, { meta: { ...node.meta, ...meta } });
    },

    /**
     * @param {string} path
     * @param {Pick<Partial<VfsNode>, 'tags' | 'meta'>} fields
     */
    async updateNode(path, fields) {
      const p = abs(path);
      const node = await write(async (tx) => {
        const node = await mustExist(tx, p);
        assertWritable(node, false);
        const updated = { ...node, ...fields, modified: now() };
        await tx.put(NODES, updated);
        return updated;
      });
      announce('modified', node);
      return node;
    },

    /**
     * Finds files and folders by name (case-insensitive substring), tag, and/or text content.
     * Trash is excluded unless `under` points into it.
     * @param {{ name?: string, tag?: string, content?: string, under?: string, type?: 'file' | 'folder', limit?: number }} query
     * @returns {Promise<VfsNode[]>}
     */
    async search({ name, tag, content, under = '/', type, limit = 200 }) {
      const root = abs(under);
      const needle = name?.toLocaleLowerCase();
      const textNeedle = content?.toLocaleLowerCase();
      /** @type {VfsNode[]} */
      const matches = [];
      await read(async (tx) => {
        /** @type {VfsNode[]} */
        const pool = tag ? await tx.getAll(NODES, { index: 'tags', range: { only: tag } }) : await tx.getAll(NODES);
        for (const node of pool) {
          if (matches.length >= limit) break;
          if (!isInside(root, node.path) || node.path === root) continue;
          if (!isInside(TRASH, root) && isInside(TRASH, node.path)) continue;
          if (type && node.type !== type) continue;
          if (needle && !node.name.toLocaleLowerCase().includes(needle)) continue;
          if (textNeedle) {
            if (node.type !== 'file' || !isTextMime(node.mime)) continue;
            const value = await tx.get(CONTENT, node.id);
            if (typeof value !== 'string' || !value.toLocaleLowerCase().includes(textNeedle)) continue;
          }
          matches.push(node);
        }
      });
      return matches.sort((a, b) => a.path.localeCompare(b.path));
    },

    /**
     * Every tag in use (outside the trash) with how many items carry it, sorted by name.
     * @returns {Promise<{ tag: string, count: number }[]>}
     */
    async tags() {
      /** @type {Map<string, number>} */
      const counts = new Map();
      await read((tx) =>
        tx.iterate(NODES, undefined, (n) => {
          if (!n.tags?.length || isInside(TRASH, n.path)) return;
          for (const tag of n.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }),
      );
      return [...counts]
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' }));
    },

    /**
     * Every node under a path (including it), parents first. Used by export and backup.
     * @param {string} path
     */
    async walk(path) {
      const p = abs(path);
      return read(async (tx) => {
        const node = await mustExist(tx, p);
        return [node, ...(await descendants(tx, node))];
      });
    },

    /**
     * Calls `fn` for changes at `path` (or inside it, with `recursive`). Returns unsubscribe.
     * @param {string} path
     * @param {(change: { type: string, path: string, oldPath?: string, nodeType: string, remote?: boolean }) => void} fn
     * @param {{ recursive?: boolean }} [options]
     */
    watch(path, fn, { recursive = false } = {}) {
      const p = abs(path);
      /** @param {string | undefined} changed */
      const relevant = (changed) =>
        changed !== undefined && (changed === p || dirname(changed) === p || (recursive && isInside(p, changed)));
      return bus.on('vfs:changed', (change) => {
        if (relevant(change.path) || relevant(change.oldPath)) fn(change);
      });
    },

    /** Total size and counts (for Settings → Storage). */
    async usage() {
      return read(async (tx) => {
        let files = 0;
        let folders = 0;
        let bytes = 0;
        let trashBytes = 0;
        await tx.iterate(NODES, undefined, (n) => {
          if (n.type === 'folder') folders++;
          else {
            files++;
            bytes += n.size;
            if (n.path.startsWith(`${TRASH}/`)) trashBytes += n.size;
          }
        });
        return { files, folders, bytes, trashBytes };
      });
    },
  };
  return vfs;
}

/** @typedef {ReturnType<typeof createVfs>} Vfs */
