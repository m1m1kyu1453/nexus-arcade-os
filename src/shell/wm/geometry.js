// @ts-check
// Window geometry for the window manager: snap zones, snap layouts, keyboard snapping,
// keeping windows visible, cascade placement and snapped neighbours. Pure functions.

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */
/**
 * @typedef {'max' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
 *   | 'third-1' | 'third-2' | 'third-3' | 'two-thirds-left' | 'two-thirds-right'} Zone
 */

export const EDGE = 12; // px from a screen edge that triggers snapping while dragging
export const CORNER = 64; // px along an edge that counts as a corner
export const MIN_VISIBLE = 64; // px of the title bar that must stay on screen

/**
 * Which zone a dragged window's pointer is in (null = no snap).
 * @param {{ x: number, y: number }} p pointer in viewport coordinates
 * @param {Rect} area work area
 * @returns {Zone | null}
 */
export function zoneAt(p, area) {
  const left = p.x <= area.x + EDGE;
  const right = p.x >= area.x + area.w - EDGE;
  const top = p.y <= area.y + EDGE;
  const nearTop = p.y <= area.y + CORNER;
  const nearBottom = p.y >= area.y + area.h - CORNER;
  if (left) return nearTop ? 'top-left' : nearBottom ? 'bottom-left' : 'left';
  if (right) return nearTop ? 'top-right' : nearBottom ? 'bottom-right' : 'right';
  if (top) return 'max';
  return null;
}

/**
 * Rectangle of a zone inside the work area (whole pixels, no gaps between neighbours).
 * @param {Zone} zone
 * @param {Rect} area
 * @returns {Rect}
 */
export function zoneRect(zone, area) {
  const { x, y, w, h } = area;
  const halfW = Math.round(w / 2);
  const halfH = Math.round(h / 2);
  const third = Math.round(w / 3);
  const twoThirds = Math.round((2 * w) / 3);
  switch (zone) {
    case 'max':
      return { x, y, w, h };
    case 'left':
      return { x, y, w: halfW, h };
    case 'right':
      return { x: x + halfW, y, w: w - halfW, h };
    case 'top-left':
      return { x, y, w: halfW, h: halfH };
    case 'top-right':
      return { x: x + halfW, y, w: w - halfW, h: halfH };
    case 'bottom-left':
      return { x, y: y + halfH, w: halfW, h: h - halfH };
    case 'bottom-right':
      return { x: x + halfW, y: y + halfH, w: w - halfW, h: h - halfH };
    case 'third-1':
      return { x, y, w: third, h };
    case 'third-2':
      return { x: x + third, y, w: twoThirds - third, h };
    case 'third-3':
      return { x: x + twoThirds, y, w: w - twoThirds, h };
    case 'two-thirds-left':
      return { x, y, w: twoThirds, h };
    case 'two-thirds-right':
      return { x: x + third, y, w: w - third, h };
    default:
      return { x, y, w, h };
  }
}

/** Layouts offered in the snap layouts menu (hover the maximize button). */
export const SNAP_LAYOUTS = /** @type {const} */ ([
  { id: 'halves', zones: ['left', 'right'] },
  { id: 'thirds', zones: ['third-1', 'third-2', 'third-3'] },
  { id: 'quarters', zones: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] },
  { id: 'two-thirds-third', zones: ['two-thirds-left', 'third-3'] },
  { id: 'third-two-thirds', zones: ['third-1', 'two-thirds-right'] },
]);

/**
 * Keyboard snapping (Mod+Arrows). `null` = restore to normal; 'minimize' = minimize.
 * @param {Zone | null} current  null when not snapped
 * @param {'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'} key
 * @returns {Zone | null | 'minimize'}
 */
export function snapForKey(current, key) {
  switch (key) {
    case 'ArrowLeft':
      if (current === 'right') return null;
      if (current === 'top-right') return 'top-left';
      if (current === 'bottom-right') return 'bottom-left';
      return 'left';
    case 'ArrowRight':
      if (current === 'left') return null;
      if (current === 'top-left') return 'top-right';
      if (current === 'bottom-left') return 'bottom-right';
      return 'right';
    case 'ArrowUp':
      if (current === 'left') return 'top-left';
      if (current === 'right') return 'top-right';
      if (current === 'bottom-left') return 'left';
      if (current === 'bottom-right') return 'right';
      return 'max';
    case 'ArrowDown':
      if (current === 'max') return null;
      if (current === 'left') return 'bottom-left';
      if (current === 'right') return 'bottom-right';
      if (current === 'top-left') return 'left';
      if (current === 'top-right') return 'right';
      return current ? null : 'minimize';
    default:
      return current;
  }
}

/**
 * Keeps a window usable: no bigger than the work area, and enough of the title bar visible
 * to grab it again.
 * @param {Rect} r
 * @param {Rect} area
 * @param {{ minW?: number, minH?: number }} [min]
 * @returns {Rect}
 */
export function clampRect(r, area, { minW = 200, minH = 120 } = {}) {
  const w = Math.max(Math.min(minW, area.w), Math.min(r.w, area.w));
  const h = Math.max(Math.min(minH, area.h), Math.min(r.h, area.h));
  const x = Math.min(Math.max(r.x, area.x - w + MIN_VISIBLE), area.x + area.w - MIN_VISIBLE);
  const y = Math.min(Math.max(r.y, area.y), area.y + area.h - 32);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/**
 * Where a new window goes: centered, cascading 32px from the windows already near there.
 * @param {{ w: number, h: number }} size
 * @param {Rect} area
 * @param {Rect[]} existing
 * @returns {Rect}
 */
export function placeWindow(size, area, existing) {
  const w = Math.min(size.w, area.w - 16);
  const h = Math.min(size.h, area.h - 16);
  let x = Math.round(area.x + (area.w - w) / 2);
  let y = Math.round(area.y + Math.max(8, (area.h - h) / 3));
  for (let i = 0; i < 12 && existing.some((r) => Math.abs(r.x - x) < 8 && Math.abs(r.y - y) < 8); i++) {
    x += 32;
    y += 32;
    if (x + w > area.x + area.w || y + h > area.y + area.h) {
      x = area.x + 16;
      y = area.y + 16;
    }
  }
  return { x, y, w, h };
}

/**
 * Snapped neighbours sharing the edge being resized, so they resize together.
 * @param {Rect} r          the window being resized (before the change)
 * @param {'left' | 'right' | 'top' | 'bottom'} edge
 * @param {{ id: string, rect: Rect }[]} others  other snapped windows on the workspace
 * @returns {string[]} ids whose opposite edge touches this edge
 */
export function sharedEdgeNeighbours(r, edge, others) {
  const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 2;
  const overlapY = (/** @type {Rect} */ o) => o.y < r.y + r.h && o.y + o.h > r.y;
  const overlapX = (/** @type {Rect} */ o) => o.x < r.x + r.w && o.x + o.w > r.x;
  return others
    .filter(({ rect: o }) => {
      switch (edge) {
        case 'right':
          return near(o.x, r.x + r.w) && overlapY(o);
        case 'left':
          return near(o.x + o.w, r.x) && overlapY(o);
        case 'bottom':
          return near(o.y, r.y + r.h) && overlapX(o);
        case 'top':
          return near(o.y + o.h, r.y) && overlapX(o);
        default:
          return false;
      }
    })
    .map((o) => o.id);
}
