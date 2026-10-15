import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  extname,
  isInside,
  join,
  normalize,
  relative,
  resolveWithin,
  segments,
  validateName,
} from '../../src/services/vfs/path.js';

describe('vfs path utilities', () => {
  it.each([
    ['/', '/'],
    ['//a//b/', '/a/b'],
    ['/a/./b/../c', '/a/c'],
    ['/../../etc', '/etc'],
    ['/a/b/../../..', '/'],
    ['a/../../b', '../b'],
    ['./a/', 'a'],
    ['', '.'],
    ['.', '.'],
  ])('normalize(%j) = %j', (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it('rejects NUL characters', () => {
    expect(() => normalize('/a\0b')).toThrow(/NUL/);
  });

  it('joins and normalizes', () => {
    expect(join('/home/ada', 'Documents', '../Pictures', 'x.png')).toBe('/home/ada/Pictures/x.png');
    expect(join('/a', '')).toBe('/a');
  });

  it('dirname / basename / extname', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b');
    expect(dirname('/a')).toBe('/');
    expect(dirname('/')).toBe('/');
    expect(dirname('file.txt')).toBe('.');
    expect(basename('/a/b/c.md')).toBe('c.md');
    expect(basename('/a/b/c.md', '.md')).toBe('c');
    expect(basename('/a/.md', '.md')).toBe('.md');
    expect(basename('/')).toBe('');
    expect(extname('/a/archive.Tar.GZ')).toBe('.gz');
    expect(extname('/a/.gitignore')).toBe('');
    expect(extname('/a/README')).toBe('');
  });

  it('relative paths between absolute paths', () => {
    expect(relative('/home/ada/Documents', '/home/ada/Pictures/x.png')).toBe('../Pictures/x.png');
    expect(relative('/a', '/a')).toBe('.');
    expect(relative('/', '/a/b')).toBe('a/b');
    expect(relative('/a/b', '/')).toBe('../..');
  });

  it('segments', () => {
    expect(segments('/')).toEqual([]);
    expect(segments('/a/b/')).toEqual(['a', 'b']);
    expect(() => segments('a/b')).toThrow(/absolute/);
  });

  it('isInside does not match sibling prefixes', () => {
    expect(isInside('/home/ada', '/home/ada/x')).toBe(true);
    expect(isInside('/home/ada', '/home/ada')).toBe(true);
    expect(isInside('/home/ada', '/home/adam/x')).toBe(false);
    expect(isInside('/', '/anything')).toBe(true);
  });

  it('resolveWithin blocks .. escapes', () => {
    const base = '/home/ada/Projects/site';
    expect(resolveWithin(base, 'css/app.css')).toBe('/home/ada/Projects/site/css/app.css');
    expect(resolveWithin(base, './a/../b')).toBe('/home/ada/Projects/site/b');
    expect(() => resolveWithin(base, '../../secret')).toThrow(/escapes/);
    expect(() => resolveWithin(base, '/etc/passwd')).toThrow(/escapes/);
    expect(() => resolveWithin(base, 'a/../../site2/x')).toThrow(/escapes/);
  });

  it('validates names', () => {
    expect(validateName('notes.md')).toBeNull();
    for (const bad of ['', '  ', '.', '..', 'a/b', 'a\\b', 'x'.repeat(256)]) {
      expect(validateName(bad), bad).not.toBeNull();
    }
  });
});
