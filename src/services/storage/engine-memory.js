// @ts-check
// In-memory storage engine with IndexedDB semantics (keys, indexes, unique constraints,
// atomic transactions). Used as the last-resort engine, and — with a `persistence` adapter —
// as the localStorage engine.
import { StorageError } from './types.js';
import {
  assertKey,
  compareKeys,
  encodeKey,
  evaluateKeyPath,
  indexKeys,
  injectKey,
  inRange,
  isValidKey,
} from './keys.js';

/** @typedef {import('./keys.js').Key} Key */
/** @typedef {import('./keys.js').KeyRange} KeyRange */
/** @typedef {import('./types.js').DbSchema} DbSchema */
/** @typedef {import('./types.js').StoreSchema} StoreSchema */
/** @typedef {import('./types.js').Query} Query */

/** @typedef {{ key: Key, value: any }} Entry */
/** @typedef {{ schema: StoreSchema, records: Map<string, Entry>, nextKey: number }} StoreState */
/** @typedef {{ stores: Map<string, StoreState>, tail: Promise<unknown> }} DbState */

/**
 * Snapshot format used by persistence adapters.
 * @typedef {{ nextKey: number, records: Entry[] }} StoreSnapshot
 */

/**
 * @typedef {object} Persistence
 * @property {'localstorage'} kind
 * @property {(db: string) => Promise<Record<string, StoreSnapshot>>} load
 * @property {(db: string, store: string, snapshot: StoreSnapshot) => Promise<void>} save  may throw (e.g. quota)
 * @property {(db: string) => Promise<void>} remove
 * @property {() => Promise<string[]>} list
 */

const clone = (/** @type {any} */ value) => structuredClone(value);

/**
 * @param {{ persistence?: Persistence }} [options]
 * @returns {import('./types.js').Engine}
 */
export function createMemoryEngine({ persistence } = {}) {
  /** @type {Map<string, DbState>} */
  const databases = new Map();

  return {
    kind: persistence ? persistence.kind : 'memory',

    async open(name, schema) {
      let state = databases.get(name);
      if (!state) {
        state = { stores: new Map(), tail: Promise.resolve() };
        const saved = persistence ? await persistence.load(name) : {};
        for (const [storeName, snapshot] of Object.entries(saved)) {
          state.stores.set(storeName, {
            schema: {},
            nextKey: snapshot.nextKey,
            records: new Map(snapshot.records.map((e) => [encodeKey(e.key), e])),
          });
        }
        databases.set(name, state);
      }
      for (const [storeName, storeSchema] of Object.entries(schema)) {
        const existing = state.stores.get(storeName);
        if (existing) existing.schema = storeSchema;
        else state.stores.set(storeName, { schema: storeSchema, records: new Map(), nextKey: 1 });
      }
      return createDatabase(name, /** @type {DbState} */ (state), persistence);
    },

    async deleteDatabase(name) {
      databases.delete(name);
      await persistence?.remove(name);
    },

    async databases() {
      const names = new Set(databases.keys());
      for (const n of (await persistence?.list()) ?? []) names.add(n);
      return [...names];
    },
  };
}

/**
 * @param {string} name
 * @param {DbState} state
 * @param {Persistence | undefined} persistence
 * @returns {import('./types.js').Database}
 */
function createDatabase(name, state, persistence) {
  let closed = false;

  /**
   * Runs `fn` as a serialised transaction. Writes go to copy-on-write store copies that replace
   * the originals only if `fn` and persistence both succeed.
   * @template T
   * @param {string | string[]} storeList
   * @param {'readonly' | 'readwrite'} mode
   * @param {(tx: import('./types.js').StoreOps) => Promise<T>} fn
   * @returns {Promise<T>}
   */
  function transaction(storeList, mode, fn) {
    if (closed) return Promise.reject(new StorageError('InvalidStateError', `Database "${name}" is closed`));
    const scope = new Set(Array.isArray(storeList) ? storeList : [storeList]);
    for (const s of scope) {
      if (!state.stores.has(s)) return Promise.reject(new StorageError('NotFoundError', `No object store "${s}"`));
    }
    const run = async () => {
      /** @type {Map<string, StoreState>} */
      const working = new Map();
      /** @param {string} storeName @param {boolean} write */
      const store = (storeName, write) => {
        if (!scope.has(storeName))
          throw new StorageError('NotFoundError', `Store "${storeName}" is not in this transaction`);
        if (write && mode !== 'readwrite') throw new StorageError('ReadOnlyError', 'Transaction is read-only');
        const copy = working.get(storeName);
        if (copy) return copy;
        const original = /** @type {StoreState} */ (state.stores.get(storeName));
        if (!write) return original;
        const created = { schema: original.schema, nextKey: original.nextKey, records: new Map(original.records) };
        working.set(storeName, created);
        return created;
      };
      const result = await fn(storeOps(store));
      if (working.size) {
        if (persistence) {
          for (const [storeName, s] of working) {
            await persistence.save(name, storeName, { nextKey: s.nextKey, records: [...s.records.values()] });
          }
        }
        for (const [storeName, s] of working) state.stores.set(storeName, s);
      }
      return result;
    };
    const result = state.tail.then(run, run);
    state.tail = result.catch(() => {});
    return result;
  }

  /** @type {(m: 'readonly' | 'readwrite') => (op: keyof import('./types.js').StoreOps) => any} */
  const direct =
    (mode) =>
    (op) =>
    (/** @type {string} */ storeName, /** @type {any[]} */ ...args) =>
      transaction(storeName, mode, (tx) => /** @type {any} */ (tx[op])(storeName, ...args));
  const read = direct('readonly');
  const write = direct('readwrite');

  return {
    kind: persistence ? persistence.kind : 'memory',
    name,
    storeNames: () => [...state.stores.keys()],
    keyPathOf: (store) => state.stores.get(store)?.schema.keyPath ?? null,
    transaction,
    get: read('get'),
    getAll: read('getAll'),
    getAllKeys: read('getAllKeys'),
    count: read('count'),
    iterate: read('iterate'),
    put: write('put'),
    delete: write('delete'),
    clear: write('clear'),
    close() {
      closed = true;
    },
  };
}

/**
 * @param {(storeName: string, write: boolean) => StoreState} store
 * @returns {import('./types.js').StoreOps}
 */
function storeOps(store) {
  /**
   * Entries matching a query, sorted, as { key (index or primary), primaryKey, value }.
   * @param {StoreState} s
   * @param {Query} [query]
   */
  function select(s, query = {}) {
    /** @type {{ key: Key, primaryKey: Key, value: any }[]} */
    let rows = [];
    if (query.index) {
      const index = s.schema.indexes?.[query.index];
      if (!index) throw new StorageError('NotFoundError', `No index "${query.index}"`);
      for (const { key, value } of s.records.values()) {
        for (const k of indexKeys(value, index))
          if (inRange(k, query.range)) rows.push({ key: k, primaryKey: key, value });
      }
      rows.sort((a, b) => compareKeys(a.key, b.key) || compareKeys(a.primaryKey, b.primaryKey));
    } else {
      for (const { key, value } of s.records.values())
        if (inRange(key, query.range)) rows.push({ key, primaryKey: key, value });
      rows.sort((a, b) => compareKeys(a.key, b.key));
    }
    if (query.direction === 'prev') rows.reverse();
    if (query.offset) rows = rows.slice(query.offset);
    if (query.limit !== undefined) rows = rows.slice(0, query.limit);
    return rows;
  }

  /** @param {unknown} value */
  const isRange = (value) => !isValidKey(value) && typeof value === 'object' && value !== null;

  return {
    async get(storeName, key) {
      const entry = store(storeName, false).records.get(encodeKey(assertKey(key)));
      return entry ? clone(entry.value) : undefined;
    },

    async getAll(storeName, query) {
      return select(store(storeName, false), query).map((r) => clone(r.value));
    },

    async getAllKeys(storeName, query) {
      return select(store(storeName, false), query).map((r) => clone(r.primaryKey));
    },

    async count(storeName, query) {
      return select(store(storeName, false), query).length;
    },

    async iterate(storeName, query, fn) {
      for (const row of select(store(storeName, false), query)) {
        if (fn(clone(row.value), clone(row.key), clone(row.primaryKey)) === false) break;
      }
    },

    async put(storeName, value, explicitKey) {
      const s = store(storeName, true);
      const { keyPath, autoIncrement, indexes = {} } = s.schema;
      const stored = clone(value);
      /** @type {Key} */
      let key;
      if (keyPath !== undefined) {
        if (explicitKey !== undefined)
          throw new StorageError('DataError', 'Store uses in-line keys; do not pass a key');
        const found = evaluateKeyPath(stored, keyPath);
        if (found === undefined && autoIncrement && typeof keyPath === 'string') {
          key = s.nextKey++;
          injectKey(stored, keyPath, key);
        } else {
          key = assertKey(found);
        }
      } else if (explicitKey !== undefined) {
        key = assertKey(explicitKey);
      } else if (autoIncrement) {
        key = s.nextKey++;
      } else {
        throw new StorageError('DataError', 'Store uses out-of-line keys; pass a key');
      }
      if (autoIncrement && typeof key === 'number' && key >= s.nextKey) s.nextKey = Math.floor(key) + 1;

      const encoded = encodeKey(key);
      for (const [indexName, index] of Object.entries(indexes)) {
        if (!index.unique) continue;
        for (const k of indexKeys(stored, index)) {
          for (const [otherKey, other] of s.records) {
            if (otherKey !== encoded && indexKeys(other.value, index).some((o) => compareKeys(o, k) === 0)) {
              throw new StorageError('ConstraintError', `Unique index "${indexName}" already contains this key`);
            }
          }
        }
      }
      s.records.set(encoded, { key: clone(key), value: stored });
      return clone(key);
    },

    async delete(storeName, keyOrRange) {
      const s = store(storeName, true);
      if (isRange(keyOrRange)) {
        for (const [encoded, { key }] of s.records) {
          if (inRange(key, /** @type {KeyRange} */ (keyOrRange))) s.records.delete(encoded);
        }
      } else {
        s.records.delete(encodeKey(assertKey(keyOrRange)));
      }
    },

    async clear(storeName) {
      store(storeName, true).records.clear();
    },
  };
}
