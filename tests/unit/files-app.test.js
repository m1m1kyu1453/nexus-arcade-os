import { describe, expect, it } from 'vitest';
import {
  crumbs,
  displayName,
  formatSize,
  History,
  previewKind,
  rangeBetween,
  resolveInput,
  sortItems,
  typeAhead,
} from '../../src/apps/files/model.js';
import * as ops from '../../src/apps/files/ops.js';
import { createEventBus } from '../../src/kernel/bus.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { createVfs, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';

const item = (name, type = 'file', extra = {}) => ({
  path: `/d/${name}`,
  name,
  type,
  mime: '',
  size: 0,
  modified: 0,
  created: 0,
  tags: [],
  ...extra,
});

describe('files model', () => {
  it('sorts folders first, naturally, by any column in both directions', () => {
    const items = [
      item('file 10.txt', 'file', { size: 5, modified: 3 }),
      item('b', 'folder'),
      item('file 2.md', 'file', { size: 50, modified: 1 }),
      item('a', 'folder'),
    ];
    const names = (list) => list.map((i) => i.name);
    expect(names(sortItems(items, { key: 'name' }))).toEqual(['a', 'b', 'file 2.md', 'file 10.txt']);
    expect(names(sortItems(items, { key: 'name', desc: true }))).toEqual(['b', 'a', 'file 10.txt', 'file 2.md']);
    expect(names(sortItems(items, { key: 'size', desc: true })).slice(2)).toEqual(['file 2.md', 'file 10.txt']);
    expect(names(sortItems(items, { key: 'modified' })).slice(2)).toEqual(['file 2.md', 'file 10.txt']);
    expect(names(sortItems(items, { key: 'type' })).slice(2)).toEqual(['file 2.md', 'file 10.txt']);
  });

  it('shows trashed items under their original name', () => {
    expect(displayName(item('abc-notes.md', 'file', { trash: { at: 1, originalPath: '/h/notes.md' } }))).toBe(
      'notes.md',
    );
  });

  it('builds breadcrumbs relative to home, root and trash', () => {
    expect(crumbs('/home/ada/Documents/x', '/home/ada').map((c) => c.path)).toEqual([
      '/home/ada',
      '/home/ada/Documents',
      '/home/ada/Documents/x',
    ]);
    expect(crumbs('/system/a', '/home/ada').map((c) => c.name)).toEqual(['/', 'system', 'a']);
    expect(crumbs('/', '/home/ada')).toEqual([{ name: '/', path: '/' }]);
    expect(crumbs('/.trash', '/home/ada')[0]).toMatchObject({ trash: true });
  });

  it('resolves typed paths', () => {
    expect(resolveInput('~/Music', '/x', '/home/ada')).toBe('/home/ada/Music');
    expect(resolveInput('../b/./c', '/home/ada/a', '/home/ada')).toBe('/home/ada/b/c');
    expect(resolveInput('a\\b', '/', '/home/ada')).toBe('/a/b');
    expect(resolveInput('/../..', '/x', '/h')).toBe('/');
    expect(resolveInput('  ', '/x', '/h')).toBe('/x');
  });

  it('keeps back/forward history and rewrites renamed folders', () => {
    const h = new History('/a');
    h.push('/a/b');
    h.push('/a/b/c');
    expect(h.back()).toBe('/a/b');
    expect(h.canForward).toBe(true);
    h.push('/z');
    expect(h.canForward).toBe(false);
    h.rewrite('/a', '/q');
    expect(h.stack).toEqual(['/q', '/q/b', '/z']);
  });

  it('selects ranges and finds type-ahead matches', () => {
    expect(rangeBetween(['a', 'b', 'c', 'd'], 'c', 'a')).toEqual(['a', 'b', 'c']);
    const names = ['Apple', 'banana', 'Berry', 'cherry'];
    expect(typeAhead(names, 'b', 0)).toBe(1);
    expect(typeAhead(names, 'be', 0)).toBe(2);
    expect(typeAhead(names, 'bb', 1)).toBe(2); // repeated letter cycles
    expect(typeAhead(names, 'bb', 2)).toBe(1);
    expect(typeAhead(names, 'x', 0)).toBe(-1);
  });

  it('formats sizes and picks previews', () => {
    const n = (v, o) => new Intl.NumberFormat('en', o).format(v);
    expect(formatSize(0, n)).toBe('0 B');
    expect(formatSize(1536, n)).toBe('1.5 KB');
    expect(formatSize(5 * 1024 ** 3, n)).toBe('5 GB');
    expect(previewKind({ mime: 'text/markdown', name: 'a.md', size: 1 })).toBe('markdown');
    expect(previewKind({ mime: 'application/json', name: 'a.json', size: 1 })).toBe('text');
    expect(previewKind({ mime: 'text/plain', name: 'big.log', size: 9e6 })).toBe('none');
    expect(previewKind({ mime: 'image/png', name: 'a.png', size: 1 })).toBe('image');
    expect(previewKind({ mime: 'application/pdf', name: 'a.pdf', size: 1 })).toBe('pdf');
    expect(previewKind({ mime: 'application/octet-stream', name: 'a.bin', size: 1 })).toBe('none');
  });
});

describe('files operations with undo', () => {
  async function setup() {
    const db = await createIdbEngine().open('profile', VFS_STORE_SCHEMA);
    const vfs = createVfs({ db, bus: createEventBus(), user: 'ada' });
    await vfs.init();
    await vfs.writeFile('/home/ada/Documents/a.txt', 'A');
    await vfs.mkdir('/home/ada/Documents/dir');
    await vfs.writeFile('/home/ada/Documents/dir/b.txt', 'B');
    return vfs;
  }
  const D = '/home/ada/Documents';

  it('creates and undoes', async () => {
    const vfs = await setup();
    const { path, undo } = await ops.createNew(vfs, D, 'New folder', 'folder');
    const second = await ops.createNew(vfs, D, 'New folder', 'folder');
    expect([path, second.path]).toEqual([`${D}/New folder`, `${D}/New folder (2)`]);
    await undo.run();
    expect(await vfs.exists(path)).toBe(false);
  });

  it('renames and undoes', async () => {
    const vfs = await setup();
    const { path, undo } = await ops.rename(vfs, `${D}/a.txt`, 'c.txt');
    expect(path).toBe(`${D}/c.txt`);
    await undo.run();
    expect(await vfs.readText(`${D}/a.txt`)).toBe('A');
    expect((await ops.rename(vfs, `${D}/a.txt`, 'a.txt')).undo).toBeNull();
  });

  it('copies (with unique names) and moves, and undoes both', async () => {
    const vfs = await setup();
    const copy = await ops.transfer(vfs, [`${D}/a.txt`, `${D}/dir`], D, 'copy');
    expect(copy.paths).toEqual([`${D}/a (2).txt`, `${D}/dir (2)`]);
    expect(await vfs.readText(`${D}/dir (2)/b.txt`)).toBe('B');
    await copy.undo.run();
    expect(await vfs.exists(`${D}/dir (2)`)).toBe(false);

    const move = await ops.transfer(vfs, [`${D}/a.txt`, `${D}/dir`], '/home/ada/Desktop', 'move');
    expect(await vfs.exists('/home/ada/Desktop/dir/b.txt')).toBe(true);
    await move.undo.run();
    expect(await vfs.readText(`${D}/dir/b.txt`)).toBe('B');

    expect((await ops.transfer(vfs, [`${D}/a.txt`], D, 'move')).undo).toBeNull();
    const bad = await ops.transfer(vfs, [`${D}/dir`], `${D}/dir`, 'move');
    expect(bad.failed).toHaveLength(1);
  });

  it('trashes, restores and deletes for good', async () => {
    const vfs = await setup();
    const t = await ops.trash(vfs, [`${D}/a.txt`, `${D}/dir`, '/home/ada/Documents']);
    expect(t.failed.map((f) => f.path)).toEqual(['/home/ada/Documents']); // protected folder
    await t.undo.run();
    expect(await vfs.exists(`${D}/dir/b.txt`)).toBe(true);

    await ops.trash(vfs, [`${D}/a.txt`]);
    const [trashed] = await vfs.listTrash();
    const r = await ops.restore(vfs, [trashed.path]);
    expect(r.paths).toEqual([`${D}/a.txt`]);

    await ops.deleteForever(vfs, [`${D}/a.txt`]);
    expect(await vfs.exists(`${D}/a.txt`)).toBe(false);
  });
});
