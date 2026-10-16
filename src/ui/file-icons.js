// @ts-check
// Icon names for files by mime type, shared by the desktop, file dialogs and the File Explorer.

/** App shortcuts on the desktop are small JSON files with this extension. */
export const SHORTCUT_EXT = '.nexus-app';

/** @param {string} mime @param {string} name */
export function fileIconName(mime, name) {
  if (name.endsWith(SHORTCUT_EXT)) return 'rocket';
  if (mime === 'inode/directory') return 'folder';
  if (mime.startsWith('image/')) return 'file-image';
  if (mime.startsWith('audio/')) return 'file-audio';
  if (mime.startsWith('video/')) return 'file-video';
  if (mime === 'application/zip') return 'file-zip';
  if (/javascript|typescript|json|x-python|x-c|x-rust|x-go|sql|html|css|x-sh/.test(mime)) return 'file-code';
  if (mime.startsWith('text/')) return 'file-text';
  return 'file';
}

/** Drag & drop type for VFS paths dragged between Nexus apps (value: JSON array of paths). */
export const PATHS_MIME = 'application/x-nexus-paths';

/** Paths from a PATHS_MIME drag payload (invalid data → none). @param {string} json @returns {string[]} */
export function draggedPaths(json) {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((p) => typeof p === 'string' && p.startsWith('/')) : [];
  } catch {
    return [];
  }
}
