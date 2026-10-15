// Deterministic clock for runtime tests: timers and animation frames advance only on demand.
export function createFakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map(); // id → { at, fn }
  const frames = new Map(); // id → fn

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(fn) {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    /** Advances time, firing due timers in order. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    /** Runs one animation frame `ms` after the current time. */
    frame(ms = 16) {
      now += ms;
      const current = [...frames.values()];
      frames.clear();
      for (const fn of current) fn(now);
    },
    get pending() {
      return timers.size + frames.size;
    },
  };
}
