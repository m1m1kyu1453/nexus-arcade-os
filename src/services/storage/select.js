// @ts-check
// Picks the best available storage engine: IndexedDB, then localStorage, then memory.
// The fallbacks exist for browsers/modes where IndexedDB is blocked; the UI must show the
// returned `warning` (data may be small-capacity or lost on reload).
import { createIdbEngine } from './engine-idb.js';
import { createLocalStorageEngine } from './engine-localstorage.js';
import { createMemoryEngine } from './engine-memory.js';

/**
 * @typedef {object} SelectedEngine
 * @property {import('./types.js').Engine} engine
 * @property {null | 'localstorage' | 'memory'} warning  null when IndexedDB works
 * @property {string[]} reasons  why better engines were skipped
 */

/**
 * @param {object} [env]
 * @param {IDBFactory} [env.indexedDB]
 * @param {typeof IDBKeyRange} [env.IDBKeyRange]
 * @param {Storage} [env.localStorage]
 * @param {string} [env.probeName] database used to test IndexedDB (deleted again)
 * @returns {Promise<SelectedEngine>}
 */
export async function selectEngine(env = {}) {
  /** @type {string[]} */
  const reasons = [];
  const idbFactory = env.indexedDB ?? safe(() => globalThis.indexedDB);
  if (idbFactory) {
    const engine = createIdbEngine({ indexedDB: idbFactory, IDBKeyRange: env.IDBKeyRange });
    const probeName = env.probeName ?? 'nexus-probe';
    try {
      const db = await withTimeout(engine.open(probeName, { probe: {} }), 5000);
      await db.put('probe', 1, 'ok');
      db.close();
      await withTimeout(engine.deleteDatabase(probeName), 5000).catch(() => {});
      return { engine, warning: null, reasons };
    } catch (error) {
      reasons.push(`IndexedDB unavailable: ${describe(error)}`);
    }
  } else {
    reasons.push('IndexedDB unavailable: not supported');
  }

  const storage = env.localStorage ?? safe(() => globalThis.localStorage);
  if (storage) {
    try {
      const key = 'nexus-probe';
      storage.setItem(key, '1');
      storage.removeItem(key);
      return { engine: createLocalStorageEngine(storage), warning: 'localstorage', reasons };
    } catch (error) {
      reasons.push(`localStorage unavailable: ${describe(error)}`);
    }
  } else {
    reasons.push('localStorage unavailable: not supported');
  }
  return { engine: createMemoryEngine(), warning: 'memory', reasons };
}

/**
 * Accessing indexedDB/localStorage can itself throw (e.g. SecurityError on blocked cookies).
 * @template T
 * @param {() => T} get
 * @returns {T | undefined}
 */
function safe(get) {
  try {
    return get() ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Some browsers leave IndexedDB requests pending forever in restricted modes.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** @param {unknown} error */
function describe(error) {
  const e = /** @type {{ name?: string, message?: string }} */ (error);
  return e?.name && e?.message ? `${e.name}: ${e.message}` : String(error);
}
