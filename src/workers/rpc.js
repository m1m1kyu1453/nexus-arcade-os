// @ts-check
// Minimal promise-based RPC over postMessage, shared by all Nexus workers.
//   worker side:  exposeRpc(self, { method(...args) { … } })
//   main side:    const rpc = createRpcClient(worker); await rpc.call('method', ...args)

/**
 * @typedef {{ postMessage(message: unknown): void, addEventListener(type: 'message', fn: (e: MessageEvent) => void): void }} Port
 */

/**
 * @param {Port} port
 * @param {Record<string, (...args: any[]) => unknown>} handlers
 */
export function exposeRpc(port, handlers) {
  port.addEventListener('message', async (event) => {
    const { id, method, args } = event.data ?? {};
    if (typeof id !== 'number' || typeof method !== 'string') return;
    const handler = Object.hasOwn(handlers, method) ? handlers[method] : undefined;
    try {
      if (!handler) throw new Error(`Unknown method "${method}"`);
      port.postMessage({ id, result: await handler(...(Array.isArray(args) ? args : [])) });
    } catch (error) {
      const e = /** @type {Error} */ (error);
      port.postMessage({ id, error: { name: e?.name ?? 'Error', message: e?.message ?? String(error) } });
    }
  });
}

/**
 * @param {Port & { terminate?(): void }} port
 * @param {{ timeoutMs?: number }} [options]
 */
export function createRpcClient(port, { timeoutMs = 30_000 } = {}) {
  let nextId = 1;
  /** @type {Map<number, { resolve(v: unknown): void, reject(e: Error): void, timer: ReturnType<typeof setTimeout> }>} */
  const pending = new Map();
  port.addEventListener('message', (event) => {
    const { id, result, error } = event.data ?? {};
    const call = pending.get(id);
    if (!call) return;
    pending.delete(id);
    clearTimeout(call.timer);
    if (error) call.reject(Object.assign(new Error(error.message), { name: error.name }));
    else call.resolve(result);
  });
  return {
    /**
     * @param {string} method
     * @param {...unknown} args
     * @returns {Promise<any>}
     */
    call(method, ...args) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Worker call "${method}" timed out`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        port.postMessage({ id, method, args });
      });
    },
    terminate() {
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(new Error('Worker terminated'));
      }
      pending.clear();
      port.terminate?.();
    },
  };
}
