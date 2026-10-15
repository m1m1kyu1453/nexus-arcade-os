// @ts-check
// Deterministic identicon avatars: a 5×5 mirrored grid derived from a seed string (FNV-1a hash).

/** @param {string} text */
export function hash32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Cells of the 5×5 grid (true = filled). Columns 3–4 mirror 1–0, so it's symmetric.
 * @param {string} seed
 * @returns {boolean[][]}
 */
export function identiconGrid(seed) {
  let bits = hash32(seed);
  /** @type {boolean[][]} */
  const rows = [];
  for (let y = 0; y < 5; y++) {
    const left = [];
    for (let x = 0; x < 3; x++) {
      left.push((bits & 1) === 1);
      bits = bits >>> 1 || hash32(`${seed}:${y}:${x}`);
    }
    rows.push([left[0], left[1], left[2], left[1], left[0]]);
  }
  // Never empty: fill the centre if the hash produced nothing.
  if (!rows.some((r) => r.some(Boolean))) rows[2][2] = true;
  return rows;
}

/**
 * @param {string} seed
 * @param {string} color CSS color for filled cells
 * @param {string} [background]
 * @returns {string} SVG markup (no user text inside, safe to inline)
 */
export function identiconSvg(seed, color, background = 'transparent') {
  const cells = identiconGrid(seed)
    .flatMap((row, y) => row.map((on, x) => (on ? `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>` : '')))
    .join('');
  const safeColor = /^#[0-9a-f]{3,8}$/i.test(color) ? color : '#3ef0ff';
  const safeBg = background === 'transparent' || /^#[0-9a-f]{3,8}$/i.test(background) ? background : 'transparent';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 7" shape-rendering="crispEdges"><rect width="7" height="7" fill="${safeBg}"/><g fill="${safeColor}">${cells}</g></svg>`;
}
