// @ts-check
// Achievements, XP and levels.
//
// XP: unlocking an achievement gives 25 XP (secret achievements 50 XP). Apps may also award
// small amounts of XP for activity (at most 100 per call).
// Levels: reaching level L needs 50·L·(L−1) total XP — level 2 at 100 XP, 3 at 300, 4 at 600,
// 5 at 1000 … (each level needs 100 XP more than the previous one).
// Stats: per-app counters (games played, notes written…) shown in profiles and App Center.

export const ACHIEVEMENTS_STORE_SCHEMA = {
  achievements: { keyPath: ['app', 'id'], indexes: { app: { keyPath: 'app' } } },
};
const STORE = 'achievements';
export const XP_PER_ACHIEVEMENT = 25;
export const XP_PER_SECRET = 50;
export const MAX_XP_AWARD = 100;

/** Total XP needed to reach `level` (level 1 = 0 XP). @param {number} level */
export const xpForLevel = (level) => 50 * level * (level - 1);

/** @param {number} xp */
export function levelFromXp(xp) {
  const level = Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 50)) / 2);
  return {
    level,
    xp,
    current: xp - xpForLevel(level),
    needed: xpForLevel(level + 1) - xpForLevel(level),
  };
}

/** @typedef {import('../../kernel/types').AchievementDecl} AchievementDecl */
/** @typedef {{ app: string, id: string, progress: number, unlockedAt?: number }} AchievementState */

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.db
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store  xp + stats
 * @param {(app: string, decl: AchievementDecl) => void} [options.onUnlock]  toast + sound
 * @param {() => number} [options.now]
 */
export function createAchievements({ db, bus, log, store, onUnlock, now = Date.now }) {
  /** @type {Map<string, Map<string, AchievementDecl>>} */
  const declared = new Map();
  let xp = 0;
  /** @type {Record<string, Record<string, number>>} */
  let stats = {};

  /** @param {string} app @param {string} id */
  function declOf(app, id) {
    const decl = declared.get(app)?.get(id);
    if (!decl) log.warn(`Unknown achievement "${id}" of ${app}`);
    return decl;
  }

  /** @param {number} amount @param {string} reason */
  async function addXp(amount, reason) {
    const before = levelFromXp(xp).level;
    xp += amount;
    await store.set('xp', xp);
    const after = levelFromXp(xp);
    bus.emit('xp:changed', { ...after, amount, reason });
    if (after.level > before) bus.emit('xp:level-up', { level: after.level });
  }

  /** @param {string} app @param {AchievementDecl} decl @param {AchievementState} state */
  async function complete(app, decl, state) {
    const unlocked = { ...state, progress: decl.goal ?? 1, unlockedAt: now() };
    await db.put(STORE, unlocked);
    await addXp(decl.secret ? XP_PER_SECRET : XP_PER_ACHIEVEMENT, `achievement:${app}/${decl.id}`);
    bus.emit('achievement:unlocked', { app, id: decl.id });
    onUnlock?.(app, decl);
  }

  return {
    async load() {
      xp = Number(await store.get('xp')) || 0;
      const saved = await store.get('stats');
      stats = saved && typeof saved === 'object' ? /** @type {typeof stats} */ (saved) : {};
    },

    /** @param {string} app @param {AchievementDecl[]} decls */
    register(app, decls) {
      declared.set(app, new Map(decls.map((d) => [d.id, d])));
    },

    /** @param {string} app @param {string} id */
    async unlock(app, id) {
      const decl = declOf(app, id);
      if (!decl) return false;
      const state = /** @type {AchievementState | undefined} */ (await db.get(STORE, [app, id]));
      if (state?.unlockedAt) return false;
      await complete(app, decl, state ?? { app, id, progress: 0 });
      return true;
    },

    /**
     * Sets progress towards a goal (never goes down); unlocks when the goal is reached.
     * @param {string} app
     * @param {string} id
     * @param {number} value
     */
    async progress(app, id, value) {
      const decl = declOf(app, id);
      if (!decl) return;
      if (!decl.goal) {
        if (value >= 1) await this.unlock(app, id);
        return;
      }
      /** @type {AchievementState} */
      const state = (await db.get(STORE, [app, id])) ?? { app, id, progress: 0 };
      if (state.unlockedAt || value <= state.progress) return;
      if (value >= decl.goal) await complete(app, decl, state);
      else {
        await db.put(STORE, { ...state, progress: value });
        bus.emit('achievement:progress', { app, id, progress: value, goal: decl.goal });
      }
    },

    /**
     * Awards XP for activity.
     * @param {string} app
     * @param {number} amount
     */
    async award(app, amount) {
      const capped = Math.max(0, Math.min(MAX_XP_AWARD, Math.floor(amount)));
      if (capped) await addXp(capped, `award:${app}`);
    },

    /**
     * Increments (or decrements) a per-app counter.
     * @param {string} app
     * @param {string} key
     * @param {number} [delta]
     */
    async stat(app, key, delta = 1) {
      const appStats = (stats[app] ??= {});
      appStats[key] = (appStats[key] ?? 0) + delta;
      await store.set('stats', stats);
      return appStats[key];
    },

    /** @param {string} app */
    stats: (app) => ({ ...(stats[app] ?? {}) }),

    /**
     * Declared achievements with state. Secret ones hide title/description until unlocked.
     * @param {string} [app]
     */
    async list(app) {
      /** @type {AchievementState[]} */
      const states = app ? await db.getAll(STORE, { index: 'app', range: { only: app } }) : await db.getAll(STORE);
      const byKey = new Map(states.map((s) => [`${s.app}/${s.id}`, s]));
      return [...declared]
        .filter(([a]) => !app || a === app)
        .flatMap(([a, decls]) =>
          [...decls.values()].map((d) => {
            const s = byKey.get(`${a}/${d.id}`);
            const hidden = d.secret && !s?.unlockedAt;
            return {
              app: a,
              id: d.id,
              title: hidden ? null : d.title,
              description: hidden ? null : d.description,
              icon: d.icon,
              secret: !!d.secret,
              goal: d.goal,
              progress: s?.progress ?? 0,
              unlockedAt: s?.unlockedAt ?? null,
            };
          }),
        );
    },

    level: () => levelFromXp(xp),
  };
}

/** @typedef {ReturnType<typeof createAchievements>} Achievements */
