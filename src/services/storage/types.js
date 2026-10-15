// @ts-check
// Shared JSDoc types for the storage engines. Every engine (IndexedDB, localStorage, memory)
// implements `Engine`; tests/unit/storage-engines.test.js runs one contract suite against all.

/**
 * @typedef {object} IndexSchema
 * @property {import('./keys.js').KeyPath} keyPath
 * @property {boolean} [unique]
 * @property {boolean} [multiEntry]
 */

/**
 * @typedef {object} StoreSchema
 * @property {import('./keys.js').KeyPath} [keyPath]  omitted = out-of-line keys (pass a key to put)
 * @property {boolean} [autoIncrement]
 * @property {Record<string, IndexSchema>} [indexes]
 */

/** @typedef {Record<string, StoreSchema>} DbSchema store name → schema */

/**
 * @typedef {object} Query
 * @property {string} [index]       query an index instead of the primary key
 * @property {import('./keys.js').KeyRange} [range]
 * @property {'next' | 'prev'} [direction]
 * @property {number} [offset]
 * @property {number} [limit]
 */

/**
 * Callback for `iterate`; return `false` to stop. Must be synchronous (IndexedDB cursors can't
 * wait for other async work).
 * @typedef {(value: any, key: import('./keys.js').Key, primaryKey: import('./keys.js').Key) => boolean | void} IterateFn
 */

/**
 * Operations available inside a transaction and directly on a database.
 * @typedef {object} StoreOps
 * @property {(store: string, key: import('./keys.js').Key) => Promise<any>} get
 * @property {(store: string, query?: Query) => Promise<any[]>} getAll
 * @property {(store: string, query?: Query) => Promise<import('./keys.js').Key[]>} getAllKeys  primary keys
 * @property {(store: string, query?: Query) => Promise<number>} count
 * @property {(store: string, value: any, key?: import('./keys.js').Key) => Promise<import('./keys.js').Key>} put
 * @property {(store: string, keyOrRange: import('./keys.js').Key | import('./keys.js').KeyRange) => Promise<void>} delete
 * @property {(store: string) => Promise<void>} clear
 * @property {(store: string, query: Query | undefined, fn: IterateFn) => Promise<void>} iterate
 */

/**
 * @typedef {StoreOps & {
 *   kind: 'indexeddb' | 'localstorage' | 'memory',
 *   name: string,
 *   storeNames: () => string[],
 *   transaction: <T>(stores: string | string[], mode: 'readonly' | 'readwrite', fn: (tx: StoreOps) => Promise<T>) => Promise<T>,
 *   close: () => void,
 * }} Database
 */

/**
 * @typedef {object} OpenOptions
 * @property {() => void} [onVersionChange]  another tab upgraded the schema; the connection reopens itself
 * @property {() => void} [onBlocked]        our upgrade waits for another tab to close its connection
 */

/**
 * @typedef {object} Engine
 * @property {'indexeddb' | 'localstorage' | 'memory'} kind
 * @property {(name: string, schema: DbSchema, options?: OpenOptions) => Promise<Database>} open
 * @property {(name: string) => Promise<void>} deleteDatabase
 * @property {() => Promise<string[]>} databases
 */

/** Error names follow the DOMException names IndexedDB uses, so callers can check `error.name`. */
export class StorageError extends Error {
  /** @param {string} name @param {string} message */
  constructor(name, message) {
    super(message);
    this.name = name;
  }
}

/** @param {unknown} error */
export function isQuotaError(error) {
  const name = /** @type {{ name?: string }} */ (error)?.name;
  // Firefox historically used NS_ERROR_DOM_QUOTA_REACHED; Safari sometimes reports code 22.
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /** @type {{ code?: number }} */ (error)?.code === 22
  );
}

export {};
