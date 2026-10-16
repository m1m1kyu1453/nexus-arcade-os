// @ts-check
// Pure logic of the File Explorer (no DOM): sorting, paths, history, selection ranges and
// type-ahead. Kept separate so it can be unit-tested.

/**
 * @typedef {object} Item  what the views show (a VFS node, plus trash info in the trash)
 * @property {string} path
 * @property {string} name
 * @property {'file' | 'folder'} type
 * @property {string} mime
 * @property {number} size
 * @property {number} modified
 * @property {number} created
 * @property {string[]} tags
 * @property {{ at: number, originalPath: string }} [trash]
 */

/** @typedef {'name' | 'size' | 'type' | 'modified'} SortKey */

export const TRASH = '/.trash';

/** Display name of a trashed item (the trash stores it as "<id>-<name>"). @param {Item} item */
export function displayName(item) {
  if (item.trash) return item.trash.originalPath.split('/').pop() ?? item.name;
  return item.name;
}

/** @param {string} name */
export function extension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * Folders first, then by the key; name is the tie-breaker. Natural ("file 2" < "file 10").
 * @param {Item[]} items
 * @param {{ key: SortKey, desc?: boolean }} sort
 * @param {string} [locale]
 */
export function sortItems(items, { key, desc = false }, locale) {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const byName = (/** @type {Item} */ a, /** @type {Item} */ b) => collator.compare(displayName(a), displayName(b));
  /** @type {(a: Item, b: Item) => number} */
  const compare =
    key === 'size'
      ? (a, b) => a.size - b.size
      : key === 'modified'
        ? (a, b) => a.modified - b.modified
        : key === 'type'
          ? (a, b) => collator.compare(extension(a.name), extension(b.name))
          : () => 0;
  const sign = desc ? -1 : 1;
  return [...items].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return sign * (compare(a, b) || byName(a, b));
  });
}

/**
 * Breadcrumb parts; the home folder is shown as one crumb ("~").
 * @param {string} path
 * @param {string} home
 * @returns {{ name: string, path: string, home?: boolean, trash?: boolean }[]}
 */
export function crumbs(path, home) {
  if (path === TRASH || path.startsWith(`${TRASH}/`)) {
    const rest = path.slice(TRASH.length).split('/').filter(Boolean);
    return [{ name: 'trash', path: TRASH, trash: true }, ...partsFrom(TRASH, rest)];
  }
  if (path === home || path.startsWith(`${home}/`)) {
    const rest = path.slice(home.length).split('/').filter(Boolean);
    return [{ name: '~', path: home, home: true }, ...partsFrom(home, rest)];
  }
  return [{ name: '/', path: '/' }, ...partsFrom('', path.split('/').filter(Boolean))];
}

/** @param {string} base @param {string[]} parts */
function partsFrom(base, parts) {
  return parts.map((name, i) => ({ name, path: `${base}/${parts.slice(0, i + 1).join('/')}` }));
}

/** Resolves what the user typed into the path bar (see ui/paths.js). */
export { parentOf, resolvePath as resolveInput } from '../../ui/paths.js';

/** Back/forward navigation history. */
export class History {
  /** @param {string} start */
  constructor(start) {
    /** @type {string[]} */
    this.stack = [start];
    this.index = 0;
  }
  get current() {
    return /** @type {string} */ (this.stack[this.index]);
  }
  /** @param {string} path */
  push(path) {
    if (path === this.current) return;
    this.stack = [...this.stack.slice(0, this.index + 1), path].slice(-100);
    this.index = this.stack.length - 1;
  }
  get canBack() {
    return this.index > 0;
  }
  get canForward() {
    return this.index < this.stack.length - 1;
  }
  back() {
    if (this.canBack) this.index--;
    return this.current;
  }
  forward() {
    if (this.canForward) this.index++;
    return this.current;
  }
  /** After a folder was renamed/moved, keep the history pointing at the new paths. @param {string} from @param {string} to */
  rewrite(from, to) {
    this.stack = this.stack.map((p) => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p));
  }
}

/**
 * Paths from `anchor` to `target` in display order (Shift-click / Shift+arrows).
 * @param {string[]} order
 * @param {string} anchor
 * @param {string} target
 */
export function rangeBetween(order, anchor, target) {
  const a = order.indexOf(anchor);
  const b = order.indexOf(target);
  if (a < 0 || b < 0) return [target];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return order.slice(from, to + 1);
}

/**
 * Type-ahead: the next name starting with `query` (case-insensitive), searching from `from`
 * (inclusive) and wrapping around. Typing the same letter repeatedly cycles through matches.
 * @param {string[]} names in display order
 * @param {string} query
 * @param {number} from
 * @param {string} [locale]
 * @returns {number} index, or -1
 */
export function typeAhead(names, query, from, locale) {
  if (!names.length || !query) return -1;
  const q = query.toLocaleLowerCase(locale);
  const repeated = q.length > 1 && [...q].every((c) => c === q[0]);
  const needle = repeated ? /** @type {string} */ (q[0]) : q;
  const start = repeated ? from + 1 : from;
  for (let k = 0; k < names.length; k++) {
    const i = (((start + k) % names.length) + names.length) % names.length;
    if (/** @type {string} */ (names[i]).toLocaleLowerCase(locale).startsWith(needle)) return i;
  }
  return -1;
}

/**
 * Human-readable size with binary steps and locale formatting ("1.5 MB").
 * @param {number} bytes
 * @param {(n: number, options?: Intl.NumberFormatOptions) => string} formatNumber
 */
export function formatSize(bytes, formatNumber) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${formatNumber(value, { maximumFractionDigits: digits })} ${units[unit]}`;
}

/**
 * What kind of preview a file gets.
 * @param {{ mime: string, name: string, size: number }} file
 * @returns {'image' | 'markdown' | 'text' | 'audio' | 'video' | 'pdf' | 'none'}
 */
export function previewKind({ mime, name, size }) {
  if (mime === 'image/svg+xml') return 'image';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/markdown') return 'markdown';
  const textual =
    mime.startsWith('text/') || /json|xml|yaml|javascript|typescript|x-sh|sql/.test(mime) || name.startsWith('.');
  if (textual) return size > 2_000_000 ? 'none' : 'text';
  return 'none';
}
