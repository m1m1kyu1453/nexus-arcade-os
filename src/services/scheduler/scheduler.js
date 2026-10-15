// @ts-check
// Persistent scheduler for reminders, alarms and recurring tasks.
//
// Honest limits: jobs fire only while Nexus is open in a tab. A closed browser cannot run
// them; jobs that came due meanwhile are reported on the next start ("While you were away").
// Only one tab (the leader, via the Web Locks API) fires jobs, so two open tabs don't fire
// twice. Timers are re-armed every minute to survive sleep, throttling and clock changes.
import { nextOccurrence, validateRule } from './recurrence.js';

export const JOBS_STORE_SCHEMA = {
  jobs: { keyPath: 'id', indexes: { nextAt: { keyPath: 'nextAt' }, app: { keyPath: 'app' } } },
};
const STORE = 'jobs';
/** Jobs fired up to this late still count as on time (sleep, throttled timers). */
const GRACE_MS = 2 * 60_000;

/**
 * @typedef {object} JobInit
 * @property {string} title
 * @property {string} [body]
 * @property {'reminder' | 'alarm' | 'task'} [kind]   alarms ignore Do-not-disturb
 * @property {number} at                                 first occurrence (timestamp)
 * @property {import('./recurrence.js').Rule} [rule]   omitted = once
 * @property {Record<string, unknown>} [data]           app data handed back when the job fires
 */

/**
 * @typedef {JobInit & { id: string, app: string, kind: 'reminder' | 'alarm' | 'task', nextAt: number | null, createdAt: number, lastFiredAt?: number }} Job
 */

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.db
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {{ notify(init: import('../notifications/notifications.js').NotificationInit): Promise<unknown> }} options.notifications
 * @param {(fn: () => void) => void} [options.whenLeader]  calls fn once this tab may fire jobs
 * @param {() => number} [options.now]
 * @param {{ setTimeout: typeof setTimeout, clearTimeout: typeof clearTimeout }} [options.timers]
 * @param {() => string} [options.newId]
 * @param {number} [options.recheckMs]  maximum wait between checks
 */
export function createScheduler({
  db,
  bus,
  log,
  notifications,
  whenLeader = webLocksLeader('nexus-scheduler'),
  now = Date.now,
  timers = globalThis,
  newId = () => crypto.randomUUID(),
  recheckMs = 60_000,
}) {
  let leader = false;
  let started = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  /** @param {Job} job */
  function advance(job, after = now()) {
    const next = nextOccurrence(job.rule ?? { freq: 'once' }, job.at, after);
    return { ...job, nextAt: next };
  }

  /** @param {Job} job */
  async function fire(job) {
    log.info(`Job fired: ${job.title}`, { id: job.id, app: job.app });
    bus.emit('scheduler:fired', { job });
    await notifications
      .notify({
        title: job.title,
        body: job.body,
        app: job.app,
        urgent: job.kind === 'alarm',
        timeoutMs: job.kind === 'alarm' ? 0 : undefined,
      })
      .catch((error) => log.warn('Reminder notification failed', error));
  }

  async function runDue() {
    const t = now();
    /** @type {Job[]} */
    const due = await db.getAll(STORE, { index: 'nextAt', range: { upper: t } });
    for (const job of due) {
      await db.put(STORE, { ...advance(job, t), lastFiredAt: t });
      await fire(job);
    }
    await removeFinished();
  }

  async function removeFinished() {
    // Jobs without a next occurrence aren't in the nextAt index (null isn't a valid key).
    const all = /** @type {Job[]} */ (await db.getAll(STORE));
    for (const job of all) if (job.nextAt === null) await db.delete(STORE, job.id);
  }

  async function arm() {
    timers.clearTimeout(timer);
    if (!leader) return;
    const [next] = await db.getAll(STORE, { index: 'nextAt', limit: 1 });
    const wait = next ? Math.max(0, Math.min(next.nextAt - now(), recheckMs)) : recheckMs;
    timer = timers.setTimeout(async () => {
      try {
        await runDue();
      } catch (error) {
        log.error('Scheduler run failed', error);
      }
      await arm();
    }, wait);
  }

  /** Reports jobs that came due while Nexus was closed, then moves them to their next time. */
  async function catchUp() {
    const t = now();
    /** @type {Job[]} */
    const missed = await db.getAll(STORE, { index: 'nextAt', range: { upper: t - GRACE_MS } });
    if (!missed.length) return [];
    for (const job of missed) await db.put(STORE, advance(job, t));
    await removeFinished();
    bus.emit('scheduler:missed', { jobs: missed });
    log.info(`${missed.length} job(s) were missed while Nexus was closed`);
    return missed;
  }

  return {
    /**
     * Starts firing jobs once this tab is the leader. Returns the jobs missed while closed
     * (the caller shows "While you were away").
     * @returns {Promise<Job[]>}
     */
    async start() {
      if (started) return [];
      started = true;
      return new Promise((resolve) => {
        let resolved = false;
        whenLeader(async () => {
          leader = true;
          const missed = await catchUp().catch((error) => {
            log.error('Scheduler catch-up failed', error);
            return [];
          });
          await runDue().catch((error) => log.error('Scheduler run failed', error));
          arm();
          resolved = true;
          resolve(missed);
        });
        // Not the leader (another tab is): nothing missed to report here.
        timers.setTimeout(() => !resolved && resolve([]), 2000);
      });
    },

    stop() {
      timers.clearTimeout(timer);
      leader = false;
    },

    /**
     * @param {string} app
     * @param {JobInit} init
     * @returns {Promise<string>} job id
     */
    async schedule(app, init) {
      if (!init?.title) throw new Error('Jobs need a title');
      if (!Number.isFinite(init.at)) throw new Error('Jobs need a start time ("at")');
      if (init.rule) {
        const error = validateRule(init.rule);
        if (error) throw new Error(error);
      }
      /** @type {Job} */
      const job = { ...init, id: newId(), app, kind: init.kind ?? 'reminder', createdAt: now(), nextAt: null };
      const scheduled = advance(job, now() - 1);
      if (scheduled.nextAt === null) throw new Error('This schedule has no future occurrence');
      await db.put(STORE, scheduled);
      bus.emit('scheduler:changed', { app });
      await arm();
      return job.id;
    },

    /** @param {string} id */
    async cancel(id) {
      const job = await db.get(STORE, id);
      if (!job) return;
      await db.delete(STORE, id);
      bus.emit('scheduler:changed', { app: job.app });
      await arm();
    },

    /** @param {string} id @returns {Promise<Job | undefined>} */
    get: (id) => db.get(STORE, id),

    /** @param {string} [app] @returns {Promise<Job[]>} upcoming first */
    async list(app) {
      /** @type {Job[]} */
      const jobs = app ? await db.getAll(STORE, { index: 'app', range: { only: app } }) : await db.getAll(STORE);
      return jobs.sort((a, b) => (a.nextAt ?? Infinity) - (b.nextAt ?? Infinity));
    },

    get isLeader() {
      return leader;
    },
  };
}

/**
 * Leader election with the Web Locks API: the first tab to get the lock keeps it until it
 * closes; then the next waiting tab becomes leader. Without Web Locks every tab leads.
 * @param {string} name
 * @returns {(fn: () => void) => void}
 */
export function webLocksLeader(name) {
  return (fn) => {
    const locks = globalThis.navigator?.locks;
    if (!locks) {
      fn();
      return;
    }
    locks.request(name, () => {
      fn();
      return new Promise(() => {}); // hold the lock for the lifetime of the tab
    });
  };
}

/** @typedef {ReturnType<typeof createScheduler>} Scheduler */
