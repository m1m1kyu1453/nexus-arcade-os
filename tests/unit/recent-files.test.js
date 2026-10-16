import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createIntents } from '../../src/kernel/intents.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createRegistry } from '../../src/kernel/registry.js';
import { createClipboard } from '../../src/services/clipboard/clipboard.js';
import { createRecentFiles } from '../../src/services/vfs/recent.js';
import { testManifest } from '../helpers/manifests.js';

const memoryStore = () => {
  const m = new Map();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
};

describe('recent files', () => {
  it('keeps newest first, dedupes, follows moves and forgets trashed files', async () => {
    const bus = createEventBus();
    let t = 0;
    const recent = createRecentFiles({ store: memoryStore(), bus, now: () => ++t });
    await recent.load();
    recent.add('/home/u/a.txt');
    recent.add('/home/u/docs/b.md');
    recent.add('/home/u/a.txt');
    expect(recent.list().map((i) => i.path)).toEqual(['/home/u/a.txt', '/home/u/docs/b.md']);

    bus.emit('vfs:changed', { type: 'moved', path: '/home/u/papers', oldPath: '/home/u/docs', nodeType: 'folder' });
    expect(recent.list()[1].path).toBe('/home/u/papers/b.md');

    bus.emit('vfs:changed', { type: 'trashed', path: '/.trash/x-a.txt', oldPath: '/home/u/a.txt', nodeType: 'file' });
    expect(recent.list().map((i) => i.path)).toEqual(['/home/u/papers/b.md']);

    bus.emit('vfs:changed', { type: 'deleted', path: '/home/u/papers', nodeType: 'folder' });
    expect(recent.list()).toEqual([]);
  });

  it('survives a reload', async () => {
    const store = memoryStore();
    const a = createRecentFiles({ store, bus: createEventBus() });
    a.add('/x.txt');
    await Promise.resolve();
    const b = createRecentFiles({ store, bus: createEventBus() });
    await b.load();
    expect(b.list().map((i) => i.path)).toEqual(['/x.txt']);
  });
});

describe('intents: defaults and opened files', () => {
  function setup() {
    const registry = createRegistry({ bus: createEventBus(), log: createLogger().child('t') });
    registry.registerAll([
      testManifest({ id: 'nexus.editor', handles: [{ action: 'open', types: ['text/*'] }] }),
      testManifest({ id: 'nexus.notes', handles: [{ action: 'open', types: ['.md'] }] }),
    ]);
    const opened = [];
    const intents = createIntents({
      registry,
      lifecycle: { launch: async (appId) => `${appId}#1` },
      choose: vi.fn(async () => null),
      defaults: memoryStore(),
      onOpened: (p) => opened.push(p),
    });
    return { intents, opened };
  }

  it('setDefault makes open skip the chooser and is validated', async () => {
    const { intents, opened } = setup();
    await expect(intents.setDefault('/a.md', 'nexus.nope')).rejects.toThrow(/cannot open/);
    await intents.setDefault('/a.md', 'nexus.notes');
    expect(await intents.getDefault('/b.md')).toBe('nexus.notes');
    expect(await intents.open('/b.md')).toBe('nexus.notes#1');
    expect(opened).toEqual(['/b.md']);
  });

  it('does not record a file when the user cancels the chooser', async () => {
    const { intents, opened } = setup();
    expect(await intents.open('/c.md')).toBeNull();
    expect(opened).toEqual([]);
  });
});

describe('file clipboard', () => {
  it('holds copied or cut paths and announces changes', () => {
    const bus = createEventBus();
    const seen = [];
    bus.on('clipboard:files-changed', (p) => seen.push(p));
    const clip = createClipboard({ store: memoryStore(), bus, api: undefined, document: undefined });
    expect(clip.files()).toEqual({ paths: [], cut: false });
    clip.setFiles(['/a', '/b'], { cut: true });
    const files = clip.files();
    files.paths.push('/mutated');
    expect(clip.files()).toEqual({ paths: ['/a', '/b'], cut: true });
    expect(seen).toEqual([{ count: 2, cut: true }]);
  });
});
