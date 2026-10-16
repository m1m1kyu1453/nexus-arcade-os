import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { createVfs, DEFAULT_FOLDERS, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';

async function setup() {
  const db = await createIdbEngine().open('profile', VFS_STORE_SCHEMA);
  const bus = createEventBus();
  let t = 1000;
  const vfs = createVfs({ db, bus, user: 'ada', now: () => ++t });
  await vfs.init();
  return { db, bus, vfs };
}

const names = (nodes) => nodes.map((n) => n.name);

describe('vfs trash retention and tags', () => {
  it('purges only items trashed before the cut-off', async () => {
    let t = 1000;
    const db = await createIdbEngine().open('profile', VFS_STORE_SCHEMA);
    const vfs = createVfs({ db, bus: createEventBus(), user: 'ada', now: () => t });
    await vfs.init();
    await vfs.writeFile('/home/ada/old.txt', 'a');
    await vfs.writeFile('/home/ada/new.txt', 'b');
    t = 2000;
    await vfs.trash('/home/ada/old.txt');
    t = 5000;
    await vfs.trash('/home/ada/new.txt');
    expect(await vfs.purgeTrash(3000)).toBe(1);
    expect((await vfs.listTrash()).map((n) => n.trash.originalPath)).toEqual(['/home/ada/new.txt']);
  });

  it('lists tags in use with counts, ignoring the trash', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/a.txt', '', { tags: ['work', 'Urgent'] });
    await vfs.writeFile('/home/ada/b.txt', '', { tags: ['work'] });
    await vfs.writeFile('/home/ada/c.txt', '', { tags: ['gone'] });
    await vfs.trash('/home/ada/c.txt');
    expect(await vfs.tags()).toEqual([
      { tag: 'Urgent', count: 1 },
      { tag: 'work', count: 2 },
    ]);
  });
});

describe('vfs', () => {
  it('creates the default layout once (idempotent init)', async () => {
    const { vfs } = await setup();
    await vfs.init();
    expect(names(await vfs.list('/'))).toEqual(['.trash', 'home', 'system']);
    expect(names(await vfs.list('/home/ada'))).toEqual(
      [...DEFAULT_FOLDERS].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    );
    expect(names(await vfs.list('/home/ada', { hidden: false }))).not.toContain('.config');
    expect((await vfs.stat('/system')).readOnly).toBe(true);
    expect(vfs.home).toBe('/home/ada');
  });

  it('writes and reads text and binary files with metadata', async () => {
    const { vfs } = await setup();
    const note = await vfs.writeFile('/home/ada/Documents/hello.md', '# Hällo', { tags: ['work', 'work'] });
    expect(note).toMatchObject({ type: 'file', name: 'hello.md', mime: 'text/markdown', size: 8, tags: ['work'] });
    expect(await vfs.readFile('/home/ada/Documents/hello.md')).toBe('# Hällo');

    const png = new Uint8Array([137, 80, 78, 71]);
    await vfs.writeFile('/home/ada/Pictures/x.png', png);
    const blob = await vfs.readFile('/home/ada/Pictures/x.png');
    expect(blob).toBeInstanceOf(Blob);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([137, 80, 78, 71]);
    expect(await vfs.readFile('/home/ada/Documents/hello.md', { as: 'blob' })).toBeInstanceOf(Blob);
    // Binary read as UTF-8 text: the invalid byte becomes U+FFFD.
    expect(await vfs.readText('/home/ada/Pictures/x.png')).toBe('�PNG');

    const before = await vfs.stat('/home/ada/Documents/hello.md');
    const after = await vfs.writeFile('/home/ada/Documents/hello.md', 'changed');
    expect(after.created).toBe(before.created);
    expect(after.modified).toBeGreaterThan(before.modified);
    expect(after.tags).toEqual(['work']);
  });

  it('creates parents on request and reports POSIX-style errors', async () => {
    const { vfs } = await setup();
    await expect(vfs.writeFile('/home/ada/a/b/c.txt', 'x')).rejects.toMatchObject({ code: 'ENOENT' });
    await vfs.writeFile('/home/ada/a/b/c.txt', 'x', { createParents: true });
    expect((await vfs.stat('/home/ada/a/b')).type).toBe('folder');
    await expect(vfs.readFile('/home/ada/a')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(vfs.list('/home/ada/a/b/c.txt')).rejects.toMatchObject({ code: 'ENOTDIR' });
    await expect(vfs.mkdir('/home/ada/a')).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(vfs.writeFile('/home/ada/a', 'x')).rejects.toMatchObject({ code: 'EISDIR' });
    await expect(vfs.writeFile('relative.txt', 'x')).rejects.toMatchObject({ code: 'EINVAL' });
    await expect(vfs.writeFile('/home/ada/a/b/c.txt/d', 'x')).rejects.toMatchObject({ code: 'ENOTDIR' });
    expect(await vfs.exists('/home/ada/nope')).toBe(false);
    expect(await vfs.stat('/home/ada/nope')).toBeNull();
  });

  it('normalizes paths and cannot escape the root', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Documents/../Documents/./a.txt', 'x');
    expect(await vfs.exists('/home/ada/Documents/a.txt')).toBe(true);
    await expect(vfs.writeFile('/../../a.txt', 'x')).resolves.toMatchObject({ path: '/a.txt' });
  });

  it('protects /system and core folders', async () => {
    const { vfs } = await setup();
    await expect(vfs.writeFile('/system/x.txt', 'x')).rejects.toMatchObject({ code: 'EACCES' });
    await vfs.writeFile('/system/about.txt', 'Nexus', { system: true });
    await expect(vfs.writeFile('/system/about.txt', 'hacked')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(vfs.trash('/system/about.txt')).rejects.toMatchObject({ code: 'EACCES' });
    expect((await vfs.stat('/system/about.txt')).readOnly).toBe(true);
    for (const p of ['/home/ada', '/home/ada/Desktop', '/system', '/.trash']) {
      await expect(vfs.trash(p)).rejects.toMatchObject({ code: expect.stringMatching(/EACCES|EINVAL/) });
      await expect(vfs.deletePermanently(p)).rejects.toMatchObject({ code: 'EACCES' });
    }
    await expect(vfs.rename('/home/ada/Desktop', 'Schreibtisch')).rejects.toMatchObject({ code: 'EACCES' });
    await expect(vfs.move('/home/ada/Music', '/home/ada/Documents/Music')).rejects.toMatchObject({ code: 'EACCES' });
  });

  it('renames and moves folders with all their contents', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Projects/site/css/app.css', 'body{}', { createParents: true });
    await vfs.writeFile('/home/ada/Projects/site/index.html', '<h1>', { createParents: true });
    await vfs.rename('/home/ada/Projects/site', 'web');
    expect(await vfs.readFile('/home/ada/Projects/web/css/app.css')).toBe('body{}');
    expect(await vfs.exists('/home/ada/Projects/site')).toBe(false);

    await vfs.move('/home/ada/Projects/web', '/home/ada/Documents/web-old');
    expect(names(await vfs.list('/home/ada/Documents/web-old'))).toEqual(['css', 'index.html']);
    expect((await vfs.stat('/home/ada/Documents/web-old/css/app.css')).path).toBe(
      '/home/ada/Documents/web-old/css/app.css',
    );

    await expect(
      vfs.move('/home/ada/Documents/web-old', '/home/ada/Documents/web-old/css/inner'),
    ).rejects.toMatchObject({
      code: 'EINVAL',
    });
    await vfs.writeFile('/home/ada/Documents/taken.txt', '');
    await expect(
      vfs.move('/home/ada/Documents/web-old/index.html', '/home/ada/Documents/taken.txt'),
    ).rejects.toMatchObject({
      code: 'EEXIST',
    });
    await expect(vfs.rename('/home/ada/Documents/taken.txt', 'a/b')).rejects.toMatchObject({ code: 'EINVAL' });

    await vfs.rename('/home/ada/Documents/taken.txt', 'taken.md');
    expect((await vfs.stat('/home/ada/Documents/taken.md')).mime).toBe('text/markdown');
  });

  it('copies files and folders recursively, independent of the original', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Documents/proj/a.txt', 'A', { createParents: true, tags: ['t'] });
    await vfs.writeFile('/home/ada/Documents/proj/sub/b.bin', new Uint8Array([1]), { createParents: true });
    const copy = await vfs.copy('/home/ada/Documents/proj', '/home/ada/Desktop/proj copy');
    expect(copy.path).toBe('/home/ada/Desktop/proj copy');
    expect(await vfs.readFile('/home/ada/Desktop/proj copy/a.txt')).toBe('A');
    expect((await vfs.stat('/home/ada/Desktop/proj copy/a.txt')).tags).toEqual(['t']);
    expect((await vfs.readFile('/home/ada/Desktop/proj copy/sub/b.bin')).size).toBe(1);
    await vfs.writeFile('/home/ada/Desktop/proj copy/a.txt', 'changed');
    expect(await vfs.readFile('/home/ada/Documents/proj/a.txt')).toBe('A');
    await expect(vfs.copy('/home/ada/Documents/proj', '/home/ada/Documents/proj/sub/x')).rejects.toMatchObject({
      code: 'EINVAL',
    });
  });

  it('trashes, lists, restores (with a free name) and empties the trash', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Documents/report/draft.txt', 'v1', { createParents: true });
    const trashed = await vfs.trash('/home/ada/Documents/report');
    expect(trashed.trash.originalPath).toBe('/home/ada/Documents/report');
    expect(await vfs.exists('/home/ada/Documents/report')).toBe(false);
    const [item] = await vfs.listTrash();
    expect(item.id).toBe(trashed.id);
    expect(await vfs.readFile(`${item.path}/draft.txt`)).toBe('v1');

    await vfs.mkdir('/home/ada/Documents/report'); // name taken meanwhile
    const restored = await vfs.restore(item.path);
    expect(restored.path).toBe('/home/ada/Documents/report (2)');
    expect(restored.trash).toBeUndefined();
    expect(await vfs.readFile('/home/ada/Documents/report (2)/draft.txt')).toBe('v1');

    await vfs.writeFile('/home/ada/Downloads/deep/x.txt', 'x', { createParents: true });
    await vfs.trash('/home/ada/Downloads/deep/x.txt');
    await vfs.deletePermanently('/home/ada/Downloads/deep');
    const [x] = await vfs.listTrash();
    expect((await vfs.restore(x.path)).path).toBe('/home/ada/Downloads/deep/x.txt');

    await vfs.trash('/home/ada/Downloads/deep');
    await vfs.trash('/home/ada/Documents/report (2)');
    expect(await vfs.emptyTrash()).toBe(2);
    expect(await vfs.listTrash()).toEqual([]);
    expect((await vfs.usage()).files).toBe(0);
  });

  it('deletes permanently including content', async () => {
    const { vfs, db } = await setup();
    const node = await vfs.writeFile('/home/ada/a.txt', 'x');
    await vfs.deletePermanently('/home/ada/a.txt');
    expect(await db.get('vfs-content', node.id)).toBeUndefined();
  });

  it('tags, metadata and search by name, tag and content', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Documents/Shopping List.md', 'milk, Eggs');
    await vfs.writeFile('/home/ada/Documents/ideas.txt', 'eggs benedict');
    await vfs.writeFile('/home/ada/Pictures/eggs.png', new Uint8Array([1]));
    await vfs.setTags('/home/ada/Documents/ideas.txt', ['food', ' food ', '']);
    await vfs.setMeta('/home/ada/Documents/ideas.txt', { favorite: true });
    await vfs.setMeta('/home/ada/Documents/ideas.txt', { color: 'red' });
    expect((await vfs.stat('/home/ada/Documents/ideas.txt')).meta).toEqual({ favorite: true, color: 'red' });

    const paths = (nodes) => nodes.map((n) => n.path);
    expect(paths(await vfs.search({ name: 'LIST' }))).toEqual(['/home/ada/Documents/Shopping List.md']);
    expect(paths(await vfs.search({ tag: 'food' }))).toEqual(['/home/ada/Documents/ideas.txt']);
    // Sorted by path, locale-aware (case-insensitive).
    expect(paths(await vfs.search({ content: 'eggs' }))).toEqual([
      '/home/ada/Documents/ideas.txt',
      '/home/ada/Documents/Shopping List.md',
    ]);
    expect(paths(await vfs.search({ name: 'eggs', under: '/home/ada/Pictures' }))).toEqual([
      '/home/ada/Pictures/eggs.png',
    ]);
    expect(paths(await vfs.search({ name: 'Doc', type: 'folder' }))).toEqual(['/home/ada/Documents']);

    await vfs.trash('/home/ada/Documents/ideas.txt');
    expect(paths(await vfs.search({ tag: 'food' }))).toEqual([]);
    expect(await vfs.search({ tag: 'food', under: '/.trash' })).toHaveLength(1);
  });

  it('watchers see changes at and below a path, including moves out', async () => {
    const { vfs } = await setup();
    const direct = vi.fn();
    const deep = vi.fn();
    vfs.watch('/home/ada/Documents', direct);
    const unwatch = vfs.watch('/home/ada/Documents', deep, { recursive: true });
    await vfs.writeFile('/home/ada/Documents/a.txt', 'x');
    await vfs.writeFile('/home/ada/Documents/sub/b.txt', 'x', { createParents: true });
    await vfs.move('/home/ada/Documents/a.txt', '/home/ada/Desktop/a.txt');
    await vfs.writeFile('/home/ada/Desktop/other.txt', 'x');
    expect(direct.mock.calls.map((c) => [c[0].type, c[0].path])).toEqual([
      ['created', '/home/ada/Documents/a.txt'],
      ['created', '/home/ada/Documents/sub'],
      ['moved', '/home/ada/Desktop/a.txt'],
    ]);
    expect(deep.mock.calls.map((c) => c[0].path)).toContain('/home/ada/Documents/sub/b.txt');
    unwatch();
    await vfs.writeFile('/home/ada/Documents/sub/c.txt', 'x');
    expect(deep.mock.calls.map((c) => c[0].path)).not.toContain('/home/ada/Documents/sub/c.txt');
  });

  it('reports usage', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/a.txt', 'abc');
    await vfs.writeFile('/home/ada/b.txt', 'de');
    await vfs.trash('/home/ada/b.txt');
    expect(await vfs.usage()).toMatchObject({ files: 2, bytes: 5, trashBytes: 2 });
  });

  it('walks a subtree parents first', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Projects/p/x/y.txt', '', { createParents: true });
    expect((await vfs.walk('/home/ada/Projects')).map((n) => n.path)).toEqual([
      '/home/ada/Projects',
      '/home/ada/Projects/p',
      '/home/ada/Projects/p/x',
      '/home/ada/Projects/p/x/y.txt',
    ]);
  });
});
