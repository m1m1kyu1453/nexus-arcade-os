// @ts-check
// System log: levels, per-source tags, a ring buffer of the most recent entries, optional
// persistence (debounced) so the log survives reloads, and live subscribers (debug screen,
// System Monitor).

export const LEVELS = /** @type {const} */ (['debug', 'info', 'warn', 'error']);
/** @typedef {typeof LEVELS[number]} Level */

/**
 * @typedef {object} LogEntry
 * @property {number} t        timestamp (ms)
 * @property {Level} level
 * @property {string} source   e.g. 'kernel', 'storage', 'app:nexus.notes'
 * @property {string} message
 * @property {unknown} [data]  JSON-safe copy of the extra data
 */

const MAX_STRING = 4000;

/**
 * Makes a JSON-safe, size-limited copy of arbitrary log data (Errors keep name/message/stack).
 * @param {unknown} value
 * @returns {unknown}
 */
export function toLogData(value) {
  const seen = new WeakSet();
  try {
    const json = JSON.stringify(value, (_key, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      if (typeof v === 'bigint') return `${v}n`;
      if (typeof v === 'string' && v.length > MAX_STRING) return `${v.slice(0, MAX_STRING)}…`;
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
      }
      return v;
    });
    return json === undefined ? undefined : JSON.parse(json);
  } catch {
    return String(value);
  }
}

/**
 * @param {object} [options]
 * @param {number} [options.capacity]  entries kept (oldest dropped first)
 * @param {() => number} [options.now]
 * @param {(entry: LogEntry) => void} [options.echo]  e.g. mirror to the console in dev
 * @param {{ save(entries: LogEntry[]): unknown, delayMs?: number }} [options.persist]
 */
export function createLogger({ capacity = 2000, now = Date.now, echo, persist } = {}) {
  /** @type {LogEntry[]} */
  let buffer = [];
  /** @type {Set<(entry: LogEntry) => void>} */
  const subscribers = new Set();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimer;

  function trim() {
    if (buffer.length > capacity) buffer = buffer.slice(buffer.length - capacity);
  }

  function scheduleSave() {
    if (!persist || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      Promise.resolve(persist.save(buffer.slice())).catch(() => {});
    }, persist.delayMs ?? 1000);
  }

  /**
   * @param {Level} level
   * @param {string} source
   * @param {string} message
   * @param {unknown} [data]
   */
  function log(level, source, message, data) {
    /** @type {LogEntry} */
    const entry = { t: now(), level, source, message: String(message) };
    if (data !== undefined) entry.data = toLogData(data);
    buffer.push(entry);
    trim();
    echo?.(entry);
    for (const fn of subscribers) {
      try {
        fn(entry);
      } catch {
        // A broken subscriber must never break logging.
      }
    }
    scheduleSave();
    return entry;
  }

  /** @param {string} source */
  function child(source) {
    return {
      /** @param {string} message @param {unknown} [data] */
      debug: (message, data) => log('debug', source, message, data),
      /** @param {string} message @param {unknown} [data] */
      info: (message, data) => log('info', source, message, data),
      /** @param {string} message @param {unknown} [data] */
      warn: (message, data) => log('warn', source, message, data),
      /** @param {string} message @param {unknown} [data] */
      error: (message, data) => log('error', source, message, data),
    };
  }

  /**
   * @param {{ minLevel?: Level, source?: string, since?: number, limit?: number }} [filter]
   *   `source` matches exactly, or as a prefix when it ends with '*'.
   */
  function entries({ minLevel, source, since, limit } = {}) {
    const min = minLevel ? LEVELS.indexOf(minLevel) : 0;
    const prefix = source?.endsWith('*') ? source.slice(0, -1) : undefined;
    const result = buffer.filter(
      (e) =>
        LEVELS.indexOf(e.level) >= min &&
        (source === undefined || (prefix !== undefined ? e.source.startsWith(prefix) : e.source === source)) &&
        (since === undefined || e.t >= since),
    );
    return limit === undefined ? result : result.slice(-limit);
  }

  return {
    log,
    child,
    entries,
    /** @param {(entry: LogEntry) => void} fn */
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    /** Puts entries saved by an earlier session before the current ones. */
    restore(/** @type {LogEntry[]} */ saved) {
      if (!Array.isArray(saved)) return;
      buffer = [...saved.filter(isLogEntry), ...buffer];
      trim();
    },
    clear() {
      buffer = [];
      scheduleSave();
    },
    /** Writes pending changes now (e.g. on page hide). */
    async flush() {
      if (!persist) return;
      clearTimeout(saveTimer);
      saveTimer = undefined;
      await persist.save(buffer.slice());
    },
    get size() {
      return buffer.length;
    },
  };
}

/** @param {unknown} e @returns {e is LogEntry} */
function isLogEntry(e) {
  if (!e || typeof e !== 'object') return false;
  const x = /** @type {Record<string, unknown>} */ (e);
  return (
    typeof x.t === 'number' &&
    LEVELS.includes(/** @type {Level} */ (x.level)) &&
    typeof x.source === 'string' &&
    typeof x.message === 'string'
  );
}

/** @typedef {ReturnType<typeof createLogger>} SystemLogger */
/** @typedef {ReturnType<SystemLogger['child']>} Logger */
