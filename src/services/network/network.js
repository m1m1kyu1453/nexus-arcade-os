// @ts-check
// Log of network requests made on the user's behalf (AI servers, the HTTP client …), for the
// System Monitor's Network tab. Nexus itself never goes online; apps that do (phases 7 and 12)
// record each request here. Kept in memory only: it is a live view, not history.

const LIMIT = 200;

/**
 * @typedef {object} RequestRecord
 * @property {number} id
 * @property {string} app
 * @property {string} method
 * @property {string} url
 * @property {number | null} status    null while pending or when it failed
 * @property {number | null} ms
 * @property {string | null} error
 * @property {number} at
 */

/**
 * @param {object} options
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {() => number} [options.now]
 */
export function createNetworkLog({ bus, now = Date.now }) {
  /** @type {RequestRecord[]} */
  let records = [];
  let next = 1;
  const changed = () => bus.emit('network:changed', { count: records.length });

  return {
    /**
     * Starts a record; call `done` with the response status (or an error) when it finishes.
     * @param {{ app: string, method?: string, url: string }} request
     */
    start({ app, method = 'GET', url }) {
      /** @type {RequestRecord} */
      const record = {
        id: next++,
        app,
        method: method.toUpperCase(),
        url,
        status: null,
        ms: null,
        error: null,
        at: now(),
      };
      records = [record, ...records].slice(0, LIMIT);
      changed();
      return {
        /** @param {{ status?: number, error?: string }} result */
        done({ status, error }) {
          record.status = status ?? null;
          record.error = error ?? null;
          record.ms = now() - record.at;
          changed();
        },
      };
    },
    /** @returns {RequestRecord[]} newest first */
    list: () => records.map((r) => ({ ...r })),
    clear() {
      records = [];
      changed();
    },
  };
}

/** @typedef {ReturnType<typeof createNetworkLog>} NetworkLog */
