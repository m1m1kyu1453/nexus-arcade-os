// @ts-check
// Pure input helpers for the terminal: history expansion (!!, !n, !-n, !prefix), reverse
// history search (Ctrl+R) and Tab completion of commands, app ids and paths.
import { resolvePath } from '../../ui/paths.js';

export class HistoryError extends Error {
  name = 'HistoryError';
}

/**
 * Expands history references outside single quotes.
 * @param {string} line
 * @param {string[]} history oldest first
 * @returns {string}
 */
export function expandHistory(line, history) {
  let out = '';
  let single = false;
  for (let i = 0; i < line.length; i++) {
    const c = /** @type {string} */ (line[i]);
    if (c === "'" && line[i - 1] !== '\\') single = !single;
    if (c !== '!' || single || line[i - 1] === '\\') {
      out += c;
      continue;
    }
    const rest = line.slice(i + 1);
    let m;
    if (rest.startsWith('!')) {
      out += pick(history, history.length, '!!');
      i += 1;
    } else if ((m = /^-(\d+)/.exec(rest))) {
      out += pick(history, history.length - Number(m[1]) + 1, `!-${m[1]}`);
      i += m[0].length;
    } else if ((m = /^\d+/.exec(rest))) {
      out += pick(history, Number(m[0]), `!${m[0]}`);
      i += m[0].length;
    } else if ((m = /^[A-Za-z_][\w.-]*/.exec(rest))) {
      const prefix = m[0];
      const found = [...history].reverse().find((h) => h.startsWith(prefix));
      if (found === undefined) throw new HistoryError(`!${prefix}: event not found`);
      out += found;
      i += prefix.length;
    } else out += c; // a lone "!" (e.g. "echo hi!") stays
  }
  return out;
}

/** @param {string[]} history @param {number} n 1-based @param {string} ref */
function pick(history, n, ref) {
  const entry = history[n - 1];
  if (entry === undefined) throw new HistoryError(`${ref}: event not found`);
  return entry;
}

/**
 * Ctrl+R: the newest entry containing `query`, searching backwards from `before` (exclusive).
 * @param {string[]} history
 * @param {string} query
 * @param {number} [before]
 * @returns {number} index, or -1
 */
export function searchHistory(history, query, before = history.length) {
  if (!query) return -1;
  for (let i = Math.min(before, history.length) - 1; i >= 0; i--) if (history[i]?.includes(query)) return i;
  return -1;
}

/**
 * @typedef {object} CompletionEnv
 * @property {string[]} commands            command names and aliases
 * @property {string[]} apps                app ids (for `open`)
 * @property {(name: string) => string | undefined} kindOf  what a command's arguments are
 * @property {(path: string) => Promise<{ name: string, type: string }[]>} list
 * @property {string} cwd
 * @property {string} home
 */

/**
 * Completes the word before `cursor`.
 * @param {string} line
 * @param {number} cursor
 * @param {CompletionEnv} env
 * @returns {Promise<{ start: number, candidates: string[], insert: string }>}
 *   candidates as shown in a list; `insert` replaces line[start..cursor] (common prefix,
 *   plus "/" or " " when there is exactly one match)
 */
export async function complete(line, cursor, env) {
  const before = line.slice(0, cursor);
  // Start of the current word: after the last unescaped space or shell operator.
  let start = 0;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (c === '\\') i++;
    else if (c === ' ' || c === '|' || c === ';' || c === '&' || c === '>' || c === '<') start = i + 1;
  }
  const word = unescape(before.slice(start));
  const head = before.slice(0, start).trimEnd();
  const firstWord = head === '' || /(\|\||&&|[|;])$/.test(head);
  const command = firstWord ? '' : (/(?:^|\|\||&&|[|;])\s*([^\s|;&]+)[^|;&]*$/.exec(head)?.[1] ?? '');
  const kind = firstWord ? 'command' : (env.kindOf(command) ?? 'path');

  /** @type {{ text: string, folder: boolean }[]} */
  let matches = [];
  if (kind === 'command')
    matches = env.commands.filter((c) => c.startsWith(word)).map((text) => ({ text, folder: false }));
  else if (kind !== 'none') {
    if (kind === 'app') matches = env.apps.filter((a) => a.startsWith(word)).map((text) => ({ text, folder: false }));
    matches.push(...(await pathMatches(word, env, kind === 'folder')));
  }
  matches = [...new Map(matches.map((m) => [m.text, m])).values()].sort((a, b) => a.text.localeCompare(b.text));
  if (!matches.length) return { start, candidates: [], insert: escape(word) };

  const texts = matches.map((m) => m.text);
  let common = commonPrefix(texts);
  if (matches.length === 1) common += matches[0]?.folder ? '' : ' ';
  return {
    start,
    candidates: texts.map((t) => t.slice(t.lastIndexOf('/', t.length - 2) + 1)),
    insert: escape(common.endsWith(' ') ? common.slice(0, -1) : common) + (common.endsWith(' ') ? ' ' : ''),
  };
}

/**
 * @param {string} word what was typed (unescaped)
 * @param {CompletionEnv} env
 * @param {boolean} foldersOnly
 */
async function pathMatches(word, env, foldersOnly) {
  const slash = word.lastIndexOf('/');
  const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
  const prefix = word.slice(slash + 1);
  const dir = dirPart ? resolvePath(dirPart, env.cwd, env.home) : env.cwd;
  const entries = await env.list(dir).catch(() => []);
  return entries
    .filter((e) => e.name.startsWith(prefix) && (prefix.startsWith('.') || !e.name.startsWith('.')))
    .filter((e) => !foldersOnly || e.type === 'folder')
    .map((e) => ({ text: `${dirPart}${e.name}${e.type === 'folder' ? '/' : ''}`, folder: e.type === 'folder' }));
}

/** @param {string[]} list */
function commonPrefix(list) {
  let prefix = /** @type {string} */ (list[0]);
  for (const s of list) while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/** Backslash-escapes characters the shell would treat specially. @param {string} s */
const escape = (s) => s.replace(/([\s'"\\$|&;<>()*?[\]#!])/g, '\\$1');
/** @param {string} s */
const unescape = (s) => s.replace(/\\(.)/g, '$1');
