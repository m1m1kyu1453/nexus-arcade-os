// @ts-check
// Widget grid math (pure): cells, overlap, free-spot search, clamping to the visible grid.

/** @typedef {{ col: number, row: number, w: number, h: number }} Cell */

/** @param {Cell} a @param {Cell} b */
export function overlaps(a, b) {
  return a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h;
}

/**
 * True if `cell` lies inside the grid and overlaps none of `others`.
 * @param {Cell} cell
 * @param {Cell[]} others
 * @param {number} cols
 * @param {number} rows
 */
export function fits(cell, others, cols, rows) {
  if (cell.col < 0 || cell.row < 0 || cell.col + cell.w > cols || cell.row + cell.h > rows) return false;
  return !others.some((o) => overlaps(cell, o));
}

/**
 * First free spot for a widget of size w×h, scanning columns from the right edge (desktop icons
 * fill from the left) and rows from the top. Null when the grid is full.
 * @param {{ w: number, h: number }} size
 * @param {Cell[]} others
 * @param {number} cols
 * @param {number} rows
 * @returns {Cell | null}
 */
export function findFree({ w, h }, others, cols, rows) {
  for (let col = cols - w; col >= 0; col--) {
    for (let row = 0; row + h <= rows; row++) {
      const cell = { col, row, w, h };
      if (fits(cell, others, cols, rows)) return cell;
    }
  }
  return null;
}

/**
 * Keeps a widget inside a grid of cols×rows (a smaller window shrinks the grid): size first, then
 * position.
 * @param {Cell} cell
 * @param {number} cols
 * @param {number} rows
 * @param {[number, number]} [minSize]
 * @returns {Cell}
 */
export function clampCell(cell, cols, rows, [minW, minH] = [1, 1]) {
  const w = Math.max(Math.min(minW, cols), Math.min(cell.w, cols));
  const h = Math.max(Math.min(minH, rows), Math.min(cell.h, rows));
  return {
    col: Math.max(0, Math.min(cell.col, cols - w)),
    row: Math.max(0, Math.min(cell.row, rows - h)),
    w,
    h,
  };
}
