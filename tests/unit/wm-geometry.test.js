import { describe, expect, it } from 'vitest';
import {
  clampRect,
  placeWindow,
  sharedEdgeNeighbours,
  SNAP_LAYOUTS,
  snapForKey,
  zoneAt,
  zoneRect,
} from '../../src/shell/wm/geometry.js';

const area = { x: 0, y: 32, w: 1200, h: 768 };

describe('window geometry', () => {
  it('detects snap zones at edges and corners', () => {
    expect(zoneAt({ x: 600, y: 400 }, area)).toBeNull();
    expect(zoneAt({ x: 2, y: 400 }, area)).toBe('left');
    expect(zoneAt({ x: 1199, y: 400 }, area)).toBe('right');
    expect(zoneAt({ x: 600, y: 33 }, area)).toBe('max');
    expect(zoneAt({ x: 2, y: 40 }, area)).toBe('top-left');
    expect(zoneAt({ x: 1199, y: 790 }, area)).toBe('bottom-right');
  });

  it('tiles zones without gaps or overlaps', () => {
    for (const layout of SNAP_LAYOUTS) {
      const rects = layout.zones.map((z) => zoneRect(z, area));
      const total = rects.reduce((sum, r) => sum + r.w * r.h, 0);
      expect(total, layout.id).toBe(area.w * area.h);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(area.x);
        expect(r.y).toBeGreaterThanOrEqual(area.y);
        expect(r.x + r.w).toBeLessThanOrEqual(area.x + area.w);
        expect(r.y + r.h).toBeLessThanOrEqual(area.y + area.h);
      }
    }
    expect(zoneRect('left', { x: 0, y: 0, w: 1001, h: 500 })).toEqual({ x: 0, y: 0, w: 501, h: 500 });
    expect(zoneRect('right', { x: 0, y: 0, w: 1001, h: 500 })).toEqual({ x: 501, y: 0, w: 500, h: 500 });
  });

  it('snaps with the keyboard like Windows', () => {
    expect(snapForKey(null, 'ArrowLeft')).toBe('left');
    expect(snapForKey('left', 'ArrowRight')).toBeNull();
    expect(snapForKey('left', 'ArrowUp')).toBe('top-left');
    expect(snapForKey('top-left', 'ArrowRight')).toBe('top-right');
    expect(snapForKey('top-right', 'ArrowDown')).toBe('right');
    expect(snapForKey(null, 'ArrowUp')).toBe('max');
    expect(snapForKey('max', 'ArrowDown')).toBeNull();
    expect(snapForKey(null, 'ArrowDown')).toBe('minimize');
  });

  it('keeps windows grabbable and within the work area', () => {
    expect(clampRect({ x: -2000, y: -50, w: 800, h: 600 }, area)).toEqual({ x: -736, y: 32, w: 800, h: 600 });
    expect(clampRect({ x: 5000, y: 5000, w: 800, h: 600 }, area)).toEqual({ x: 1136, y: 768, w: 800, h: 600 });
    expect(clampRect({ x: 0, y: 32, w: 3000, h: 3000 }, area)).toMatchObject({ w: 1200, h: 768 });
    expect(clampRect({ x: 10, y: 40, w: 50, h: 30 }, area)).toMatchObject({ w: 200, h: 120 });
  });

  it('cascades new windows', () => {
    const first = placeWindow({ w: 600, h: 400 }, area, []);
    const second = placeWindow({ w: 600, h: 400 }, area, [first]);
    expect(second).toEqual({ ...first, x: first.x + 32, y: first.y + 32 });
    expect(placeWindow({ w: 5000, h: 5000 }, area, [])).toMatchObject({ w: 1184, h: 752 });
  });

  it('finds snapped neighbours sharing an edge', () => {
    const left = zoneRect('left', area);
    const others = [
      { id: 'tr', rect: zoneRect('top-right', area) },
      { id: 'br', rect: zoneRect('bottom-right', area) },
      { id: 'elsewhere', rect: { x: 50, y: 50, w: 100, h: 100 } },
    ];
    expect(sharedEdgeNeighbours(left, 'right', others)).toEqual(['tr', 'br']);
    expect(sharedEdgeNeighbours(zoneRect('top-right', area), 'bottom', others)).toEqual(['br']);
    expect(sharedEdgeNeighbours(left, 'left', others)).toEqual([]);
  });
});
