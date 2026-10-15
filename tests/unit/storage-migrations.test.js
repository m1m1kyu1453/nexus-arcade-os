import { describe, expect, it, vi } from 'vitest';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { getDataVersion, META_STORE_SCHEMA, runMigrations } from '../../src/services/storage/migrations.js';
import { approximateSize, storageBreakdown, withQuotaReporting } from '../../src/services/storage/quota.js';

const STORE = 'app:nexus.notes/notes';

async function openDb() {
  return createIdbEngine().open('profile', { ...META_STORE_SCHEMA, [STORE]: { keyPath: 'id' } });
}

const migrations = [
  {
    to: 1,
    description: 'add tags',
    run: async (tx) => {
      for (const note of await tx.getAll(STORE)) await tx.put(STORE, { ...note, tags: [] });
    },
  },
  {
    to: 2,
    description: 'rename body → text',
    run: async (tx) => {
      for (const { body, ...note } of await tx.getAll(STORE)) await tx.put(STORE, { ...note, text: body });
    },
  },
];

describe('migrations', () => {
  it('runs pending migrations in order and records the version', async () => {
    const db = await openDb();
    await db.put(STORE, { id: 'a', body: 'hello' });
    const progress = vi.fn();
    const result = await runMigrations({
      db,
      scope: 'nexus.notes',
      target: 2,
      migrations: [...migrations].reverse(),
      stores: [STORE],
      onProgress: progress,
    });
    expect(result).toEqual({ scope: 'nexus.notes', status: 'ok', from: 0, version: 2, target: 2 });
    expect(await db.get(STORE, 'a')).toEqual({ id: 'a', tags: [], text: 'hello' });
    expect(progress.mock.calls.map((c) => c[0].to)).toEqual([1, 2]);
    expect(await getDataVersion(db, 'nexus.notes')).toBe(2);

    // Running again is a no-op.
    const again = await runMigrations({ db, scope: 'nexus.notes', target: 2, migrations, stores: [STORE] });
    expect(again.from).toBe(2);
    expect(await db.get(STORE, 'a')).toEqual({ id: 'a', tags: [], text: 'hello' });
  });

  it('keeps old data and the last good version when a migration fails', async () => {
    const db = await openDb();
    await db.put(STORE, { id: 'a', body: 'hello' });
    const failing = [
      migrations[0],
      {
        to: 2,
        run: async (tx) => {
          await tx.put(STORE, { id: 'a', broken: true });
          throw new Error('bug in migration');
        },
      },
    ];
    const result = await runMigrations({ db, scope: 'nexus.notes', target: 2, migrations: failing, stores: [STORE] });
    expect(result.status).toBe('failed');
    expect(result.version).toBe(1);
    expect(result.error.message).toBe('bug in migration');
    expect(await db.get(STORE, 'a')).toEqual({ id: 'a', body: 'hello', tags: [] });
    expect(await getDataVersion(db, 'nexus.notes')).toBe(1);
  });

  it('refuses to touch data written by a newer version', async () => {
    const db = await openDb();
    await db.put('meta', { id: 'schema:nexus.notes', version: 5 });
    const run = vi.fn();
    const result = await runMigrations({
      db,
      scope: 'nexus.notes',
      target: 2,
      migrations: [{ to: 1, run }],
      stores: [STORE],
    });
    expect(result).toMatchObject({ status: 'newer', from: 5, version: 5 });
    expect(run).not.toHaveBeenCalled();
    expect(await getDataVersion(db, 'nexus.notes')).toBe(5);
  });

  it('records version bumps that have no migration step', async () => {
    const db = await openDb();
    const result = await runMigrations({ db, scope: 'nexus.clock', target: 3, stores: [] });
    expect(result).toMatchObject({ status: 'ok', version: 3 });
    expect(await getDataVersion(db, 'nexus.clock')).toBe(3);
  });

  it('rejects inconsistent migration lists', async () => {
    const db = await openDb();
    const run = async () => {};
    const call = (list, target = 2) => runMigrations({ db, scope: 's', target, migrations: list, stores: [] });
    await expect(call([{ to: 3, run }])).rejects.toThrow(/beyond/);
    await expect(
      call([
        { to: 1, run },
        { to: 1, run },
      ]),
    ).rejects.toThrow(/Two migrations/);
    await expect(call([{ to: 0, run }])).rejects.toThrow(/invalid/);
    await expect(call([], -1)).rejects.toThrow(/Invalid schema version/);
  });
});

describe('quota', () => {
  it('reports quota errors on writes and rethrows them', async () => {
    const quotaError = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const fake = {
      put: async () => {
        throw quotaError;
      },
      delete: async () => {},
      clear: async () => {},
      transaction: async () => {
        throw quotaError;
      },
      get: async () => 'read ok',
    };
    const onQuota = vi.fn();
    const db = withQuotaReporting(fake, onQuota);
    await expect(db.put('notes', {})).rejects.toBe(quotaError);
    await expect(db.transaction(['a', 'b'], 'readwrite', async () => {})).rejects.toBe(quotaError);
    expect(await db.get('x', 1)).toBe('read ok');
    expect(onQuota.mock.calls).toEqual([[{ store: 'notes' }], [{ store: ['a', 'b'] }]]);
  });

  it('ignores other errors', async () => {
    const onQuota = vi.fn();
    const db = withQuotaReporting(
      {
        put: async () => {
          throw new Error('other');
        },
      },
      onQuota,
    );
    await expect(db.put('s', 1)).rejects.toThrow('other');
    expect(onQuota).not.toHaveBeenCalled();
  });

  it('approximates sizes and breaks usage down by store', async () => {
    expect(approximateSize('abc')).toBe(6);
    expect(approximateSize({ a: new Uint8Array(10), b: new Blob(['12345']) })).toBe(2 + 10 + 2 + 5);
    const loop = { x: 1 };
    loop.self = loop;
    expect(approximateSize(loop)).toBe(2 + 8 + 8);

    const db = await openDb();
    await db.put(STORE, { id: 'a', text: 'x'.repeat(100) });
    await db.put('meta', { id: 'm' });
    const rows = await storageBreakdown(db);
    expect(rows[0]).toMatchObject({ store: STORE, count: 1 });
    expect(rows[0].bytes).toBeGreaterThan(200);
    expect(rows.find((r) => r.store === 'meta').count).toBe(1);
  });
});
