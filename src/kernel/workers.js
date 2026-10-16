// @ts-check
// Counts the Web Workers Nexus has started (System Monitor → Performance). Wraps the global
// Worker constructor once at boot; a worker counts until `terminate()` is called on it.
// Workers that close themselves from inside can't be seen from here, which the monitor says.

/** @typedef {{ id: number, name: string, startedAt: number }} WorkerInfo */

/** @type {Map<number, WorkerInfo> | null} */
let live = null;

/** Installs the counter (idempotent). @param {typeof globalThis} [scope] */
export function trackWorkers(scope = globalThis) {
  if (live || typeof scope.Worker !== 'function') return;
  const tracked = (live = new Map());
  const Native = scope.Worker;
  let next = 1;
  class TrackedWorker extends Native {
    /** @param {string | URL} url @param {WorkerOptions} [options] */
    constructor(url, options) {
      super(url, options);
      const id = next++;
      const href = String(url);
      // Inline workers (Nexus Lite) have blob:/data: URLs without a useful file name.
      const inline = href.startsWith('blob:') || href.startsWith('data:');
      const name = options?.name || (inline ? 'inline worker' : href.split('/').pop()?.split('?')[0] || 'worker');
      tracked.set(id, {
        id,
        name,
        startedAt: Date.now(),
      });
      const terminate = this.terminate.bind(this);
      this.terminate = () => {
        tracked.delete(id);
        terminate();
      };
    }
  }
  scope.Worker = /** @type {typeof Worker} */ (TrackedWorker);
}

/** @returns {WorkerInfo[]} */
export const liveWorkers = () => [...(live?.values() ?? [])];
