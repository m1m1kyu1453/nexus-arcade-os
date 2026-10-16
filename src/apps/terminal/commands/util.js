// @ts-check
// Helpers shared by the built-in commands: option parsing, ANSI colours, columns.

export class UsageError extends Error {
  name = 'UsageError';
}

/**
 * Parses Unix-style options. `spec` maps short and long names to an option key; keys listed
 * in `values` take a value ("-n 5", "-n5", "--lines=5", "--lines 5"). "--" ends options.
 * A lone number like "-5" counts as `-n 5` when `numberAs` is set (head -5).
 * @param {string[]} args
 * @param {{ flags?: Record<string, string>, values?: Record<string, string>, numberAs?: string }} spec
 * @returns {{ opts: Record<string, string | boolean>, rest: string[] }}
 */
export function parseArgs(args, { flags = {}, values = {}, numberAs } = {}) {
  /** @type {Record<string, string | boolean>} */
  const opts = {};
  /** @type {string[]} */
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const arg = /** @type {string} */ (args[i]);
    if (arg === '--') {
      rest.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith('--') && arg.length > 2) {
      const [name, inline] = /** @type {[string, string | undefined]} */ (arg.slice(2).split(/=(.*)/s, 2));
      if (values[name]) {
        const value = inline ?? args[++i];
        if (value === undefined) throw new UsageError(`option --${name} needs a value`);
        opts[/** @type {string} */ (values[name])] = value;
      } else if (flags[name]) opts[/** @type {string} */ (flags[name])] = true;
      else throw new UsageError(`unknown option --${name}`);
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      if (numberAs && /^-\d+$/.test(arg)) {
        opts[numberAs] = arg.slice(1);
        continue;
      }
      for (let j = 1; j < arg.length; j++) {
        const c = /** @type {string} */ (arg[j]);
        if (values[c]) {
          const value = arg.slice(j + 1) || args[++i];
          if (value === undefined) throw new UsageError(`option -${c} needs a value`);
          opts[/** @type {string} */ (values[c])] = value;
          break;
        }
        if (!flags[c]) throw new UsageError(`unknown option -${c}`);
        opts[/** @type {string} */ (flags[c])] = true;
      }
      continue;
    }
    rest.push(arg);
  }
  return { opts, rest };
}

/** ANSI colour helpers (SGR). The terminal maps them to theme colours. */
export const ansi = {
  bold: (/** @type {string} */ s) => `\x1b[1m${s}\x1b[22m`,
  dim: (/** @type {string} */ s) => `\x1b[2m${s}\x1b[22m`,
  red: (/** @type {string} */ s) => `\x1b[31m${s}\x1b[39m`,
  green: (/** @type {string} */ s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (/** @type {string} */ s) => `\x1b[33m${s}\x1b[39m`,
  blue: (/** @type {string} */ s) => `\x1b[34m${s}\x1b[39m`,
  magenta: (/** @type {string} */ s) => `\x1b[35m${s}\x1b[39m`,
  cyan: (/** @type {string} */ s) => `\x1b[36m${s}\x1b[39m`,
};

// Matching the ESC control character is the point here.
// eslint-disable-next-line no-control-regex
const ANSI_SGR = /\x1b\[[0-9;]*m/g;

/** Removes ANSI escape codes (for measuring and for piped output). @param {string} s */
export const stripAnsi = (s) => s.replace(ANSI_SGR, '');

/**
 * Lays out names in columns that fit `width` characters (like `ls` on a terminal).
 * @param {string[]} cells may contain ANSI codes
 * @param {number} width
 */
export function columns(cells, width) {
  if (!cells.length) return '';
  const widths = cells.map((c) => stripAnsi(c).length);
  // Fewest rows whose columns (each as wide as its longest cell, plus 2) fit the width.
  let rows = 1;
  /** @type {number[]} */
  let colWidths = [];
  for (; rows <= cells.length; rows++) {
    const cols = Math.ceil(cells.length / rows);
    colWidths = [...Array(cols)].map((_, c) => Math.max(...widths.slice(c * rows, c * rows + rows)) + 2);
    if (colWidths.reduce((a, b) => a + b, 0) - 2 <= width) break;
  }
  const lines = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < colWidths.length; c++) {
      const i = c * rows + r;
      if (i >= cells.length) continue;
      line += cells[i] + ' '.repeat(/** @type {number} */ (colWidths[c]) - /** @type {number} */ (widths[i]));
    }
    lines.push(line.trimEnd());
  }
  return `${lines.join('\n')}\n`;
}

/** Human-readable size (1.5K, 20M) like `ls -h`. @param {number} bytes */
export function shortSize(bytes) {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return u === 0 ? `${v}` : `${v < 10 ? v.toFixed(1) : Math.round(v)}${units[u]}`;
}

/** Text lines without the final newline's empty entry. @param {string} text */
export function lines(text) {
  const all = text.split('\n');
  if (all.at(-1) === '') all.pop();
  return all;
}

/** Joins lines back with a final newline (empty input stays empty). @param {string[]} list */
export const unlines = (list) => (list.length ? `${list.join('\n')}\n` : '');

/** Pads to a width counting visible characters only. @param {string} s @param {number} n */
export const padEnd = (s, n) => s + ' '.repeat(Math.max(0, n - stripAnsi(s).length));
/** @param {string} s @param {number} n */
export const padStart = (s, n) => ' '.repeat(Math.max(0, n - stripAnsi(s).length)) + s;
