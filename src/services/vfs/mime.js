// @ts-check
// File extension ↔ MIME type mapping (no network, no sniffing).
import { extname } from './path.js';

/** @type {Record<string, string>} */
const TYPES = {
  // text & documents
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.ini': 'text/plain',
  '.log': 'text/plain',
  '.rtf': 'application/rtf',
  '.pdf': 'application/pdf',
  // code
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.jsx': 'text/javascript',
  '.tsx': 'text/typescript',
  '.py': 'text/x-python',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.h': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.rs': 'text/x-rust',
  '.go': 'text/x-go',
  '.sh': 'application/x-sh',
  '.sql': 'application/sql',
  '.svg': 'image/svg+xml',
  // images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  // audio & video
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.lrc': 'text/plain',
  // archives & data
  '.zip': 'application/zip',
  '.sqlite': 'application/vnd.sqlite3',
  '.db': 'application/vnd.sqlite3',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  // Nexus formats
  '.nexus-backup': 'application/vnd.nexus.backup',
  '.nexus-plugin': 'application/vnd.nexus.plugin',
};

export const FOLDER_MIME = 'inode/directory';
export const DEFAULT_MIME = 'application/octet-stream';

/** @param {string} path */
export function mimeFromPath(path) {
  return TYPES[extname(path)] ?? DEFAULT_MIME;
}

/** Text-like types: searchable by content and editable in the text editor. */
export function isTextMime(/** @type {string} */ mime) {
  return (
    mime.startsWith('text/') ||
    [
      'application/json',
      'application/xml',
      'application/yaml',
      'application/sql',
      'application/x-sh',
      'image/svg+xml',
    ].includes(mime)
  );
}

/**
 * Does a declared handler type match this file? Patterns: exact mime, 'type/*', or '.ext'.
 * @param {string} pattern
 * @param {{ mime: string, path?: string }} file
 */
export function matchesType(pattern, { mime, path }) {
  if (pattern.startsWith('.')) return path !== undefined && path.toLowerCase().endsWith(pattern.toLowerCase());
  if (pattern === '*/*') return true;
  if (pattern.endsWith('/*')) return mime.startsWith(pattern.slice(0, -1));
  return pattern === mime;
}
