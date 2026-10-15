import { describe, expect, it } from 'vitest';
import { clampCell, findFree, fits, overlaps } from '../../src/shell/widgets/grid.js';

describe('widget grid', () => {
  it('detects overlap only when cells share area', () => {
    const a = { col: 0, row: 0, w: 2, h: 2 };
    expect(overlaps(a, { col: 1, row: 1, w: 2, h: 2 })).toBe(true);
    expect(overlaps(a, { col: 2, row: 0, w: 1, h: 1 })).toBe(false);
    expect(overlaps(a, { col: 0, row: 2, w: 2, h: 1 })).toBe(false);
  });

  it('fits checks bounds and collisions', () => {
    const others = [{ col: 4, row: 0, w: 2, h: 2 }];
    expect(fits({ col: 0, row: 0, w: 2, h: 2 }, others, 6, 4)).toBe(true);
    expect(fits({ col: 3, row: 0, w: 2, h: 2 }, others, 6, 4)).toBe(false);
    expect(fits({ col: 5, row: 3, w: 2, h: 1 }, [], 6, 4)).toBe(false);
    expect(fits({ col: -1, row: 0, w: 1, h: 1 }, [], 6, 4)).toBe(false);
  });

  it('findFree fills from the right edge, top to bottom', () => {
    expect(findFree({ w: 2, h: 2 }, [], 6, 4)).toEqual({ col: 4, row: 0, w: 2, h: 2 });
    const taken = [{ col: 4, row: 0, w: 2, h: 2 }];
    expect(findFree({ w: 2, h: 2 }, taken, 6, 4)).toEqual({ col: 4, row: 2, w: 2, h: 2 });
    expect(findFree({ w: 2, h: 2 }, [...taken, { col: 4, row: 2, w: 2, h: 2 }], 6, 4)).toEqual({
      col: 2,
      row: 0,
      w: 2,
      h: 2,
    });
    expect(findFree({ w: 3, h: 3 }, [], 2, 2)).toBeNull();
  });

  it('clampCell shrinks to the grid but keeps the minimum size when it fits', () => {
    expect(clampCell({ col: 8, row: 5, w: 3, h: 2 }, 6, 4)).toEqual({ col: 3, row: 2, w: 3, h: 2 });
    expect(clampCell({ col: 0, row: 0, w: 9, h: 9 }, 6, 4)).toEqual({ col: 0, row: 0, w: 6, h: 4 });
    expect(clampCell({ col: 0, row: 0, w: 1, h: 1 }, 6, 4, [2, 2])).toEqual({ col: 0, row: 0, w: 2, h: 2 });
    expect(clampCell({ col: 0, row: 0, w: 1, h: 1 }, 1, 1, [2, 2])).toEqual({ col: 0, row: 0, w: 1, h: 1 });
  });
});
