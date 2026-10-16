import { describe, expect, it } from 'vitest';
import { applySgr, parseAnsi, plainStyle } from '../../src/apps/terminal/ansi.js';
import { complete, expandHistory, HistoryError, searchHistory } from '../../src/apps/terminal/input.js';

describe('ansi', () => {
  it('splits styled runs and keeps the style across chunks', () => {
    const { runs, style } = parseAnsi('a\x1b[1;31mb\x1b[39mc\x1b[0md\x1b[32m');
    expect(runs.map((r) => [r.text, r.style.fg, r.style.bold])).toEqual([
      ['a', null, false],
      ['b', 1, true],
      ['c', null, true],
      ['d', null, false],
    ]);
    expect(style.fg).toBe(2);
    expect(parseAnsi('x', style).runs[0].style.fg).toBe(2);
  });

  it('handles bright, 256 and RGB colours and drops other escapes', () => {
    expect(applySgr(plainStyle(), [94]).fg).toBe(12);
    expect(applySgr(plainStyle(), [38, 5, 196]).fg).toBe('rgb(255 0 0)');
    expect(applySgr(plainStyle(), [48, 2, 1, 2, 3]).bg).toBe('rgb(1 2 3)');
    expect(
      parseAnsi('a\x1b[2Jb\x1b]0;title\x07c')
        .runs.map((r) => r.text)
        .join(''),
    ).toBe('abc');
  });
});

describe('history', () => {
  const h = ['ls', 'cd Documents', 'cat notes.md'];
  it('expands !!, !n, !-n and !prefix', () => {
    expect(expandHistory('sudo !!', h)).toBe('sudo cat notes.md');
    expect(expandHistory('!1 -la', h)).toBe('ls -la');
    expect(expandHistory('!-2', h)).toBe('cd Documents');
    expect(expandHistory('!ca', h)).toBe('cat notes.md');
    expect(expandHistory("echo 'hi!!' wow!", h)).toBe("echo 'hi!!' wow!");
    expect(() => expandHistory('!9', h)).toThrow(HistoryError);
  });

  it('searches backwards for Ctrl+R', () => {
    expect(searchHistory(h, 'c')).toBe(2);
    expect(searchHistory(h, 'c', 2)).toBe(1);
    expect(searchHistory(h, 'zz')).toBe(-1);
  });
});

describe('completion', () => {
  const tree = {
    '/home/ada': [
      { name: 'Documents', type: 'folder' },
      { name: 'Downloads', type: 'folder' },
      { name: 'my notes.txt', type: 'file' },
      { name: '.hidden', type: 'file' },
    ],
    '/home/ada/Documents': [{ name: 'plan.md', type: 'file' }],
  };
  const env = {
    commands: ['cat', 'cd', 'clear', 'open'],
    apps: ['nexus.files', 'nexus.terminal'],
    kindOf: (c) => ({ cd: 'folder', open: 'app', clear: 'none' })[c],
    list: async (p) => tree[p] ?? [],
    cwd: '/home/ada',
    home: '/home/ada',
  };
  const run = (line) => complete(line, line.length, env);

  it('completes command names first', async () => {
    expect(await run('c')).toMatchObject({ start: 0, candidates: ['cat', 'cd', 'clear'], insert: 'c' });
    expect((await run('cl')).insert).toBe('clear ');
    expect((await run('ls | ca')).insert).toBe('cat ');
  });

  it('completes paths, folders and app ids', async () => {
    expect((await run('cat my')).insert).toBe('my\\ notes.txt ');
    expect((await run('cat D')).candidates).toEqual(['Documents/', 'Downloads/']);
    expect((await run('cat Doc')).insert).toBe('Documents/');
    expect((await run('cat Documents/p')).insert).toBe('Documents/plan.md ');
    expect((await run('cd ')).candidates).toEqual(['Documents/', 'Downloads/']);
    expect((await run('cat .')).candidates).toEqual(['.hidden']);
    expect((await run('open nexus.t')).insert).toBe('nexus.terminal ');
    expect((await run('clear x')).candidates).toEqual([]);
  });
});
