// @ts-check
// File operations of the Explorer. Each returns an `Undo` step (or null when nothing changed),
// so the last operation can be reverted with Ctrl+Z. Permanent deletes cannot be undone and
// are confirmed by the caller.

/**
 * @typedef {object} Fs  the part of ctx.fs used here
 * @property {(path: string) => Promise<any>} stat
 * @property {(path: string) => Promise<string>} uniquePath
 * @property {(path: string, options?: object) => Promise<any>} mkdir
 * @property {(path: string, data: any, options?: object) => Promise<any>} writeFile
 * @property {(path: string, name: string) => Promise<any>} rename
 * @property {(from: string, to: string) => Promise<any>} move
 * @property {(from: string, to: string) => Promise<any>} copy
 * @property {(path: string) => Promise<any>} trash
 * @property {(path: string) => Promise<any>} restore
 * @property {(path: string) => Promise<void>} deletePermanently
 */

/** @typedef {{ kind: string, count: number, run: () => Promise<void> }} Undo */
/** @typedef {{ path: string, error: Error }} Failure */

const baseName = (/** @type {string} */ p) => p.slice(p.lastIndexOf('/') + 1);
const join = (/** @type {string} */ dir, /** @type {string} */ name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
const parent = (/** @type {string} */ p) => p.slice(0, p.lastIndexOf('/')) || '/';

/**
 * Runs `fn` for each path, collecting failures instead of stopping at the first one.
 * @template T
 * @param {string[]} paths
 * @param {(path: string) => Promise<T>} fn
 */
async function each(paths, fn) {
  /** @type {T[]} */
  const done = [];
  /** @type {Failure[]} */
  const failed = [];
  for (const path of paths) {
    try {
      done.push(await fn(path));
    } catch (error) {
      failed.push({ path, error: /** @type {Error} */ (error) });
    }
  }
  return { done, failed };
}

/**
 * Creates "New folder" / "New file.txt" (with " (2)" when taken).
 * @param {Fs} fs
 * @param {string} dir
 * @param {string} name
 * @param {'folder' | 'file'} kind
 */
export async function createNew(fs, dir, name, kind) {
  const path = await fs.uniquePath(join(dir, name));
  if (kind === 'folder') await fs.mkdir(path);
  else await fs.writeFile(path, '');
  /** @type {Undo} */
  const undo = { kind: 'create', count: 1, run: () => fs.deletePermanently(path) };
  return { path, undo };
}

/**
 * @param {Fs} fs
 * @param {string} path
 * @param {string} name
 */
export async function rename(fs, path, name) {
  const oldName = baseName(path);
  if (name === oldName) return { path, undo: null };
  const node = await fs.rename(path, name);
  /** @type {Undo} */
  const undo = { kind: 'rename', count: 1, run: async () => void (await fs.rename(node.path, oldName)) };
  return { path: /** @type {string} */ (node.path), undo };
}

/**
 * Copies or moves items into `dest`. Copies of an item into its own folder get " (2)".
 * Moving an item onto itself (same folder) does nothing.
 * @param {Fs} fs
 * @param {string[]} paths
 * @param {string} dest
 * @param {'copy' | 'move'} mode
 */
export async function transfer(fs, paths, dest, mode) {
  /** @type {{ from: string, to: string }[]} */
  const moved = [];
  const { failed } = await each(paths, async (from) => {
    if (mode === 'move' && parent(from) === dest) return;
    const to = await fs.uniquePath(join(dest, baseName(from)));
    if (mode === 'move') await fs.move(from, to);
    else await fs.copy(from, to);
    moved.push({ from, to });
  });
  /** @type {Undo | null} */
  const undo = moved.length
    ? {
        kind: mode,
        count: moved.length,
        run: async () => {
          for (const { from, to } of [...moved].reverse()) {
            if (mode === 'move') await fs.move(to, from);
            else await fs.deletePermanently(to);
          }
        },
      }
    : null;
  return { paths: moved.map((m) => m.to), failed, undo };
}

/**
 * Moves items to the trash.
 * @param {Fs} fs
 * @param {string[]} paths
 */
export async function trash(fs, paths) {
  const { done, failed } = await each(paths, (p) => fs.trash(p));
  /** @type {Undo | null} */
  const undo = done.length
    ? {
        kind: 'trash',
        count: done.length,
        run: async () => {
          for (const node of done) await fs.restore(node.path);
        },
      }
    : null;
  return { failed, undo };
}

/**
 * Restores trashed items to where they came from.
 * @param {Fs} fs
 * @param {string[]} trashedPaths
 */
export async function restore(fs, trashedPaths) {
  const { done, failed } = await each(trashedPaths, (p) => fs.restore(p));
  /** @type {Undo | null} */
  const undo = done.length
    ? {
        kind: 'restore',
        count: done.length,
        run: async () => {
          for (const node of done) await fs.trash(node.path);
        },
      }
    : null;
  return { paths: done.map((n) => /** @type {string} */ (n.path)), failed, undo };
}

/**
 * Deletes for good (no undo).
 * @param {Fs} fs
 * @param {string[]} paths
 */
export async function deleteForever(fs, paths) {
  const { failed } = await each(paths, (p) => fs.deletePermanently(p));
  return { failed };
}
