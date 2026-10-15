// @ts-check
// Collections (ctx.storage.collection) and key-value state (ctx.storage.kv) on top of a
// Database. Writes are validated; records that fail validation on read are moved to the
// quarantine store instead of crashing the app. Every change is announced on the event bus as
// 'storage:changed' so other views (and other tabs, via the storage service) can react.
import { quarantineRecord } from './quarantine.js';

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./keys.js').Key} Key */
/** @typedef {(item: any) => string | null} Validator  returns an error message, or null when valid */

export class ValidationError extends Error {
  name = 'ValidationError';
}

/**
 * Store name of an app collection.
 * @param {string} scope app id (or 'system:<service>')
 * @param {string} collection
 */
export const collectionStore = (scope, collection) => `app:${scope}/${collection}`;

/**
 * @typedef {object} CollectionQuery
 * @property {string} [index]
 * @property {Key} [equals]
 * @property {import('./keys.js').KeyRange} [range]
 * @property {'next' | 'prev'} [direction]
 * @property {number} [offset]
 * @property {number} [limit]
 */

/** @param {CollectionQuery} [q] @returns {import('./types.js').Query} */
function toQuery(q = {}) {
  const { equals, ...rest } = q;
  return equals === undefined ? rest : { ...rest, range: { only: equals } };
}

/**
 * @param {object} options
 * @param {Database} options.db
 * @param {string} options.scope
 * @param {string} options.name
 * @param {{ emit(type: string, payload?: unknown): void, on(type: string, fn: (p: any) => void): () => void }} options.bus
 * @param {Validator} [options.validate]
 * @param {() => string} [options.newId]
 * @param {(info: { store: string, key: Key, reason: string }) => void} [options.onQuarantine]
 */
export function createCollection({ db, scope, name, bus, validate, newId = () => crypto.randomUUID(), onQuarantine }) {
  const store = collectionStore(scope, name);

  /** @param {any} item */
  function check(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ValidationError('Items must be objects');
    if (typeof item.id !== 'string' || item.id === '') throw new ValidationError('Items need a non-empty string "id"');
    const error = validate?.(item);
    if (error) throw new ValidationError(error);
  }

  /** Drops (and quarantines) records that fail validation. @param {any[]} items */
  async function healthy(items) {
    if (!validate) return items;
    const ok = [];
    for (const item of items) {
      const reason = validate(item);
      if (!reason) {
        ok.push(item);
        continue;
      }
      await quarantineRecord(db, { store, key: item?.id, value: item, reason }).catch(() => {});
      onQuarantine?.({ store, key: item?.id, reason });
    }
    return ok;
  }

  /** @param {'put' | 'delete' | 'clear'} type @param {string} [id] */
  const announce = (type, id) => bus.emit('storage:changed', { scope, collection: name, type, id });

  return {
    name,
    /** @param {string} id */
    async get(id) {
      const item = await db.get(store, id);
      return item === undefined ? undefined : (await healthy([item]))[0];
    },
    /** @param {CollectionQuery} [query] */
    async all(query) {
      return healthy(await db.getAll(store, toQuery(query)));
    },
    /** Alias of `all` that reads better with filters: `notes.query({ index: 'tags', equals: 'work' })`. */
    async query(/** @type {CollectionQuery} */ query) {
      return healthy(await db.getAll(store, toQuery(query)));
    },
    /** @param {CollectionQuery} [query] */
    count: (query) => db.count(store, toQuery(query)),
    /** Creates or replaces an item. */
    async put(/** @type {any} */ item) {
      check(item);
      await db.put(store, item);
      announce('put', item.id);
      return item;
    },
    /** Adds an item, generating an id when it has none. */
    async create(/** @type {Record<string, any>} */ data) {
      const item = { ...data, id: data.id ?? newId() };
      check(item);
      await db.put(store, item);
      announce('put', item.id);
      return item;
    },
    /** Merges `patch` into an existing item atomically. Returns the updated item. */
    async update(/** @type {string} */ id, /** @type {Record<string, any>} */ patch) {
      const updated = await db.transaction(store, 'readwrite', async (tx) => {
        const current = await tx.get(store, id);
        if (current === undefined) throw new Error(`No item "${id}" in ${name}`);
        const next = { ...current, ...patch, id };
        check(next);
        await tx.put(store, next);
        return next;
      });
      announce('put', id);
      return updated;
    },
    async delete(/** @type {string} */ id) {
      await db.delete(store, id);
      announce('delete', id);
    },
    async clear() {
      await db.clear(store);
      announce('clear');
    },
    /**
     * @param {(change: { type: 'put' | 'delete' | 'clear', id?: string, remote?: boolean }) => void} fn
     * @returns {() => void}
     */
    onChange(fn) {
      return bus.on('storage:changed', (p) => {
        if (p.scope === scope && p.collection === name) fn({ type: p.type, id: p.id, remote: p.remote });
      });
    },
  };
}

/**
 * Small key-value state per scope, all in the shared 'kv' store keyed [scope, key].
 * @param {{ db: Database, scope: string, bus: { emit(type: string, payload?: unknown): void } }} options
 */
export function createKeyValue({ db, scope, bus }) {
  const STORE = 'kv';
  const scopeRange = { lower: [scope], upper: [scope, []] };
  /** @param {string} key */
  const assertKeyName = (key) => {
    if (typeof key !== 'string' || key === '') throw new ValidationError('Keys must be non-empty strings');
  };
  return {
    /**
     * @template T
     * @param {string} key
     * @param {T} [fallback]
     * @returns {Promise<T | undefined>}
     */
    async get(key, fallback) {
      assertKeyName(key);
      const record = await db.get(STORE, [scope, key]);
      return record === undefined ? fallback : record.value;
    },
    async set(/** @type {string} */ key, /** @type {unknown} */ value) {
      assertKeyName(key);
      if (value === undefined) throw new ValidationError('Use delete() instead of storing undefined');
      await db.put(STORE, { scope, key, value });
      bus.emit('storage:kv-changed', { scope, key });
    },
    async delete(/** @type {string} */ key) {
      assertKeyName(key);
      await db.delete(STORE, [scope, key]);
      bus.emit('storage:kv-changed', { scope, key });
    },
    async keys() {
      const records = await db.getAll(STORE, { range: scopeRange });
      return records.map((r) => /** @type {string} */ (r.key));
    },
    /** @returns {Promise<Record<string, unknown>>} */
    async entries() {
      const records = await db.getAll(STORE, { range: scopeRange });
      return Object.fromEntries(records.map((r) => [r.key, r.value]));
    },
    async clear() {
      await db.delete(STORE, scopeRange);
      bus.emit('storage:kv-changed', { scope });
    },
  };
}

/** Store schema for the shared kv store. */
export const KV_STORE_SCHEMA = { kv: { keyPath: ['scope', 'key'] } };
