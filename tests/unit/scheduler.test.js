import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createScheduler, JOBS_STORE_SCHEMA } from '../../src/services/scheduler/scheduler.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';

const MIN = 60_000;

/** Manual timers + clock. */
function fakeTime(start) {
  let t = start;
  let next = 1;
  const pending = new Map();
  return {
    now: () => t,
    timers: {
      setTimeout: (fn, ms) => {
        const id = next++;
        pending.set(id, { at: t + ms, fn });
        return id;
      },
      clearTimeout: (id) => pending.delete(id),
    },
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, p]) => p.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        t = due[1].at;
        await due[1].fn();
        await new Promise((r) => setTimeout(r, 0));
      }
      t = end;
    },
  };
}

async function setup({ start = Date.UTC(2026, 9, 15, 8), leader = true, db, recheckMs } = {}) {
  db ??= await createIdbEngine().open('p', JOBS_STORE_SCHEMA);
  const bus = createEventBus();
  const time = fakeTime(start);
  const notifications = { notify: vi.fn(async () => {}) };
  let n = 0;
  const scheduler = createScheduler({
    db,
    bus,
    log: createLogger().child('scheduler'),
    notifications,
    whenLeader: (fn) => leader && fn(),
    now: time.now,
    timers: time.timers,
    newId: () => `j${++n}`,
    recheckMs,
  });
  return { db, bus, time, notifications, scheduler };
}

describe('scheduler', () => {
  it('fires a one-off reminder on time and removes it', async () => {
    const { scheduler, time, notifications, bus } = await setup();
    await scheduler.start();
    const fired = vi.fn();
    bus.on('scheduler:fired', fired);
    await scheduler.schedule('nexus.tasks', { title: 'Call mum', at: time.now() + 5 * MIN });
    expect((await scheduler.list())[0]).toMatchObject({
      title: 'Call mum',
      kind: 'reminder',
      nextAt: time.now() + 5 * MIN,
    });
    await time.advance(4 * MIN);
    expect(notifications.notify).not.toHaveBeenCalled();
    await time.advance(1 * MIN);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call mum', app: 'nexus.tasks', urgent: false }),
    );
    expect(fired).toHaveBeenCalledTimes(1);
    expect(await scheduler.list()).toEqual([]);
  });

  it('re-arms recurring jobs and stops after count', async () => {
    const { scheduler, time, notifications } = await setup({ recheckMs: 6 * 60 * MIN });
    await scheduler.start();
    await scheduler.schedule('nexus.habits', {
      title: 'Water',
      at: time.now() + MIN,
      rule: { freq: 'daily', count: 2 },
    });
    await time.advance(MIN);
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect((await scheduler.list())[0].nextAt).toBe(time.now() + 24 * 60 * MIN);
    await time.advance(24 * 60 * MIN);
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(await scheduler.list()).toEqual([]);
  });

  it('alarms are urgent (break through Do-not-disturb) and sticky', async () => {
    const { scheduler, time, notifications } = await setup();
    await scheduler.start();
    await scheduler.schedule('nexus.clock', { title: 'Wake up', kind: 'alarm', at: time.now() + MIN });
    await time.advance(MIN);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ urgent: true, timeoutMs: 0 }));
  });

  it('reports jobs missed while closed and moves them to their next time', async () => {
    const first = await setup();
    const { db } = first;
    await first.scheduler.schedule('nexus.tasks', { title: 'Missed once', at: first.time.now() + MIN });
    await first.scheduler.schedule('nexus.habits', {
      title: 'Daily',
      at: first.time.now() + MIN,
      rule: { freq: 'daily' },
    });
    await first.scheduler.schedule('nexus.tasks', { title: 'Later', at: first.time.now() + 48 * 60 * MIN });

    // Reopen 3 hours later.
    const later = await setup({ start: first.time.now() + 3 * 60 * MIN, db });
    const missedEvent = vi.fn();
    later.bus.on('scheduler:missed', missedEvent);
    const missed = await later.scheduler.start();
    expect(missed.map((j) => j.title).sort()).toEqual(['Daily', 'Missed once']);
    expect(missedEvent).toHaveBeenCalled();
    expect(later.notifications.notify).not.toHaveBeenCalled(); // reported, not fired late
    const remaining = await later.scheduler.list();
    expect(remaining.map((j) => j.title)).toEqual(['Daily', 'Later']);
    expect(remaining[0].nextAt).toBe(first.time.now() + MIN + 24 * 60 * MIN);
  });

  it('only the leader tab fires jobs', async () => {
    const { scheduler, time, notifications } = await setup({ leader: false });
    const startPromise = scheduler.start();
    await time.advance(2000);
    expect(await startPromise).toEqual([]);
    await scheduler.schedule('a.b', { title: 'x', at: time.now() + MIN });
    await time.advance(5 * MIN);
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(scheduler.isLeader).toBe(false);
  });

  it('cancels jobs and lists them per app', async () => {
    const { scheduler, time } = await setup();
    const a = await scheduler.schedule('app.a', { title: 'A', at: time.now() + 2 * MIN });
    await scheduler.schedule('app.b', { title: 'B', at: time.now() + MIN });
    expect((await scheduler.list()).map((j) => j.title)).toEqual(['B', 'A']);
    expect((await scheduler.list('app.a')).map((j) => j.title)).toEqual(['A']);
    await scheduler.cancel(a);
    expect((await scheduler.list()).map((j) => j.title)).toEqual(['B']);
  });

  it('validates new jobs', async () => {
    const { scheduler, time } = await setup();
    await expect(scheduler.schedule('a', { at: time.now() })).rejects.toThrow(/title/);
    await expect(scheduler.schedule('a', { title: 'x' })).rejects.toThrow(/start time/);
    await expect(scheduler.schedule('a', { title: 'x', at: time.now(), rule: { freq: 'hourly' } })).rejects.toThrow(
      /frequency/,
    );
    await expect(scheduler.schedule('a', { title: 'x', at: time.now() - MIN })).rejects.toThrow(/no future/);
  });
});
