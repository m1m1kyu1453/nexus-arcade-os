// @ts-check
// Quota handling: wraps a Database so every quota error is reported once (per burst) through
// `onQuotaExceeded`, and computes a per-store usage breakdown for Settings → Storage.
import { isQuotaError } from './types.js';

/**
 * Returns a Database whose writes report quota errors. The error is still thrown to the caller.
 * @param {import('./types.js').Database} db
 * @param {(info: { store: string | string[] }) => void} onQuotaExceeded
 * @returns {import('./types.js').Database}
 */
export function withQuotaReporting(db, onQuotaExceeded) {
  /**
   * @template {(...args: any[]) => Promise<any>} F
   * @param {F} fn
   * @returns {F}
   */
  const guard = (fn) =>
    /** @type {F} */ (
      async (/** @type {any} */ store, /** @type {any[]} */ ...args) => {
        try {
          return await fn(store, ...args);
        } catch (error) {
          if (isQuotaError(error)) onQuotaExceeded({ store });
          throw error;
        }
      }
    );
  return {
    ...db,
    put: guard(db.put),
    delete: guard(db.delete),
    clear: guard(db.clear),
    transaction: guard(db.transaction),
  };
}

/**
 * Rough size of a stored value in bytes (strings as UTF-16, Blobs by size).
 * @param {unknown} value
 * @param {WeakSet<object>} [seen]
 * @returns {number}
 */
export function approximateSize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return 0;
  switch (typeof value) {
    case 'string':
      return value.length * 2;
    case 'number':
      return 8;
    case 'boolean':
      return 4;
    case 'bigint':
      return 16;
    case 'object': {
      if (seen.has(value)) return 0;
      seen.add(value);
      if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
      if (value instanceof ArrayBuffer) return value.byteLength;
      if (ArrayBuffer.isView(value)) return value.byteLength;
      if (value instanceof Date) return 8;
      if (value instanceof Map) return approximateSize([...value.entries()], seen);
      if (value instanceof Set) return approximateSize([...value.values()], seen);
      let size = 0;
      for (const [k, v] of Object.entries(value)) size += k.length * 2 + approximateSize(v, seen);
      return size;
    }
    default:
      return 0;
  }
}

/**
 * Per-store record count and approximate size, largest first.
 * @param {import('./types.js').Database} db
 * @returns {Promise<{ store: string, count: number, bytes: number }[]>}
 */
export async function storageBreakdown(db) {
  const rows = [];
  for (const store of db.storeNames()) {
    let count = 0;
    let bytes = 0;
    await db.iterate(store, undefined, (value) => {
      count++;
      bytes += approximateSize(value);
    });
    rows.push({ store, count, bytes });
  }
  return rows.sort((a, b) => b.bytes - a.bytes);
}

/**
 * Browser-reported usage and quota for this origin, if available.
 * @returns {Promise<{ usage: number, quota: number } | null>}
 */
export async function estimateQuota() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || estimate.quota === undefined || estimate.usage === undefined) return null;
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}
