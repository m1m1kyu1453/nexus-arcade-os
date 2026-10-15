// @ts-check
// Color math for themes: hex parsing, mixing, WCAG relative luminance and contrast ratio.

/**
 * @param {string} hex '#rgb' or '#rrggbb'
 * @returns {[number, number, number]} 0–255
 */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a hex color: ${hex}`);
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** @param {[number, number, number]} rgb */
export function toHex([r, g, b]) {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * Linear mix: t = 0 → a, t = 1 → b.
 * @param {string} a
 * @param {string} b
 * @param {number} t
 */
export function mix(a, b, t) {
  const x = parseHex(a);
  const y = parseHex(b);
  return toHex(/** @type {[number, number, number]} */ (x.map((v, i) => v + (y[i] - v) * t)));
}

/** @param {string} hex @param {number} alpha 0–1 */
export function rgba(hex, alpha) {
  const [r, g, b] = parseHex(hex);
  return `rgb(${r} ${g} ${b} / ${Math.round(alpha * 1000) / 1000})`;
}

/** WCAG 2 relative luminance. @param {string} hex */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. @param {string} a @param {string} b */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white text, whichever reads better on `background`.
 * @param {string} background
 */
export function readableOn(background) {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff') ? '#000000' : '#ffffff';
}

/**
 * Moves `color` towards white or black (whichever increases contrast) until it reaches
 * `minRatio` against `background`. Returns the original if already sufficient.
 * @param {string} color
 * @param {string} background
 * @param {number} minRatio
 */
export function ensureContrast(color, background, minRatio) {
  if (contrastRatio(color, background) >= minRatio) return color;
  const target = luminance(background) < 0.5 ? '#ffffff' : '#000000';
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(color, target, t);
    if (contrastRatio(candidate, background) >= minRatio) return candidate;
  }
  return target;
}
