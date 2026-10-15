import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { BACKUP_FORMAT, createBackup, InvalidBackupError } from '../../src/services/backup/backup.js';
import { WrongPasswordError } from '../../src/services/crypto.js';
import { JOBS_STORE_SCHEMA } from '../../src/services/scheduler/scheduler.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../../src/services/settings/settings.js';
import { SYSTEM_SETTINGS } from '../../src/services/settings/system-settings.js';
import { appStoreSchema, createAppStorage } from '../../src/services/storage/app-storage.js';
import { KV_STORE_SCHEMA } from '../../src/services/storage/collections.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { META_STORE_SCHEMA } from '../../src/services/storage/migrations.js';
import { QUARANTINE_STORE_SCHEMA } from '../../src/services/storage/quarantine.js';
import { createVfs, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';

const notesManifest = {
  id: 'nexus.notes',
  storage: { version: 1, collections: { notes: { indexes: { tags: { keyPath: 'tags', multiEntry: true } } } } },
};
const schema = {
  ...META_STORE_SCHEMA,
  ...KV_STORE_SCHEMA,
  ...QUARANTINE_STORE_SCHEMA,
  ...SETTINGS_STORE_SCHEMA,
  ...VFS_STORE_SCHEMA,
  ...JOBS_STORE_SCHEMA,
  ...appStoreSchema(notesManifest),
};
const FAST = { iterations: 1000 };
const profile = () => ({ name: 'Ada', username: 'ada', accent: '#3ef0ff' });

async function openProfile(engine, name = 'nexus-profile-p1') {
  const db = await engine.open(name, schema);
  const bus = createEventBus();
  const vfs = createVfs({ db, bus, user: 'ada' });
  const settings = createSettings({ db, bus, log: createLogger().child('s') });
  settings.register('system', SYSTEM_SETTINGS);
  await settings.load();
  const backup = createBackup({
    db,
    profile,
    nexusVersion: '0.1.0',
    cryptoOptions: FAST,
    now: () => new Date('2026-10-15T12:00:00Z'),
  });
  return { db, bus, vfs, settings, backup };
}

async function populate({ db, bus, vfs, settings }) {
  await vfs.init();
  await vfs.writeFile('/home/ada/Documents/notes.md', '# Grüße\nmilk, eggs', { tags: ['home'] });
  await vfs.writeFile('/home/ada/Pictures/pixel.png', new Uint8Array([137, 80, 78, 71, 0, 255]), { mime: 'image/png' });
  await vfs.trash('/home/ada/Pictures/pixel.png');
  const storage = createAppStorage({ db, bus, manifest: notesManifest });
  await storage
    .collection('notes')
    .put({ id: 'n1', title: 'Hello', tags: ['a', 'b'], when: new Date(Date.UTC(2026, 0, 1)) });
  await storage.kv.set('lastOpened', { id: 'n1', scroll: 120.5 });
  await settings.set('system', 'theme', 'matrix');
  await db.put('jobs', {
    id: 'j1',
    app: 'nexus.tasks',
    title: 'Call',
    at: 5,
    nextAt: 10,
    kind: 'reminder',
    createdAt: 1,
  });
  await db.put('meta', { id: 'schema:nexus.notes', version: 1 });
}

/** Every store as comparable data (Blobs → bytes). */
async function dump(db) {
  const out = {};
  for (const store of db.storeNames().sort()) {
    const rows = [];
    await db.iterate(store, undefined, (value, _k, key) => void rows.push([key, value]));
    for (const row of rows) {
      if (row[1] instanceof Blob) row[1] = { blob: [...new Uint8Array(await row[1].arrayBuffer())], type: row[1].type };
    }
    out[store] = rows;
  }
  return out;
}

describe('backup', () => {
  it('round-trips a whole profile: backup → wipe → restore → identical data', async () => {
    const engine = createIdbEngine();
    const original = await openProfile(engine);
    await populate(original);
    const before = await dump(original.db);

    const { blob, filename, manifest } = await original.backup.export();
    expect(filename).toBe('nexus-ada-2026-10-15.nexus-backup');
    expect(manifest).toMatchObject({ format: BACKUP_FORMAT, formatVersion: 1, nexusVersion: '0.1.0', blobs: 1 });
    expect(manifest.stores['vfs-nodes']).toBeGreaterThan(10);
    expect(manifest.stores.quarantine).toBeUndefined();

    original.db.close();
    await engine.deleteDatabase('nexus-profile-p1');
    const fresh = await openProfile(engine);
    expect((await dump(fresh.db))['vfs-nodes']).toEqual([]);

    const result = await fresh.backup.restore(blob, { mode: 'replace' });
    expect(result.skipped).toBe(0);
    expect(result.unknownStores).toEqual([]);
    expect(await dump(fresh.db)).toEqual(before);

    // The restored data is usable through the services.
    expect(await fresh.vfs.readFile('/home/ada/Documents/notes.md')).toBe('# Grüße\nmilk, eggs');
    const [trashed] = await fresh.vfs.listTrash();
    expect((await fresh.vfs.restore(trashed.path)).path).toBe('/home/ada/Pictures/pixel.png');
  });

  it('encrypts with a password and refuses wrong passwords', async () => {
    const engine = createIdbEngine();
    const p = await openProfile(engine);
    await populate(p);
    const before = await dump(p.db);
    const { blob } = await p.backup.export({ password: 'correct horse' });
    expect(await blob.text()).not.toContain('Grüße');

    expect(await p.backup.inspect(blob)).toMatchObject({ encrypted: true, needsPassword: true, manifest: null });
    await expect(p.backup.inspect(blob, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
    const preview = await p.backup.inspect(blob, 'correct horse');
    expect(preview.manifest.profile.name).toBe('Ada');
    await expect(p.backup.restore(blob, { mode: 'replace' })).rejects.toThrow(/encrypted/);

    await p.vfs.writeFile('/home/ada/Desktop/after-backup.txt', 'x');
    await p.backup.restore(blob, { mode: 'replace', password: 'correct horse' });
    expect(await dump(p.db)).toEqual(before);
  });

  it('merges, skipping records that would clash', async () => {
    const engine = createIdbEngine();
    const source = await openProfile(engine, 'source');
    await populate(source);
    const { blob } = await source.backup.export();

    const target = await openProfile(engine, 'target');
    await target.vfs.init(); // same default folders, different node ids → path clashes
    await target.vfs.writeFile('/home/ada/Desktop/mine.txt', 'keep me');
    const result = await target.backup.restore(blob, { mode: 'merge' });
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.restored['app:nexus.notes/notes']).toBe(1);
    expect(await target.vfs.readFile('/home/ada/Desktop/mine.txt')).toBe('keep me');
    expect(target.settings).toBeDefined();
  });

  it('reports stores this version does not know', async () => {
    const engine = createIdbEngine();
    const newer = await engine.open('newer', { ...schema, 'app:future.app/items': { keyPath: 'id' } });
    await newer.put('app:future.app/items', { id: 'x' });
    const backup = createBackup({ db: newer, profile, nexusVersion: '9.0.0' });
    const { blob } = await backup.export();
    const current = await openProfile(engine, 'current');
    expect((await current.backup.inspect(blob)).unknownStores).toEqual(['app:future.app/items']);
    const result = await current.backup.restore(blob, { mode: 'replace' });
    expect(result.unknownStores).toEqual(['app:future.app/items']);
  });

  it('rejects files that are not backups', async () => {
    const { backup } = await openProfile(createIdbEngine());
    await expect(backup.inspect(new Blob(['hello']))).rejects.toBeInstanceOf(InvalidBackupError);
    await expect(backup.inspect(new Blob(['{"format":"other"}']))).rejects.toBeInstanceOf(InvalidBackupError);
    const { zipSync, strToU8 } = await import('fflate');
    const future = zipSync({
      'nexus-backup.json': strToU8(JSON.stringify({ format: BACKUP_FORMAT, formatVersion: 99, stores: {} })),
    });
    await expect(backup.inspect(new Blob([future]))).rejects.toThrow(/newer Nexus/);
  });
});
