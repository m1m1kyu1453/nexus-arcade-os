// @ts-check
// POSIX-style path utilities for the VFS. All VFS paths are absolute ('/home/ada/Notes/x.md').
// `normalize` never climbs above '/', so '..' can't escape the root; `resolveWithin` throws
// when a path would leave a given base folder.

/** @param {string} path */
export function isAbsolute(path) {
  return path.startsWith('/');
}

/**
 * Collapses '.', '..', repeated and trailing slashes. Relative paths stay relative
 * (leading '..' kept); absolute paths are clamped at '/'.
 * @param {string} path
 */
export function normalize(path) {
  if (typeof path !== 'string') throw new TypeError('Path must be a string');
  if (path.includes('\0')) throw new Error('Path must not contain NUL characters');
  const absolute = isAbsolute(path);
  /** @type {string[]} */
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else if (!absolute) parts.push('..');
      continue;
    }
    parts.push(part);
  }
  const joined = parts.join('/');
  return absolute ? `/${joined}` : joined || '.';
}

/** @param {...string} parts */
export function join(...parts) {
  return normalize(parts.filter((p) => p !== '').join('/'));
}

/** @param {string} path */
export function dirname(path) {
  const n = normalize(path);
  if (n === '/') return '/';
  const i = n.lastIndexOf('/');
  if (i === -1) return '.';
  return i === 0 ? '/' : n.slice(0, i);
}

/**
 * @param {string} path
 * @param {string} [ext] removed from the end if present (e.g. '.md')
 */
export function basename(path, ext) {
  const n = normalize(path);
  if (n === '/') return '';
  const base = n.slice(n.lastIndexOf('/') + 1);
  return ext && base.endsWith(ext) && base !== ext ? base.slice(0, -ext.length) : base;
}

/** Extension including the dot, lower-cased: 'a/b.Tar.GZ' → '.gz'. Dotfiles have none. */
export function extname(/** @type {string} */ path) {
  const base = basename(path);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
}

/**
 * Relative path from one absolute path to another.
 * @param {string} from
 * @param {string} to
 */
export function relative(from, to) {
  const a = segments(from);
  const b = segments(to);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/') || '.';
}

/** Path segments of an absolute path: '/a/b' → ['a', 'b']. */
export function segments(/** @type {string} */ path) {
  const n = toAbsolute(path);
  return n === '/' ? [] : n.slice(1).split('/');
}

/** True if `path` is `parent` or inside it. */
export function isInside(/** @type {string} */ parent, /** @type {string} */ path) {
  const p = toAbsolute(parent);
  const c = toAbsolute(path);
  return p === '/' || c === p || c.startsWith(`${p}/`);
}

/**
 * Resolves a (possibly relative) path against `base` and guarantees the result stays inside it.
 * @param {string} base absolute folder
 * @param {string} path
 */
export function resolveWithin(base, path) {
  const root = toAbsolute(base);
  const resolved = isAbsolute(path) ? normalize(path) : normalize(`${root}/${path}`);
  if (!isInside(root, resolved)) throw new Error(`Path "${path}" escapes "${root}"`);
  return resolved;
}

/** @param {string} path */
function toAbsolute(path) {
  if (!isAbsolute(path)) throw new Error(`Expected an absolute path, got "${path}"`);
  return normalize(path);
}

/**
 * Validates a single file or folder name (not a path).
 * @param {string} name
 * @returns {string | null} error message, or null when valid
 */
export function validateName(name) {
  if (typeof name !== 'string' || name.trim() === '') return 'Name must not be empty';
  if (name === '.' || name === '..') return 'Name must not be "." or ".."';
  if (/[/\\\0]/.test(name)) return 'Name must not contain "/", "\\" or NUL';
  if (name.length > 255) return 'Name must be at most 255 characters';
  return null;
}
