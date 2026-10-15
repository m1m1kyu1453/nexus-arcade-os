// @ts-check
// Event bus. Event names and payloads are documented in docs/events.md.
//
// - `type` is a string like 'vfs:changed'. Listening to 'vfs:*' receives every event starting
//   with 'vfs:'; '*' receives everything.
// - Emitting is synchronous. A throwing listener is reported to `onError` and never stops the
//   other listeners.
// - `scope()` returns a view whose listeners can all be removed at once (used per app instance,
//   so listeners are removed automatically on unmount).

/** @typedef {(payload: any, type: string) => void} Listener */
/** @typedef {(error: unknown, info: { type: string }) => void} ErrorHandler */

/**
 * @param {{ onError?: ErrorHandler }} [options]
 */
export function createEventBus({ onError = (error) => console.error(error) } = {}) {
  /** @type {Map<string, Set<Listener>>} exact type → listeners */
  const exact = new Map();
  /** @type {Map<string, Set<Listener>>} prefix (without '*') → listeners */
  const wildcard = new Map();

  /** @param {string} type */
  function tableFor(type) {
    return type.endsWith('*') ? [wildcard, type.slice(0, -1)] : [exact, type];
  }

  /**
   * @param {string} type
   * @param {Listener} fn
   * @returns {() => void} unsubscribe
   */
  function on(type, fn) {
    const [table, key] = /** @type {[Map<string, Set<Listener>>, string]} */ (tableFor(type));
    let set = table.get(key);
    if (!set) table.set(key, (set = new Set()));
    set.add(fn);
    return () => off(type, fn);
  }

  /**
   * @param {string} type
   * @param {Listener} fn
   */
  function off(type, fn) {
    const [table, key] = /** @type {[Map<string, Set<Listener>>, string]} */ (tableFor(type));
    const set = table.get(key);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) table.delete(key);
  }

  /**
   * @param {string} type
   * @param {Listener} fn
   */
  function once(type, fn) {
    /** @type {Listener} */
    const wrapper = (payload, actual) => {
      off(type, wrapper);
      fn(payload, actual);
    };
    return on(type, wrapper);
  }

  /**
   * @param {string} type  must not contain a wildcard
   * @param {unknown} [payload]
   */
  function emit(type, payload) {
    if (type.includes('*')) throw new Error(`Cannot emit a wildcard event: "${type}"`);
    /** @type {Listener[]} */
    const targets = [...(exact.get(type) ?? [])];
    for (const [prefix, set] of wildcard) if (type.startsWith(prefix)) targets.push(...set);
    for (const fn of targets) {
      try {
        fn(payload, type);
      } catch (error) {
        onError(error, { type });
      }
    }
  }

  /** Number of listeners for an exact type or wildcard pattern (for tests and the debug screen). */
  function listenerCount(/** @type {string} */ type) {
    const [table, key] = /** @type {[Map<string, Set<Listener>>, string]} */ (tableFor(type));
    return table.get(key)?.size ?? 0;
  }

  /**
   * A view of the bus that tracks its own listeners. `dispose()` removes them all.
   * @param {{ wrap?: (fn: Listener) => Listener }} [options] e.g. route errors to an app's error boundary
   */
  function scope({ wrap = (fn) => fn } = {}) {
    /** @type {Set<() => void>} */
    const subscriptions = new Set();
    /** @type {Map<Listener, Map<string, () => void>>} */
    const byListener = new Map();

    /** @param {string} type @param {Listener} fn @param {boolean} single */
    function add(type, fn, single) {
      const unsub = (single ? once : on)(type, wrap(fn));
      const remove = () => {
        unsub();
        subscriptions.delete(remove);
        byListener.get(fn)?.delete(type);
      };
      subscriptions.add(remove);
      if (!byListener.has(fn)) byListener.set(fn, new Map());
      /** @type {Map<string, () => void>} */ (byListener.get(fn)).set(type, remove);
      return remove;
    }

    return {
      /** @param {string} type @param {Listener} fn */
      on: (type, fn) => add(type, fn, false),
      /** @param {string} type @param {Listener} fn */
      once: (type, fn) => add(type, fn, true),
      /** @param {string} type @param {Listener} fn */
      off: (type, fn) => byListener.get(fn)?.get(type)?.(),
      emit,
      dispose() {
        for (const remove of [...subscriptions]) remove();
      },
    };
  }

  return { on, once, off, emit, scope, listenerCount };
}

/** @typedef {ReturnType<typeof createEventBus>} EventBus */
