import { describe, expect, it } from 'vitest';
import { detectEol, FONT_SIZES, tabTitles, untitledName, withEol, zoom } from '../../src/apps/editor/model.js';

describe('editor model', () => {
  it('detects and restores line endings', () => {
    expect(detectEol('a\nb\n')).toBe('LF');
    expect(detectEol('a\r\nb\r\nc\n')).toBe('CRLF');
    expect(detectEol('a\rb\r')).toBe('CR');
    expect(detectEol('')).toBe('LF');
    expect(withEol('a\nb\n', 'CRLF')).toBe('a\r\nb\r\n');
    expect(withEol('a\nb', 'CR')).toBe('a\rb');
    expect(withEol('a\nb', 'LF')).toBe('a\nb');
  });

  it('names untitled tabs and keeps titles unique', () => {
    expect(untitledName([], 'Untitled')).toBe('Untitled');
    expect(untitledName(['Untitled', 'Untitled 2'], 'Untitled')).toBe('Untitled 3');
    const titles = tabTitles([
      { id: 'a', path: '/h/src/index.js', untitled: '' },
      { id: 'b', path: '/h/test/index.js', untitled: '' },
      { id: 'c', path: '/h/readme.md', untitled: '' },
      { id: 'd', path: null, untitled: 'Untitled' },
    ]);
    expect([...titles.values()]).toEqual(['index.js — src', 'index.js — test', 'readme.md', 'Untitled']);
  });

  it('zooms within limits', () => {
    expect(zoom(14, 1)).toBe(15);
    expect(zoom(FONT_SIZES.max, 1)).toBe(FONT_SIZES.max);
    expect(zoom(FONT_SIZES.min, -1)).toBe(FONT_SIZES.min);
    expect(zoom(20, 0)).toBe(FONT_SIZES.default);
  });
});
