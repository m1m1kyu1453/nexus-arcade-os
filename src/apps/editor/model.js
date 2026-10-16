// @ts-check
// Pure logic of Nexus Edit (no DOM, no CodeMirror): line endings, tab titles, font zoom.

/** @typedef {'LF' | 'CRLF' | 'CR'} Eol */

/**
 * The line ending a text mostly uses (LF for empty or single-line text).
 * @param {string} text
 * @returns {Eol}
 */
export function detectEol(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  if (crlf > lf && crlf >= cr) return 'CRLF';
  if (cr > lf && cr > crlf) return 'CR';
  return 'LF';
}

/**
 * Text as stored, with the chosen line ending (the editor always works with "\n").
 * @param {string} text with \n line breaks
 * @param {Eol} eol
 */
export function withEol(text, eol) {
  if (eol === 'CRLF') return text.replace(/\n/g, '\r\n');
  if (eol === 'CR') return text.replace(/\n/g, '\r');
  return text;
}

/** Next free "Untitled N" for new tabs. @param {string[]} titles @param {string} base */
export function untitledName(titles, base) {
  const taken = new Set(titles);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

export const FONT_SIZES = { min: 10, max: 32, default: 14 };

/** @param {number} size @param {-1 | 0 | 1} step 0 = reset */
export function zoom(size, step) {
  if (step === 0) return FONT_SIZES.default;
  return Math.max(FONT_SIZES.min, Math.min(FONT_SIZES.max, size + step));
}

/** Last path segment. @param {string} path */
export const fileName = (path) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Tab titles that stay unique: equal file names get their parent folder ("a.js — src").
 * @param {{ id: string, path: string | null, untitled: string }[]} tabs
 * @returns {Map<string, string>} tab id → title
 */
export function tabTitles(tabs) {
  /** @type {Map<string, string>} */
  const titles = new Map();
  const counts = new Map();
  for (const tab of tabs) {
    const name = tab.path ? fileName(tab.path) : tab.untitled;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const tab of tabs) {
    const name = tab.path ? fileName(tab.path) : tab.untitled;
    if (tab.path && counts.get(name) > 1) {
      const parent = tab.path.slice(0, tab.path.lastIndexOf('/'));
      titles.set(tab.id, `${name} — ${fileName(parent) || '/'}`);
    } else titles.set(tab.id, name);
  }
  return titles;
}
