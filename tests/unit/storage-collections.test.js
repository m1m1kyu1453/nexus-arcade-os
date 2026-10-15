import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import {
  collectionStore,
  createCollection,
  createKeyValue,
  KV_STORE_SCHEMA,
} from '../../src/services/storage/collections.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { listQuarantine, QUARANTINE_STORE_SCHEMA, restoreQuarantined } from '../../src/services/storage/quarantine.js';

const NOTES = collectionStore('nexus.notes', 'notes');

async function setup() {
  const db = await createIdbEngine().open('profile', {
    ...KV_STORE_SCHEMA,
    ...QUARANTINE_STORE_SCHEMA,
    [NOTES]: {
      keyPath: 'id',
      indexes: { tags: { keyPath: 'tags', multiEntry: true }, updated: { keyPath: 'updated' } },
    },
  });
  const bus = createEventBus();
  return { db, bus };
}

describe('collections', () => {
  it('creates, reads, updates and deletes items', async () => {
    const { db, bus } = await setup();
    let n = 0;
    const notes = createCollection({ db, bus, scope: 'nexus.notes', name: 'notes', newId: () => `id${++n}` });
    const created = await notes.create({ title: 'Hello', tags: ['a'], updated: 1 });
    expect(created).toEqual({ id: 'id1', title: 'Hello', tags: ['a'], updated: 1 });
    expect(await notes.get('id1')).toEqual(created);
    expect(await notes.update('id1', { title: 'Hi', id: 'ignored' })).toMatchObject({ id: 'id1', title: 'Hi' });
    await notes.put({ id: 'x', title: 'X', tags: ['a', 'b'], updated: 0 });
    expect(await notes.count()).toBe(2);
    await notes.delete('id1');
    expect(await notes.get('id1')).toBeUndefined();
    await notes.clear();
    expect(await notes.all()).toEqual([]);
    await expect(notes.update('missing', {})).rejects.toThrow(/No item/);
  });

  it('queries by index with equals, range, order and limit', async () => {
    const { db, bus } = await setup();
    const notes = createCollection({ db, bus, scope: 'nexus.notes', name: 'notes' });
    await notes.put({ id: 'a', tags: ['work'], updated: 3 });
    await notes.put({ id: 'b', tags: ['home'], updated: 1 });
    await notes.put({ id: 'c', tags: ['work', 'home'], updated: 2 });
    const ids = (items) => items.map((i) => i.id);
    expect(ids(await notes.query({ index: 'tags', equals: 'work' }))).toEqual(['a', 'c']);
    expect(ids(await notes.query({ index: 'updated', direction: 'prev', limit: 2 }))).toEqual(['a', 'c']);
    expect(ids(await notes.all({ index: 'updated', range: { lower: 2 } }))).toEqual(['c', 'a']);
    expect(await notes.count({ index: 'tags', equals: 'home' })).toBe(2);
  });

  it('validates writes', async () => {
    const { db, bus } = await setup();
    const notes = createCollection({
      db,
      bus,
      scope: 'nexus.notes',
      name: 'notes',
      validate: (n) => (typeof n.title === 'string' ? null : 'title must be a string'),
    });
    await expect(notes.put({ id: 'a' })).rejects.toMatchObject({
      name: 'ValidationError',
      message: 'title must be a string',
    });
    await expect(notes.put({ title: 'no id' })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(notes.put(['array'])).rejects.toMatchObject({ name: 'ValidationError' });
    await notes.put({ id: 'a', title: 'ok' });
    await expect(notes.update('a', { title: 5 })).rejects.toMatchObject({ name: 'ValidationError' });
    expect((await notes.get('a')).title).toBe('ok');
  });

  it('quarantines corrupt records on read instead of failing', async () => {
    const { db, bus } = await setup();
    await db.put(NOTES, { id: 'good', title: 'fine' });
    await db.put(NOTES, { id: 'bad', title: 42 });
    const onQuarantine = vi.fn();
    const notes = createCollection({
      db,
      bus,
      scope: 'nexus.notes',
      name: 'notes',
      validate: (n) => (typeof n.title === 'string' ? null : 'title must be a string'),
      onQuarantine,
    });
    expect((await notes.all()).map((n) => n.id)).toEqual(['good']);
    expect(await notes.get('bad')).toBeUndefined();
    expect(onQuarantine).toHaveBeenCalledWith({ store: NOTES, key: 'bad', reason: 'title must be a string' });

    const quarantined = await listQuarantine(db);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({ store: NOTES, key: 'bad', value: { id: 'bad', title: 42 } });

    await restoreQuarantined(db, quarantined[0].id, { id: 'bad', title: 'repaired' });
    expect((await notes.get('bad')).title).toBe('repaired');
    expect(await listQuarantine(db)).toEqual([]);
  });

  it('announces changes on the bus and to onChange listeners of the same collection only', async () => {
    const { db, bus } = await setup();
    const notes = createCollection({ db, bus, scope: 'nexus.notes', name: 'notes' });
    const other = createCollection({ db, bus, scope: 'nexus.tasks', name: 'notes' });
    const changes = vi.fn();
    const otherChanges = vi.fn();
    const unsub = notes.onChange(changes);
    other.onChange(otherChanges);
    await notes.put({ id: 'a' });
    await notes.delete('a');
    await notes.clear();
    unsub();
    await notes.put({ id: 'b' });
    expect(changes.mock.calls.map((c) => c[0])).toEqual([
      { type: 'put', id: 'a', remote: undefined },
      { type: 'delete', id: 'a', remote: undefined },
      { type: 'clear', id: undefined, remote: undefined },
    ]);
    expect(otherChanges).not.toHaveBeenCalled();
  });
});

describe('key-value state', () => {
  it('stores values per scope without leaking between scopes', async () => {
    const { db, bus } = await setup();
    const a = createKeyValue({ db, bus, scope: 'nexus.a' });
    const ab = createKeyValue({ db, bus, scope: 'nexus.ab' });
    await a.set('theme', { dark: true });
    await a.set('count', 3);
    await ab.set('theme', 'other');
    expect(await a.get('theme')).toEqual({ dark: true });
    expect(await a.get('missing', 'fallback')).toBe('fallback');
    expect((await a.keys()).sort()).toEqual(['count', 'theme']);
    expect(await ab.entries()).toEqual({ theme: 'other' });
    await a.delete('count');
    expect(await a.keys()).toEqual(['theme']);
    await a.clear();
    expect(await a.keys()).toEqual([]);
    expect(await ab.get('theme')).toBe('other');
  });

  it('rejects bad keys and undefined values', async () => {
    const { db, bus } = await setup();
    const kv = createKeyValue({ db, bus, scope: 's' });
    await expect(kv.set('', 1)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(kv.set('k', undefined)).rejects.toMatchObject({ name: 'ValidationError' });
  });
});
