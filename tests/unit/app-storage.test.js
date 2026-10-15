import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import {
  appStoreSchema,
  createAppStorage,
  migrateApp,
  normalizeIndex,
} from '../../src/services/storage/app-storage.js';
import { KV_STORE_SCHEMA } from '../../src/services/storage/collections.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { META_STORE_SCHEMA } from '../../src/services/storage/migrations.js';
import { QUARANTINE_STORE_SCHEMA } from '../../src/services/storage/quarantine.js';

const manifest = (overrides = {}) => ({
  id: 'nexus.notes',
  storage: {
    version: 2,
    collections: {
      notes: { indexes: { updated: 'updatedAt', tags: { keyPath: 'tags', multiEntry: true } } },
      folders: {},
    },
    migrations: async () => ({
      default: [
        {
          to: 2,
          run: async (tx) => {
            const notes = tx.collection('notes');
            for (const n of await notes.getAll()) await notes.put({ ...n, tags: n.tags ?? [] });
          },
        },
      ],
    }),
  },
  ...overrides,
});

async function openFor(m) {
  return createIdbEngine().open('profile', {
    ...META_STORE_SCHEMA,
    ...KV_STORE_SCHEMA,
    ...QUARANTINE_STORE_SCHEMA,
    ...appStoreSchema(m),
  });
}

describe('app storage', () => {
  it('derives one store per declared collection with normalized indexes', () => {
    expect(appStoreSchema(manifest())).toEqual({
      'app:nexus.notes/notes': {
        keyPath: 'id',
        indexes: {
          updated: { keyPath: 'updatedAt' },
          tags: { keyPath: 'tags', unique: false, multiEntry: true },
        },
      },
      'app:nexus.notes/folders': { keyPath: 'id', indexes: {} },
    });
    expect(appStoreSchema({ id: 'nexus.clock' })).toEqual({});
    expect(normalizeIndex(['a', 'b'])).toEqual({ keyPath: ['a', 'b'] });
  });

  it('gives apps their declared collections and a scoped kv', async () => {
    const m = manifest();
    const db = await openFor(m);
    const storage = createAppStorage({ db, bus: createEventBus(), manifest: m });
    const notes = storage.collection('notes');
    expect(storage.collection('notes')).toBe(notes);
    await notes.put({ id: 'a', updatedAt: 1, tags: ['x'] });
    expect(await notes.query({ index: 'tags', equals: 'x' })).toHaveLength(1);
    await storage.kv.set('lastOpened', 'a');
    expect(await storage.kv.get('lastOpened')).toBe('a');
    expect(() => storage.collection('secrets')).toThrow(/not declared/);
  });

  it('runs app migrations through a collection-scoped context', async () => {
    const m = manifest();
    const db = await openFor(m);
    await db.put('app:nexus.notes/notes', { id: 'old' });
    const result = await migrateApp({ db, manifest: m });
    expect(result).toMatchObject({ status: 'ok', from: 0, version: 2 });
    expect(await db.get('app:nexus.notes/notes', 'old')).toEqual({ id: 'old', tags: [] });
  });

  it('blocks migrations from touching undeclared collections', async () => {
    const m = manifest({
      storage: {
        version: 1,
        collections: { notes: {} },
        migrations: async () => ({ default: [{ to: 1, run: async (tx) => tx.collection('other').getAll() }] }),
      },
    });
    const result = await migrateApp({ db: await openFor(m), manifest: m });
    expect(result.status).toBe('failed');
    expect(result.error.message).toMatch(/not declared/);
  });

  it('read-only storage allows reads and refuses writes', async () => {
    const m = manifest();
    const db = await openFor(m);
    await db.put('app:nexus.notes/notes', { id: 'a' });
    const storage = createAppStorage({ db, bus: createEventBus(), manifest: m, readOnly: true });
    expect(await storage.collection('notes').get('a')).toEqual({ id: 'a' });
    await expect(storage.collection('notes').put({ id: 'b' })).rejects.toMatchObject({ name: 'ReadOnlyError' });
    await expect(storage.collection('notes').update('a', { x: 1 })).rejects.toMatchObject({ name: 'ReadOnlyError' });
    await expect(storage.kv.set('k', 1)).rejects.toMatchObject({ name: 'ReadOnlyError' });
  });
});
