// @ts-check
// Error boundary per app window. The first uncaught error from the app (mount, a guarded
// callback, a rejected promise of a guarded async callback) "crashes" the window: the boundary
// trips once and reports to `onCrash`. Later errors from the same dying instance are ignored.

/**
 * @typedef {'load' | 'mount' | 'unmount' | 'event' | 'timer' | 'callback' | 'intent' | 'lifecycle'} ErrorSource
 */

/**
 * @param {{ onCrash: (error: unknown, source: ErrorSource) => void }} options
 */
export function createBoundary({ onCrash }) {
  let tripped = false;

  /** @param {unknown} error @param {ErrorSource} source */
  function report(error, source) {
    if (tripped) return;
    tripped = true;
    onCrash(error, source);
  }

  return {
    report,
    get tripped() {
      return tripped;
    },
    /**
     * Wraps a callback: sync throws and async rejections are reported instead of escaping.
     * @template {(...args: any[]) => any} F
     * @param {F} fn
     * @param {ErrorSource} [source]
     * @returns {F}
     */
    wrap(fn, source = 'callback') {
      return /** @type {F} */ (
        /** @this {unknown} */
        function guarded(/** @type {any[]} */ ...args) {
          if (tripped) return undefined;
          try {
            // Forward `this` for DOM handlers.
            const result = fn.apply(this, args);
            if (result && typeof result.then === 'function') {
              return result.then(undefined, (/** @type {unknown} */ error) => report(error, source));
            }
            return result;
          } catch (error) {
            report(error, source);
            return undefined;
          }
        }
      );
    },
    /**
     * Runs a (possibly async) step; returns `{ ok: false }` if it threw (already reported).
     * @template T
     * @param {() => T | Promise<T>} fn
     * @param {ErrorSource} source
     * @returns {Promise<{ ok: true, value: T } | { ok: false }>}
     */
    async run(fn, source) {
      try {
        return { ok: true, value: await fn() };
      } catch (error) {
        report(error, source);
        return { ok: false };
      }
    },
  };
}

/** @typedef {ReturnType<typeof createBoundary>} Boundary */

/**
 * @typedef {object} CrashReport
 * @property {string} appId
 * @property {string} appVersion
 * @property {string} instanceId
 * @property {ErrorSource} source
 * @property {string} name
 * @property {string} message
 * @property {string} [stack]
 * @property {string} time       ISO timestamp
 * @property {string} os         Nexus version + edition
 * @property {string} userAgent
 * @property {import('./logger.js').LogEntry[]} recentLog
 */

/**
 * @param {object} info
 * @param {{ id: string, version: string }} info.manifest
 * @param {string} info.instanceId
 * @param {unknown} info.error
 * @param {ErrorSource} info.source
 * @param {import('./logger.js').LogEntry[]} info.recentLog
 * @param {string} info.os
 * @param {number} [info.now]
 * @returns {CrashReport}
 */
export function createCrashReport({ manifest, instanceId, error, source, recentLog, os, now = Date.now() }) {
  const e = error instanceof Error ? error : new Error(typeof error === 'string' ? error : safeString(error));
  return {
    appId: manifest.id,
    appVersion: manifest.version,
    instanceId,
    source,
    name: e.name,
    message: e.message,
    stack: e.stack,
    time: new Date(now).toISOString(),
    os,
    userAgent: globalThis.navigator?.userAgent ?? 'unknown',
    recentLog,
  };
}

/**
 * Plain-text report for "Copy report".
 * @param {CrashReport} r
 */
export function formatCrashReport(r) {
  const log = r.recentLog
    .map((e) => `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.source}] ${e.message}`)
    .join('\n');
  return [
    `Nexus crash report`,
    `App: ${r.appId} ${r.appVersion} (instance ${r.instanceId})`,
    `When: ${r.time} during ${r.source}`,
    `Nexus: ${r.os}`,
    `Browser: ${r.userAgent}`,
    '',
    `${r.name}: ${r.message}`,
    r.stack ?? '(no stack)',
    '',
    'Recent log:',
    log || '(empty)',
  ].join('\n');
}

/** @param {unknown} value */
function safeString(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
