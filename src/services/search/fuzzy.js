// @ts-check
// Fuzzy matching with ranking tiers: exact > prefix > word start > substring > fuzzy
// subsequence. Case- and diacritic-insensitive ("uber" finds "Über"). Returns the matched
// character ranges for highlighting.

/** @typedef {[number, number]} Range  [start, end) in the original text */

export const TIER = /** @type {const} */ ({ exact: 1000, prefix: 800, wordStart: 600, substring: 400, fuzzy: 200 });

/**
 * Lower-cases and strips diacritics while keeping a 1:1 index mapping to the original text
 * (each original character maps to exactly one folded character).
 * @param {string} text
 */
export function fold(text) {
  let out = '';
  for (const ch of text) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const folded = (base || ch).toLowerCase();
    // Keep length stable: multi-char expansions (e.g. 'ß' → 'ss' in some engines) are truncated.
    out += folded.length === ch.length ? folded : folded.slice(0, ch.length).padEnd(ch.length, ' ');
  }
  return out;
}

const isWordStart = (/** @type {string} */ text, /** @type {number} */ i) =>
  i === 0 || /[\s\-_./()[\]:]/.test(text[i - 1]) || (/[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i]));

/** @param {number[]} positions @returns {Range[]} */
function toRanges(positions) {
  /** @type {Range[]} */
  const ranges = [];
  for (const p of positions) {
    const last = ranges.at(-1);
    if (last && last[1] === p) last[1] = p + 1;
    else ranges.push([p, p + 1]);
  }
  return ranges;
}

/**
 * @param {string} query
 * @param {string} text
 * @returns {{ score: number, ranges: Range[] } | null}
 */
export function fuzzyMatch(query, text) {
  const q = fold(query.trim());
  if (!q || !text) return null;
  const t = fold(text);
  if (t === q) return { score: TIER.exact, ranges: [[0, text.length]] };
  if (t.startsWith(q)) return { score: TIER.prefix - (t.length - q.length) * 0.1, ranges: [[0, q.length]] };

  // Word-start: the query starts a word, or matches word initials ("nc" → "Nexus Code").
  for (let i = 1; i < t.length; i++) {
    if (isWordStart(text, i) && t.startsWith(q, i)) {
      return { score: TIER.wordStart - i * 0.5, ranges: [[i, i + q.length]] };
    }
  }
  const initials = [];
  for (let i = 0; i < t.length && initials.length < q.length; i++) {
    if (isWordStart(text, i) && t[i] === q[initials.length]) initials.push(i);
  }
  if (initials.length === q.length && q.length > 1) return { score: TIER.wordStart - 50, ranges: toRanges(initials) };

  const at = t.indexOf(q);
  if (at !== -1) return { score: TIER.substring - at * 0.5, ranges: [[at, at + q.length]] };

  // Subsequence: every query character in order; fewer, shorter gaps score higher.
  /** @type {number[]} */
  const positions = [];
  let from = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const i = t.indexOf(ch, from);
    if (i === -1) return null;
    positions.push(i);
    from = i + 1;
  }
  let gaps = 0;
  for (let i = 1; i < positions.length; i++) gaps += positions[i] - positions[i - 1] - 1;
  const bonus = positions.filter((p) => isWordStart(text, p)).length * 10;
  const score = TIER.fuzzy - gaps * 5 - positions[0] + bonus;
  return score > 0 ? { score, ranges: toRanges(positions) } : null;
}
