// @ts-check
// Per-instance runtime behind ctx.signal, ctx.timers and ctx.guard:
// - every timer and frame loop is error-guarded,
// - suspend() pauses them (timeouts keep their remaining time, loops restart without a huge
//   frame delta), resume() continues,
// - dispose() aborts the signal and clears everything, plus any extra cleanups tracked with
//   `track()` (event listeners, service subscriptions).

/**
 * @typedef {object} Clock
 * @property {() => number} now
 * @property {(fn: () => void, ms: number) => any} setTimeout
 * @property {(id: any) => void} clearTimeout
 * @property {(fn: (t: number) => void) => any} requestAnimationFrame
 * @property {(id: any) => void} cancelAnimationFrame
 */

/** @returns {Clock} */
const browserClock = () => ({
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
  requestAnimationFrame: (fn) =>
    globalThis.requestAnimationFrame
      ? globalThis.requestAnimationFrame(fn)
      : globalThis.setTimeout(() => fn(performance.now()), 16),
  cancelAnimationFrame: (id) =>
    globalThis.cancelAnimationFrame ? globalThis.cancelAnimationFrame(id) : globalThis.clearTimeout(id),
});

/**
 * @param {object} options
 * @param {import('./error-boundary.js').Boundary} options.boundary
 * @param {Clock} [options.clock]
 */
export function createRuntime({ boundary, clock = browserClock() }) {
  const controller = new AbortController();
  let suspended = false;
  let disposed = false;
  /** @type {Set<() => void>} */
  const cleanups = new Set();
  /** @type {Set<{ pause(): void, resume(): void }>} */
  const pausables = new Set();

  /**
   * Registers something that must stop on dispose. Returns an unsubscribe that also untracks.
   * @param {() => void} cleanup
   */
  function track(cleanup) {
    if (disposed) {
      cleanup();
      return () => {};
    }
    cleanups.add(cleanup);
    return () => {
      if (!cleanups.delete(cleanup)) return;
      cleanup();
    };
  }

  /**
   * @param {{ pause(): void, resume(): void, stop(): void }} p
   */
  function managed(p) {
    pausables.add(p);
    if (!suspended) p.resume();
    return track(() => {
      pausables.delete(p);
      p.stop();
    });
  }

  const timers = {
    /**
     * @param {() => void} fn
     * @param {number} ms
     */
    setTimeout(fn, ms) {
      const guarded = boundary.wrap(fn, 'timer');
      let remaining = Math.max(0, ms);
      let startedAt = 0;
      /** @type {any} */
      let id = null;
      /** @type {() => void} */
      let unsub = () => {};
      const p = {
        resume() {
          if (id !== null) return;
          startedAt = clock.now();
          id = clock.setTimeout(() => {
            id = null;
            unsub();
            guarded();
          }, remaining);
        },
        pause() {
          if (id === null) return;
          clock.clearTimeout(id);
          id = null;
          remaining = Math.max(0, remaining - (clock.now() - startedAt));
        },
        stop() {
          if (id !== null) clock.clearTimeout(id);
          id = null;
        },
      };
      unsub = managed(p);
      return unsub;
    },

    /**
     * @param {() => void} fn
     * @param {number} ms
     */
    setInterval(fn, ms) {
      const guarded = boundary.wrap(fn, 'timer');
      const period = Math.max(1, ms);
      /** @type {any} */
      let id = null;
      const tick = () => {
        id = clock.setTimeout(tick, period);
        guarded();
      };
      return managed({
        resume() {
          if (id === null) id = clock.setTimeout(tick, period);
        },
        pause() {
          this.stop();
        },
        stop() {
          if (id !== null) clock.clearTimeout(id);
          id = null;
        },
      });
    },

    /**
     * requestAnimationFrame loop. `dt` is ms since the previous frame (0 on the first frame
     * after start or resume).
     * @param {(dt: number) => void} fn
     */
    loop(fn) {
      const guarded = boundary.wrap(fn, 'timer');
      /** @type {any} */
      let id = null;
      /** @type {number | null} */
      let last = null;
      /** @param {number} t */
      const frame = (t) => {
        const dt = last === null ? 0 : t - last;
        last = t;
        id = clock.requestAnimationFrame(frame);
        guarded(dt);
      };
      return managed({
        resume() {
          if (id !== null) return;
          last = null;
          id = clock.requestAnimationFrame(frame);
        },
        pause() {
          this.stop();
        },
        stop() {
          if (id !== null) clock.cancelAnimationFrame(id);
          id = null;
        },
      });
    },
  };

  return {
    signal: controller.signal,
    timers,
    /**
     * @template {(...args: any[]) => any} F
     * @param {F} fn
     * @returns {F}
     */
    guard: (fn) => boundary.wrap(fn, 'callback'),
    track,
    get suspended() {
      return suspended;
    },
    suspend() {
      if (suspended || disposed) return;
      suspended = true;
      for (const p of pausables) p.pause();
    },
    resume() {
      if (!suspended || disposed) return;
      suspended = false;
      for (const p of pausables) p.resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.abort();
      for (const cleanup of [...cleanups]) {
        try {
          cleanup();
        } catch {
          // Cleanup must not throw past dispose.
        }
      }
      cleanups.clear();
      pausables.clear();
    },
    /** Active timers and loops (System Monitor shows this). */
    get activeCount() {
      return pausables.size;
    },
  };
}

/** @typedef {ReturnType<typeof createRuntime>} Runtime */
