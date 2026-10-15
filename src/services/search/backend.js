// @ts-check
// Where the search index lives: in a Web Worker when possible, otherwise on the main thread.
import SearchWorker from '../../workers/search.worker.js?worker';
import { createRpcClient } from '../../workers/rpc.js';
import { createSearchIndex } from './search-index.js';

/**
 * @typedef {object} SearchBackend
 * @property {'worker' | 'main-thread'} kind
 * @property {(method: string, ...args: unknown[]) => Promise<any>} call
 */

/** @returns {SearchBackend} */
export function mainThreadBackend() {
  const index = /** @type {Record<string, (...args: any[]) => unknown>} */ (
    /** @type {unknown} */ (createSearchIndex())
  );
  return {
    kind: 'main-thread',
    call: async (method, ...args) => (method === 'size' ? index.size : index[method](...args)),
  };
}

/**
 * Starts the search worker and checks it answers; falls back to the main thread.
 * @param {import('../../kernel/logger.js').Logger} log
 * @returns {Promise<SearchBackend>}
 */
export async function createSearchBackend(log) {
  try {
    const rpc = createRpcClient(/** @type {any} */ (new SearchWorker()), { timeoutMs: 10_000 });
    await rpc.call('size');
    return { kind: 'worker', call: rpc.call };
  } catch (error) {
    log.warn('Search worker unavailable; indexing on the main thread', error);
    return mainThreadBackend();
  }
}
