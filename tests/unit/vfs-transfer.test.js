import { unzipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import {
  downloadBlob,
  entriesFromDataTransfer,
  entriesFromFileList,
  importEntries,
  zipFolder,
} from '../../src/services/vfs/transfer.js';
import { createVfs, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';

async function setup() {
  const db = await createIdbEngine().open('profile', VFS_STORE_SCHEMA);
  const vfs = createVfs({ db, bus: createEventBus(), user: 'ada' });
  await vfs.init();
  return vfs;
}

const file = (content, name, type = '', relativePath = '') => {
  const f = new File([content], name, { type });
  if (relativePath) Object.defineProperty(f, 'webkitRelativePath', { value: relativePath });
  return f;
};

describe('vfs import/export', () => {
  it('imports picked files and folders, keeping structure and renaming clashes', async () => {
    const vfs = await setup();
    await vfs.mkdir('/home/ada/Downloads/photos');
    const entries = entriesFromFileList([
      file('# hi', 'readme.md', 'text/markdown', 'photos/readme.md'),
      file(new Uint8Array([1, 2]), 'a.png', 'image/png', 'photos/2026/a.png'),
    ]);
    const progress = vi.fn();
    const written = await importEntries(vfs, entries, '/home/ada/Downloads', { onProgress: progress });
    expect(written).toEqual(['/home/ada/Downloads/photos (2)/readme.md', '/home/ada/Downloads/photos (2)/2026/a.png']);
    expect(await vfs.readFile('/home/ada/Downloads/photos (2)/readme.md')).toBe('# hi');
    expect((await vfs.stat('/home/ada/Downloads/photos (2)/2026/a.png')).mime).toBe('image/png');
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    // Text is stored as text, so content search finds it.
    expect(await vfs.search({ content: 'hi', under: '/home/ada/Downloads' })).toHaveLength(1);
  });

  it('walks dropped folders via webkitGetAsEntry', async () => {
    const fileEntry = (f) => ({ isFile: true, name: f.name, file: (ok) => ok(f) });
    const dirEntry = (name, children) => {
      let done = false;
      return {
        isFile: false,
        name,
        createReader: () => ({
          readEntries: (ok) => {
            ok(done ? [] : children);
            done = true;
          },
        }),
      };
    };
    const dt = {
      files: [],
      items: [
        {
          kind: 'file',
          webkitGetAsEntry: () =>
            dirEntry('proj', [fileEntry(file('x', 'a.txt')), dirEntry('src', [fileEntry(file('y', 'b.js'))])]),
        },
        { kind: 'file', webkitGetAsEntry: () => fileEntry(file('z', 'loose.txt')) },
        { kind: 'string' },
      ],
    };
    const entries = await entriesFromDataTransfer(dt);
    expect(entries.map((e) => e.relativePath)).toEqual(['proj/a.txt', 'proj/src/b.js', 'loose.txt']);
  });

  it('falls back to plain files when folders are not exposed', async () => {
    const entries = await entriesFromDataTransfer({ items: [], files: [file('x', 'a.txt')] });
    expect(entries.map((e) => e.relativePath)).toEqual(['a.txt']);
  });

  it('zips a folder with nested files and empty folders', async () => {
    const vfs = await setup();
    await vfs.writeFile('/home/ada/Projects/site/index.html', '<h1>Hi</h1>', { createParents: true });
    await vfs.writeFile('/home/ada/Projects/site/img/logo.png', new Uint8Array([9, 9]), { createParents: true });
    await vfs.mkdir('/home/ada/Projects/site/empty');
    const blob = await zipFolder(vfs, '/home/ada/Projects/site');
    expect(blob.type).toBe('application/zip');
    const unzipped = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(unzipped).sort()).toEqual(['empty/', 'img/', 'img/logo.png', 'index.html']);
    expect(new TextDecoder().decode(unzipped['index.html'])).toBe('<h1>Hi</h1>');
    expect([...unzipped['img/logo.png']]).toEqual([9, 9]);
  });

  it('downloads via a temporary link', () => {
    const click = vi.fn();
    const a = { click, remove: vi.fn(), style: {} };
    const doc = { createElement: () => a, body: { append: vi.fn() } };
    vi.useFakeTimers();
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    downloadBlob(new Blob(['x']), 'x.txt', doc);
    expect(a.download).toBe('x.txt');
    expect(click).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith(a.href);
    vi.useRealTimers();
  });
});
