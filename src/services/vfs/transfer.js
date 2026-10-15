// @ts-check
// Moving files between the real OS and the VFS: file picker and drag & drop import (folders
// where the browser supports them), single-file download, and folder export as .zip.
import { isTextMime, mimeFromPath } from './mime.js';
import { basename, join, relative } from './path.js';

/** @typedef {{ file: File, relativePath: string }} ImportEntry  relativePath uses '/' and includes the file name */

/**
 * Entries from an <input type="file"> (with `webkitdirectory`, files carry their folder path).
 * @param {FileList | File[]} files
 * @returns {ImportEntry[]}
 */
export function entriesFromFileList(files) {
  return [...files].map((file) => ({ file, relativePath: file.webkitRelativePath || file.name }));
}

/**
 * Entries from a drop event, walking dropped folders where the browser exposes them.
 * @param {DataTransfer} dataTransfer
 * @returns {Promise<ImportEntry[]>}
 */
export async function entriesFromDataTransfer(dataTransfer) {
  const items = [...(dataTransfer.items ?? [])].filter((i) => i.kind === 'file');
  const roots = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (roots.length === 0) return entriesFromFileList(dataTransfer.files);
  /** @type {ImportEntry[]} */
  const out = [];
  /** @param {any} entry @param {string} prefix */
  async function visit(entry, prefix) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push({ file, relativePath: path });
      return;
    }
    const reader = entry.createReader();
    for (;;) {
      // readEntries returns results in batches until an empty batch.
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await visit(child, path);
    }
  }
  for (const root of roots) await visit(root, '');
  return out;
}

/**
 * Writes imported entries into `dest`, keeping their folder structure. Name clashes get
 * " (2)" etc. Text files are stored as text (searchable); everything else as Blob.
 * @param {import('./vfs.js').Vfs} vfs
 * @param {ImportEntry[]} entries
 * @param {string} dest destination folder
 * @param {{ onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<string[]>} paths written
 */
export async function importEntries(vfs, entries, dest, { onProgress } = {}) {
  /** @type {Map<string, string>} top-level name in the drop → actual name after clash handling */
  const renamedRoots = new Map();
  /** @type {string[]} */
  const written = [];
  for (const [i, { file, relativePath }] of entries.entries()) {
    const parts = relativePath.split('/').filter(Boolean);
    const top = /** @type {string} */ (parts[0]);
    if (!renamedRoots.has(top)) renamedRoots.set(top, basename(await vfs.uniquePath(join(dest, top))));
    parts[0] = /** @type {string} */ (renamedRoots.get(top));
    const path = join(dest, ...parts);
    const mime = file.type || mimeFromPath(path);
    const data = isTextMime(mime) ? await file.text() : file;
    await vfs.writeFile(path, data, { mime, createParents: true });
    written.push(path);
    onProgress?.(i + 1, entries.length);
  }
  return written;
}

/**
 * Triggers a browser download of a Blob.
 * @param {Blob} blob
 * @param {string} filename
 * @param {Document} [doc]
 */
export function downloadBlob(blob, filename, doc = document) {
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * @param {import('./vfs.js').Vfs} vfs
 * @param {string} path
 */
export async function exportFile(vfs, path) {
  const node = await vfs.stat(path);
  if (!node || node.type !== 'file') throw new Error(`Not a file: ${path}`);
  const blob = /** @type {Blob} */ (await vfs.readFile(path, { as: 'blob' }));
  downloadBlob(new Blob([blob], { type: node.mime }), node.name);
}

/**
 * Zips a folder (fflate is loaded on first use). Empty folders are kept.
 * @param {import('./vfs.js').Vfs} vfs
 * @param {string} path
 * @returns {Promise<Blob>}
 */
export async function zipFolder(vfs, path) {
  const { zip } = await import('fflate');
  const nodes = await vfs.walk(path);
  /** @type {Record<string, Uint8Array | [Uint8Array, { level: 0 }]>} */
  const files = {};
  for (const node of nodes.slice(1)) {
    const name = relative(path, node.path);
    if (node.type === 'folder') {
      files[`${name}/`] = new Uint8Array(0);
      continue;
    }
    const blob = /** @type {Blob} */ (await vfs.readFile(node.path, { as: 'blob' }));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    // Already-compressed formats are stored, not deflated again.
    files[name] = /^(image\/(png|jpeg|webp|gif|avif)|audio\/|video\/|application\/zip)/.test(node.mime)
      ? [bytes, { level: 0 }]
      : bytes;
  }
  const data = await new Promise((resolve, reject) =>
    zip(files, (error, out) => (error ? reject(error) : resolve(out))),
  );
  return new Blob([/** @type {Uint8Array<ArrayBuffer>} */ (data)], { type: 'application/zip' });
}

/**
 * Downloads a folder as `<name>.zip`.
 * @param {import('./vfs.js').Vfs} vfs
 * @param {string} path
 */
export async function exportFolder(vfs, path) {
  downloadBlob(await zipFolder(vfs, path), `${basename(path) || 'nexus'}.zip`);
}
