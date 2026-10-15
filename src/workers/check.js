// @ts-check
// Starts the ping worker once and reports whether workers run in this environment.
// The Lite build rewrites `?worker` to `?worker&inline` so the worker starts from a Blob URL.
import PingWorker from './ping.worker.js?worker';

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} true when the worker answered the ping
 */
export function checkWorkers(timeoutMs = 3000) {
  return new Promise((resolve) => {
    /** @type {Worker} */
    let worker;
    const finish = (/** @type {boolean} */ ok) => {
      clearTimeout(timer);
      worker?.terminate();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      worker = new PingWorker();
      worker.addEventListener('message', (e) => finish(e.data?.type === 'pong' && e.data.id === 1));
      worker.addEventListener('error', () => finish(false));
      worker.postMessage({ type: 'ping', id: 1 });
    } catch {
      finish(false);
    }
  });
}
