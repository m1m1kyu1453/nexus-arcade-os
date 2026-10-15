// @ts-check
// localStorage engine: the memory engine plus a persistence adapter that writes each changed
// store as one JSON entry. Used only when IndexedDB is unavailable. localStorage holds ~5 MB,
// so quota errors are likely; they surface from the failing write and nothing is half-saved.
import { createMemoryEngine } from './engine-memory.js';
import { decode, encode } from './serialize.js';

const PREFIX = 'nexus-db:';

/**
 * @param {Storage} [storage]
 * @returns {import('./types.js').Engine}
 */
export function createLocalStorageEngine(storage = globalThis.localStorage) {
  /** @param {string} db @param {string} store */
  const keyFor = (db, store) => `${PREFIX}${encodeURIComponent(db)}:${encodeURIComponent(store)}`;

  /** @param {string} db */
  const keysOf = (db) => {
    const prefix = `${PREFIX}${encodeURIComponent(db)}:`;
    /** @type {string[]} */
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(prefix)) keys.push(k);
    }
    return { prefix, keys };
  };

  return createMemoryEngine({
    persistence: {
      kind: 'localstorage',
      async load(db) {
        const { prefix, keys } = keysOf(db);
        /** @type {Record<string, import('./engine-memory.js').StoreSnapshot>} */
        const stores = {};
        for (const k of keys) {
          const raw = storage.getItem(k);
          if (raw) stores[decodeURIComponent(k.slice(prefix.length))] = decode(JSON.parse(raw));
        }
        return stores;
      },
      async save(db, store, snapshot) {
        storage.setItem(keyFor(db, store), JSON.stringify(await encode(snapshot)));
      },
      async remove(db) {
        for (const k of keysOf(db).keys) storage.removeItem(k);
      },
      async list() {
        const names = new Set();
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k?.startsWith(PREFIX)) names.add(decodeURIComponent(k.slice(PREFIX.length).split(':')[0]));
        }
        return /** @type {string[]} */ ([...names]);
      },
    },
  });
}
