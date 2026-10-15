import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createIntents, NoHandlerError } from '../../src/kernel/intents.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createRegistry } from '../../src/kernel/registry.js';
import { isTextMime, matchesType, mimeFromPath } from '../../src/services/vfs/mime.js';
import { testManifest } from '../helpers/manifests.js';

function setup(choice = null) {
  const registry = createRegistry({ bus: createEventBus(), log: createLogger().child('t') });
  registry.registerAll([
    testManifest({ id: 'nexus.editor', handles: [{ action: 'open', types: ['text/*', '.md'] }] }),
    testManifest({
      id: 'nexus.notes',
      handles: [
        { action: 'open', types: ['.md'] },
        { action: 'share', types: ['text/plain'] },
      ],
    }),
    testManifest({ id: 'nexus.photos', handles: [{ action: 'open', types: ['image/*'] }] }),
    testManifest({ id: 'nexus.tasks', handles: [{ action: 'share', types: ['text/plain'] }] }),
  ]);
  const launches = [];
  const lifecycle = { launch: vi.fn(async (appId, args) => (launches.push([appId, args.intent]), `${appId}#1`)) };
  const store = new Map();
  const defaults = {
    get: async (k) => store.get(k),
    set: async (k, v) => void store.set(k, v),
    delete: async (k) => void store.delete(k),
  };
  const choose = vi.fn(async () => choice);
  const intents = createIntents({ registry, lifecycle, choose, defaults });
  return { registry, intents, launches, choose, store };
}

describe('mime helpers', () => {
  it('maps extensions and matches handler patterns', () => {
    expect(mimeFromPath('/a/Notes.MD')).toBe('text/markdown');
    expect(mimeFromPath('/a/photo.jpeg')).toBe('image/jpeg');
    expect(mimeFromPath('/a/unknown.xyz')).toBe('application/octet-stream');
    expect(mimeFromPath('/a/my.nexus-backup')).toBe('application/vnd.nexus.backup');
    expect(matchesType('image/*', { mime: 'image/png' })).toBe(true);
    expect(matchesType('image/*', { mime: 'imagex/png' })).toBe(false);
    expect(matchesType('.md', { mime: 'text/markdown', path: '/x/README.MD' })).toBe(true);
    expect(matchesType('text/markdown', { mime: 'text/markdown' })).toBe(true);
    expect(isTextMime('application/json')).toBe(true);
    expect(isTextMime('image/png')).toBe(false);
  });
});

describe('intents', () => {
  it('opens directly when only one app can', async () => {
    const { intents, launches, choose } = setup();
    expect(await intents.open('/home/ada/Pictures/cat.png')).toBe('nexus.photos#1');
    expect(launches[0]).toEqual([
      'nexus.photos',
      { action: 'open', type: 'image/png', path: '/home/ada/Pictures/cat.png' },
    ]);
    expect(choose).not.toHaveBeenCalled();
  });

  it('asks when several apps can, and remembers "always"', async () => {
    const { intents, launches, choose, store } = setup({ appId: 'nexus.notes', always: true });
    await intents.open('/a/todo.md');
    expect(choose.mock.calls[0][0].candidates.map((m) => m.id)).toEqual(['nexus.editor', 'nexus.notes']);
    expect(store.get('open:.md')).toBe('nexus.notes');
    await intents.open('/b/other.md');
    expect(choose).toHaveBeenCalledTimes(1);
    expect(launches.map((l) => l[0])).toEqual(['nexus.notes', 'nexus.notes']);
    expect(await intents.getDefault('/x.md')).toBe('nexus.notes');
    await intents.clearDefault('/x.md');
    expect(store.has('open:.md')).toBe(false);
  });

  it('does not remember a one-time choice', async () => {
    const { intents, store } = setup({ appId: 'nexus.editor' });
    await intents.open('/a/x.md');
    expect(store.size).toBe(0);
  });

  it('returns null when the user cancels', async () => {
    const { intents, launches } = setup(null);
    expect(await intents.open('/a/x.md')).toBeNull();
    expect(launches).toEqual([]);
  });

  it('forgets a default whose app no longer handles the type', async () => {
    const { intents, registry, store, launches } = setup({ appId: 'nexus.editor' });
    store.set('open:.png', 'nexus.removed');
    await intents.open('/a/cat.png');
    expect(store.has('open:.png')).toBe(false);
    expect(launches[0][0]).toBe('nexus.photos');
    registry.setEnabled('nexus.photos', false);
    await expect(intents.open('/a/cat.png')).rejects.toBeInstanceOf(NoHandlerError);
  });

  it('honours an explicit app (Open with…)', async () => {
    const { intents, launches } = setup();
    await intents.open({ path: '/a/data.bin', mime: 'text/plain' }, { with: 'nexus.editor' });
    expect(launches[0]).toEqual(['nexus.editor', { action: 'open', type: 'text/plain', path: '/a/data.bin' }]);
  });

  it('rejects a chooser answer that is not a candidate', async () => {
    const { intents } = setup({ appId: 'nexus.photos' });
    await expect(intents.open('/a/x.md')).rejects.toThrow(/cannot open/);
  });

  it('shares data with accepting apps', async () => {
    const { intents, launches, choose } = setup({ appId: 'nexus.tasks' });
    await intents.share('Buy milk', 'text/plain');
    expect(choose.mock.calls[0][0]).toMatchObject({ action: 'share', type: 'text/plain' });
    expect(launches[0]).toEqual(['nexus.tasks', { action: 'share', type: 'text/plain', data: 'Buy milk' }]);
    await intents.share('x', 'text/plain', { to: 'nexus.notes' });
    expect(launches[1][0]).toBe('nexus.notes');
    await expect(intents.share(new Blob(), 'image/png')).rejects.toBeInstanceOf(NoHandlerError);
    expect(intents.shareTargetsFor('text/plain').map((m) => m.id)).toEqual(['nexus.notes', 'nexus.tasks']);
    expect(intents.openersFor('/a/b.md').map((m) => m.id)).toEqual(['nexus.editor', 'nexus.notes']);
  });
});
