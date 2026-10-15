// One contract, three engines: IndexedDB (fake-indexeddb), localStorage (FakeStorage), memory.
import { describe, expect, it } from 'vitest';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { createLocalStorageEngine } from '../../src/services/storage/engine-localstorage.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';
import { isQuotaError } from '../../src/services/storage/types.js';
import { FakeStorage } from '../helpers/fake-storage.js';

const schema = {
  notes: {
    keyPath: 'id',
    indexes: {
      updated: { keyPath: 'updated' },
      tags: { keyPath: 'tags', multiEntry: true },
      folderTitle: { keyPath: ['folder', 'title'] },
      slug: { keyPath: 'slug', unique: true },
    },
  },
  log: { keyPath: 'seq', autoIncrement: true },
  kv: {},
  counter: { autoIncrement: true },
};

/** Each factory returns a function that creates an engine sharing the same backing data. */
const engines = {
  indexeddb: () => () => createIdbEngine(),
  localstorage: () => {
    const storage = new FakeStorage();
    return () => createLocalStorageEngine(storage);
  },
  memory: () => {
    const engine = createMemoryEngine();
    return () => engine;
  },
};

const note = (id, extra = {}) => ({ id, title: `Note ${id}`, folder: 'inbox', updated: id, tags: [], ...extra });

describe.each(Object.keys(engines))('%s engine', (kind) => {
  async function setup() {
    const make = engines[kind]();
    const engine = make();
    const db = await engine.open('test', schema);
    return { make, engine, db };
  }

  it('reports its kind', async () => {
    const { db, engine } = await setup();
    expect(engine.kind).toBe(kind);
    expect(db.kind).toBe(kind);
    expect(db.storeNames().sort()).toEqual(['counter', 'kv', 'log', 'notes']);
    expect(db.keyPathOf('notes')).toBe('id');
    expect(db.keyPathOf('kv')).toBeNull();
  });

  it('puts and gets copies (no shared references)', async () => {
    const { db } = await setup();
    const value = note('a', { nested: { x: 1 } });
    expect(await db.put('notes', value)).toBe('a');
    value.nested.x = 2;
    const read = await db.get('notes', 'a');
    expect(read.nested.x).toBe(1);
    read.nested.x = 3;
    expect((await db.get('notes', 'a')).nested.x).toBe(1);
    expect(await db.get('notes', 'missing')).toBeUndefined();
  });

  it('round-trips Dates, Blobs, binary data and Maps', async () => {
    const { db } = await setup();
    const value = {
      when: new Date('2026-10-15T10:00:00Z'),
      blob: new Blob(['héllo'], { type: 'text/plain' }),
      bytes: new Uint8Array([1, 2, 255]),
      map: new Map([['k', 1]]),
    };
    await db.put('kv', value, 'complex');
    const read = await db.get('kv', 'complex');
    expect(read.when).toBeInstanceOf(Date);
    expect(read.when.toISOString()).toBe('2026-10-15T10:00:00.000Z');
    expect(read.blob.type).toBe('text/plain');
    expect(await read.blob.text()).toBe('héllo');
    expect([...read.bytes]).toEqual([1, 2, 255]);
    expect(read.map.get('k')).toBe(1);
  });

  it('generates keys for autoIncrement stores (in-line and out-of-line)', async () => {
    const { db } = await setup();
    expect(await db.put('log', { msg: 'a' })).toBe(1);
    expect(await db.put('log', { msg: 'b' })).toBe(2);
    expect(await db.get('log', 2)).toEqual({ seq: 2, msg: 'b' });
    expect(await db.put('log', { seq: 10, msg: 'explicit' })).toBe(10);
    expect(await db.put('log', { msg: 'next' })).toBe(11);
    expect(await db.put('counter', 'x')).toBe(1);
    expect(await db.get('counter', 1)).toBe('x');
  });

  it('rejects missing or invalid keys', async () => {
    const { db } = await setup();
    await expect(db.put('notes', { title: 'no id' })).rejects.toMatchObject({ name: 'DataError' });
    await expect(db.put('kv', 'value')).rejects.toMatchObject({ name: 'DataError' });
    await expect(db.get('notes', { not: 'a key' })).rejects.toMatchObject({ name: 'DataError' });
  });

  it('lists sorted with range, direction, offset and limit', async () => {
    const { db } = await setup();
    for (const id of ['c', 'a', 'e', 'b', 'd']) await db.put('notes', note(id));
    const ids = (rows) => rows.map((r) => r.id);
    expect(ids(await db.getAll('notes'))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(await db.getAll('notes', { range: { lower: 'b', upper: 'd', upperOpen: true } }))).toEqual(['b', 'c']);
    expect(ids(await db.getAll('notes', { direction: 'prev', limit: 2 }))).toEqual(['e', 'd']);
    expect(ids(await db.getAll('notes', { offset: 1, limit: 2 }))).toEqual(['b', 'c']);
    expect(await db.getAllKeys('notes', { range: { only: 'c' } })).toEqual(['c']);
    expect(await db.count('notes')).toBe(5);
    expect(await db.count('notes', { range: { lower: 'c' } })).toBe(3);
  });

  it('queries indexes: plain, multiEntry and compound', async () => {
    const { db } = await setup();
    await db.put('notes', note('a', { updated: 3, tags: ['work', 'x'], folder: 'b', title: 'Zed' }));
    await db.put('notes', note('b', { updated: 1, tags: ['work', 'work'], folder: 'a', title: 'Mid' }));
    await db.put('notes', note('c', { updated: 2, tags: [], folder: 'a', title: 'Alpha' }));
    const ids = (rows) => rows.map((r) => r.id);
    expect(ids(await db.getAll('notes', { index: 'updated' }))).toEqual(['b', 'c', 'a']);
    expect(ids(await db.getAll('notes', { index: 'updated', direction: 'prev', limit: 1 }))).toEqual(['a']);
    expect(ids(await db.getAll('notes', { index: 'tags', range: { only: 'work' } }))).toEqual(['a', 'b']);
    expect(await db.count('notes', { index: 'tags' })).toBe(3);
    expect(ids(await db.getAll('notes', { index: 'folderTitle', range: { lower: ['a'], upper: ['a', []] } }))).toEqual([
      'c',
      'b',
    ]);
    await expect(db.getAll('notes', { index: 'nope' })).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('enforces unique indexes without writing the conflicting record', async () => {
    const { db } = await setup();
    await db.put('notes', note('a', { slug: 'hello' }));
    await expect(db.put('notes', note('b', { slug: 'hello' }))).rejects.toMatchObject({ name: 'ConstraintError' });
    expect(await db.get('notes', 'b')).toBeUndefined();
    await db.put('notes', note('a', { slug: 'hello', title: 'updated' }));
    expect((await db.get('notes', 'a')).title).toBe('updated');
  });

  it('deletes by key and by range, and clears', async () => {
    const { db } = await setup();
    for (const id of ['a', 'b', 'c', 'd']) await db.put('notes', note(id));
    await db.delete('notes', 'a');
    await db.delete('notes', { lower: 'b', upper: 'c' });
    expect(await db.getAllKeys('notes')).toEqual(['d']);
    await db.clear('notes');
    expect(await db.count('notes')).toBe(0);
  });

  it('iterates in order and can stop early', async () => {
    const { db } = await setup();
    for (const id of ['a', 'b', 'c']) await db.put('notes', note(id, { updated: { a: 3, b: 2, c: 1 }[id] }));
    const seen = [];
    await db.iterate('notes', { index: 'updated' }, (value, key, primaryKey) => {
      seen.push([key, primaryKey]);
      return seen.length < 2;
    });
    expect(seen).toEqual([
      [1, 'c'],
      [2, 'b'],
    ]);
  });

  it('commits transactions atomically', async () => {
    const { db } = await setup();
    await db.put('notes', note('keep'));
    await expect(
      db.transaction(['notes', 'kv'], 'readwrite', async (tx) => {
        await tx.put('notes', note('new'));
        await tx.delete('notes', 'keep');
        await tx.put('kv', 1, 'counter');
        throw new Error('changed my mind');
      }),
    ).rejects.toThrow('changed my mind');
    expect(await db.getAllKeys('notes')).toEqual(['keep']);
    expect(await db.get('kv', 'counter')).toBeUndefined();

    const result = await db.transaction(['notes', 'kv'], 'readwrite', async (tx) => {
      await tx.put('notes', note('new'));
      const visible = await tx.get('notes', 'new');
      await tx.put('kv', visible.id, 'last');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(await db.get('kv', 'last')).toBe('new');
  });

  it('refuses writes in read-only transactions and unknown stores', async () => {
    const { db } = await setup();
    await expect(db.transaction('notes', 'readonly', (tx) => tx.put('notes', note('x')))).rejects.toMatchObject({
      name: 'ReadOnlyError',
    });
    await expect(db.get('nope', 1)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('keeps data across reopen and adds new stores without losing old ones', async () => {
    const { make, db } = await setup();
    await db.put('notes', note('a', { tags: ['t'] }));
    db.close();
    await expect(db.get('notes', 'a')).rejects.toMatchObject({ name: 'InvalidStateError' });

    const reopened = await make().open('test', {
      ...schema,
      notes: { ...schema.notes, indexes: { ...schema.notes.indexes, title: { keyPath: 'title' } } },
      extra: { keyPath: 'id' },
    });
    expect((await reopened.get('notes', 'a')).tags).toEqual(['t']);
    expect((await reopened.getAll('notes', { index: 'title' })).map((n) => n.id)).toEqual(['a']);
    await reopened.put('extra', { id: 1 });
    expect(await reopened.count('extra')).toBe(1);
  });

  it('lists and deletes databases', async () => {
    const { engine, db } = await setup();
    await db.put('notes', note('a'));
    expect(await engine.databases()).toContain('test');
    db.close();
    await engine.deleteDatabase('test');
    const fresh = await engine.open('test', schema);
    expect(await fresh.count('notes')).toBe(0);
  });
});

describe('localStorage engine quota', () => {
  it('rejects the write with a quota error and keeps the previous data', async () => {
    const storage = new FakeStorage({ quotaBytes: 600 });
    const db = await createLocalStorageEngine(storage).open('q', { kv: {} });
    await db.put('kv', 'small', 'a');
    const error = await db.put('kv', 'x'.repeat(1000), 'b').catch((e) => e);
    expect(isQuotaError(error)).toBe(true);
    expect(await db.get('kv', 'a')).toBe('small');
    expect(await db.get('kv', 'b')).toBeUndefined();
  });
});
