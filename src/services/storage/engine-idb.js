// @ts-check
// IndexedDB engine.
//
// Schemas are declarative: on open, missing stores and indexes are created by bumping the
// database version (no hand-maintained version numbers). Stores are never deleted, so an
// older tab or an older Lite file keeps working on a database a newer version upgraded.
// When another tab upgrades, our connection closes itself and reopens on the next operation.
import { StorageError } from './types.js';

/** @typedef {import('./keys.js').Key} Key */
/** @typedef {import('./keys.js').KeyRange} KeyRange */
/** @typedef {import('./types.js').DbSchema} DbSchema */
/** @typedef {import('./types.js').Query} Query */

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function done(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param {{ indexedDB?: IDBFactory, IDBKeyRange?: typeof IDBKeyRange }} [env]
 * @returns {import('./types.js').Engine}
 */
export function createIdbEngine(env = {}) {
  const factory = env.indexedDB ?? globalThis.indexedDB;
  const KeyRange = env.IDBKeyRange ?? globalThis.IDBKeyRange;

  /** @param {KeyRange | undefined} range */
  function toIdbRange(range) {
    if (!range) return undefined;
    if ('only' in range) return KeyRange.only(range.only);
    const { lower, upper, lowerOpen = false, upperOpen = false } = range;
    if (lower !== undefined && upper !== undefined) return KeyRange.bound(lower, upper, lowerOpen, upperOpen);
    if (lower !== undefined) return KeyRange.lowerBound(lower, lowerOpen);
    if (upper !== undefined) return KeyRange.upperBound(upper, upperOpen);
    return undefined;
  }

  /** @param {IDBDatabase} db @param {DbSchema} schema */
  function needsUpgrade(db, schema) {
    const names = db.objectStoreNames;
    const missingStore = Object.keys(schema).some((s) => !names.contains(s));
    if (missingStore) return true;
    if (!Object.values(schema).some((s) => s.indexes)) return false;
    const tx = db.transaction(Object.keys(schema), 'readonly');
    return Object.entries(schema).some(([storeName, storeSchema]) => {
      const store = tx.objectStore(storeName);
      return Object.entries(storeSchema.indexes ?? {}).some(
        ([indexName, index]) => !store.indexNames.contains(indexName) || !sameIndex(store.index(indexName), index),
      );
    });
  }

  /** @param {IDBIndex} actual @param {import('./types.js').IndexSchema} wanted */
  function sameIndex(actual, wanted) {
    return (
      JSON.stringify(actual.keyPath) === JSON.stringify(wanted.keyPath) &&
      actual.unique === !!wanted.unique &&
      actual.multiEntry === !!wanted.multiEntry
    );
  }

  /** @param {IDBDatabase} db @param {IDBTransaction} tx @param {DbSchema} schema */
  function upgrade(db, tx, schema) {
    for (const [storeName, storeSchema] of Object.entries(schema)) {
      const store = db.objectStoreNames.contains(storeName)
        ? tx.objectStore(storeName)
        : db.createObjectStore(storeName, {
            keyPath: storeSchema.keyPath,
            autoIncrement: !!storeSchema.autoIncrement,
          });
      for (const [indexName, index] of Object.entries(storeSchema.indexes ?? {})) {
        if (store.indexNames.contains(indexName)) {
          if (sameIndex(store.index(indexName), index)) continue;
          store.deleteIndex(indexName);
        }
        store.createIndex(indexName, index.keyPath, { unique: !!index.unique, multiEntry: !!index.multiEntry });
      }
    }
  }

  /**
   * @param {string} name
   * @param {DbSchema} schema
   * @param {import('./types.js').OpenOptions} options
   * @returns {Promise<IDBDatabase>}
   */
  async function connect(name, schema, options) {
    let db = await done(factory.open(name));
    if (needsUpgrade(db, schema)) {
      const version = db.version + 1;
      db.close();
      const request = factory.open(name, version);
      request.onupgradeneeded = () =>
        upgrade(request.result, /** @type {IDBTransaction} */ (request.transaction), schema);
      request.onblocked = () => options.onBlocked?.();
      try {
        db = await done(request);
      } catch (error) {
        // Another tab upgraded first (VersionError): its schema includes ours or will be retried.
        if (/** @type {Error} */ (error)?.name !== 'VersionError') throw error;
        return connect(name, schema, options);
      }
    }
    return db;
  }

  return {
    kind: 'indexeddb',

    async open(name, schema, options = {}) {
      /** @type {Promise<IDBDatabase> | null} */
      let connection = null;
      let closed = false;
      /** Latest open connection, for synchronous metadata like store names. */
      /** @type {IDBDatabase} */
      let current;

      const getDb = () => {
        if (closed) return Promise.reject(new StorageError('InvalidStateError', `Database "${name}" is closed`));
        if (!connection) {
          connection = connect(name, schema, options).then((db) => {
            current = db;
            db.onversionchange = () => {
              db.close();
              connection = null;
              options.onVersionChange?.();
            };
            return db;
          });
          connection.catch(() => (connection = null));
        }
        return connection;
      };
      await getDb();

      /**
       * @template T
       * @param {string | string[]} stores
       * @param {'readonly' | 'readwrite'} mode
       * @param {(tx: import('./types.js').StoreOps) => Promise<T>} fn
       * @returns {Promise<T>}
       */
      async function transaction(stores, mode, fn) {
        const idb = await getDb();
        const tx = idb.transaction(stores, mode);
        const finished = new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve(undefined);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new StorageError('AbortError', 'Transaction aborted'));
        });
        // Rejections of `finished` are reported through the catch below or the await at the end.
        finished.catch(() => {});
        let result;
        try {
          result = await fn(txOps(tx));
        } catch (error) {
          try {
            tx.abort();
          } catch {
            // Already finished or aborted.
          }
          throw error;
        }
        await finished;
        return result;
      }

      /** @param {IDBTransaction} tx @returns {import('./types.js').StoreOps} */
      function txOps(tx) {
        /** @param {string} storeName @param {Query} [query] */
        const source = (storeName, query) => {
          const store = tx.objectStore(storeName);
          return query?.index ? store.index(query.index) : store;
        };

        /**
         * Walks a cursor applying offset/limit/direction; `visit` returns false to stop.
         * @param {string} storeName
         * @param {Query | undefined} query
         * @param {(cursor: IDBCursorWithValue) => boolean | void} visit
         */
        const walk = (storeName, query, visit) =>
          new Promise((resolve, reject) => {
            const request = source(storeName, query).openCursor(toIdbRange(query?.range), query?.direction ?? 'next');
            let skipped = !query?.offset;
            let seen = 0;
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const cursor = request.result;
              if (!cursor) return resolve(undefined);
              if (!skipped) {
                skipped = true;
                cursor.advance(/** @type {number} */ (query?.offset));
                return;
              }
              if (query?.limit !== undefined && seen >= query.limit) return resolve(undefined);
              seen++;
              let keepGoing;
              try {
                keepGoing = visit(cursor);
              } catch (error) {
                return reject(error);
              }
              if (keepGoing === false) return resolve(undefined);
              cursor.continue();
            };
          });

        return {
          get: (storeName, key) => done(tx.objectStore(storeName).get(key)),
          async getAll(storeName, query) {
            if (!query?.offset && query?.direction !== 'prev') {
              return done(source(storeName, query).getAll(toIdbRange(query?.range), query?.limit));
            }
            /** @type {any[]} */
            const out = [];
            await walk(storeName, query, (c) => void out.push(c.value));
            return out;
          },
          async getAllKeys(storeName, query) {
            /** @type {Key[]} */
            const out = [];
            await walk(storeName, query, (c) => void out.push(/** @type {Key} */ (c.primaryKey)));
            return out;
          },
          async count(storeName, query) {
            const n = await done(source(storeName, query).count(toIdbRange(query?.range)));
            const afterOffset = Math.max(0, n - (query?.offset ?? 0));
            return query?.limit === undefined ? afterOffset : Math.min(afterOffset, query.limit);
          },
          iterate: (storeName, query, fn) =>
            walk(storeName, query, (c) => fn(c.value, /** @type {Key} */ (c.key), /** @type {Key} */ (c.primaryKey))),
          put: (storeName, value, key) =>
            done(tx.objectStore(storeName).put(value, key)).then((k) => /** @type {Key} */ (k)),
          async delete(storeName, keyOrRange) {
            const isRange =
              typeof keyOrRange === 'object' &&
              keyOrRange !== null &&
              !Array.isArray(keyOrRange) &&
              !(keyOrRange instanceof Date) &&
              !(keyOrRange instanceof ArrayBuffer) &&
              !ArrayBuffer.isView(keyOrRange);
            const target = isRange ? toIdbRange(/** @type {KeyRange} */ (keyOrRange)) : keyOrRange;
            await done(tx.objectStore(storeName).delete(/** @type {IDBValidKey | IDBKeyRange} */ (target)));
          },
          async clear(storeName) {
            await done(tx.objectStore(storeName).clear());
          },
        };
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
        kind: 'indexeddb',
        name,
        storeNames: () => [...current.objectStoreNames],
        keyPathOf: (store) => current.transaction(store, 'readonly').objectStore(store).keyPath ?? null,
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
          connection?.then((c) => c.close()).catch(() => {});
          connection = null;
        },
      };
    },

    async deleteDatabase(name) {
      await new Promise((resolve, reject) => {
        const request = factory.deleteDatabase(name);
        request.onsuccess = () => resolve(undefined);
        request.onerror = () => reject(request.error);
        // Blocked: other connections get `versionchange` and close themselves; success follows.
      });
    },

    async databases() {
      if (!factory.databases) return [];
      return (await factory.databases()).map((d) => /** @type {string} */ (d.name)).filter(Boolean);
    },
  };
}
