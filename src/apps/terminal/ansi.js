// @ts-check
// ANSI SGR escape codes → styled text runs. The 16 basic colours map to CSS classes that the
// theme colours (so output stays readable in light themes); 256-colour and RGB codes become
// inline colours. Other escape sequences are dropped.

/**
 * @typedef {object} Style
 * @property {number | string | null} fg   0–15 (class) or a CSS colour
 * @property {number | string | null} bg
 * @property {boolean} bold
 * @property {boolean} dim
 * @property {boolean} italic
 * @property {boolean} underline
 * @property {boolean} inverse
 */

/** @returns {Style} */
export const plainStyle = () => ({
  fg: null,
  bg: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
});

/** xterm 256-colour palette entry as CSS (16–255; 0–15 use the theme). @param {number} n */
function color256(n) {
  if (n < 16) return n;
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v} ${v} ${v})`;
  }
  const i = n - 16;
  const level = (/** @type {number} */ x) => (x === 0 ? 0 : 55 + x * 40);
  return `rgb(${level(Math.floor(i / 36))} ${level(Math.floor(i / 6) % 6)} ${level(i % 6)})`;
}

/**
 * Applies SGR parameters to a style.
 * @param {Style} style
 * @param {number[]} codes
 * @returns {Style}
 */
export function applySgr(style, codes) {
  const s = { ...style };
  for (let i = 0; i < codes.length; i++) {
    const c = /** @type {number} */ (codes[i]);
    if (c === 0) Object.assign(s, plainStyle());
    else if (c === 1) s.bold = true;
    else if (c === 2) s.dim = true;
    else if (c === 3) s.italic = true;
    else if (c === 4) s.underline = true;
    else if (c === 7) s.inverse = true;
    else if (c === 22) s.bold = s.dim = false;
    else if (c === 23) s.italic = false;
    else if (c === 24) s.underline = false;
    else if (c === 27) s.inverse = false;
    else if (c >= 30 && c <= 37) s.fg = c - 30;
    else if (c >= 90 && c <= 97) s.fg = c - 90 + 8;
    else if (c === 39) s.fg = null;
    else if (c >= 40 && c <= 47) s.bg = c - 40;
    else if (c >= 100 && c <= 107) s.bg = c - 100 + 8;
    else if (c === 49) s.bg = null;
    else if (c === 38 || c === 48) {
      const key = c === 38 ? 'fg' : 'bg';
      if (codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        s[key] = color256(/** @type {number} */ (codes[i + 2]));
        i += 2;
      } else if (codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        s[key] = `rgb(${codes[i + 2]} ${codes[i + 3]} ${codes[i + 4]})`;
        i += 4;
      }
    }
  }
  return s;
}

/**
 * Splits text with escape codes into styled runs. Returns the style at the end, so a stream
 * of chunks keeps its colours across calls.
 * @param {string} text
 * @param {Style} [start]
 * @returns {{ runs: { text: string, style: Style }[], style: Style }}
 */
export function parseAnsi(text, start = plainStyle()) {
  /** @type {{ text: string, style: Style }[]} */
  const runs = [];
  let style = start;
  let last = 0;
  // ESC [ params letter; other ESC sequences (e.g. ESC ] … BEL) are skipped.
  const re = new RegExp(String.raw`\u001b\[([0-9;]*)([A-Za-z])|\u001b\][^\u0007]*\u0007|\u001b.`, 'g');
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), style });
    last = re.lastIndex;
    if (m[2] === 'm')
      style = applySgr(
        style,
        (m[1] || '0').split(';').map((n) => Number(n) || 0),
      );
  }
  if (last < text.length) runs.push({ text: text.slice(last), style });
  return { runs, style };
}

/**
 * A DOM node for one run (a text node when unstyled).
 * @param {{ text: string, style: Style }} run
 * @returns {Node}
 */
export function runNode({ text, style }) {
  const plain =
    style.fg === null &&
    style.bg === null &&
    !style.bold &&
    !style.dim &&
    !style.italic &&
    !style.underline &&
    !style.inverse;
  if (plain) return document.createTextNode(text);
  const span = document.createElement('span');
  span.textContent = text;
  let { fg, bg } = style;
  // Inverse: the background colour becomes the text colour and vice versa (defaults included).
  if (style.inverse) [fg, bg] = [bg ?? 'bg', fg ?? 'fg'];
  const classes = [];
  if (typeof fg === 'number') classes.push(`nx-ansi-fg${fg}`);
  else if (fg === 'fg') classes.push('nx-ansi-fg-default');
  else if (fg === 'bg') classes.push('nx-ansi-fg-bg');
  else if (fg) span.style.color = fg;
  if (typeof bg === 'number') classes.push(`nx-ansi-bg${bg}`);
  else if (bg === 'fg') classes.push('nx-ansi-bg-fg');
  else if (bg === 'bg') classes.push('nx-ansi-bg-default');
  else if (bg) span.style.backgroundColor = bg;
  if (style.bold) classes.push('nx-ansi-bold');
  if (style.dim) classes.push('nx-ansi-dim');
  if (style.italic) classes.push('nx-ansi-italic');
  if (style.underline) classes.push('nx-ansi-underline');
  span.className = classes.join(' ');
  return span;
}
