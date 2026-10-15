// @ts-check
// Shell state per profile: open windows (with their app's launch args and saved state),
// workspaces, pinned dock apps, recent apps. Saved (debounced) whenever the layout changes and
// when the page is hidden; restored on the next start.

const SAVE_DELAY_MS = 600;
const RECENT_LIMIT = 12;
export const DEFAULT_PINNED = ['nexus.welcome'];

/**
 * @typedef {object} SessionWindow
 * @property {string} appId
 * @property {import('../kernel/types').LaunchArgs} args
 * @property {unknown} [state]           AppInstance.saveState()
 * @property {import('./wm/window-manager.js').SavedWindow} layout
 */

/**
 * @typedef {object} SessionData
 * @property {number} version
 * @property {{ count: number, names: string[], current: number }} workspaces
 * @property {SessionWindow[]} windows
 * @property {string[]} pinned
 * @property {string[]} recentApps
 */

/**
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} store
 * @param {import('../kernel/logger.js').Logger} log
 */
export function createSession(store, log) {
  /** @type {SessionData} */
  let data = {
    version: 1,
    workspaces: { count: 4, names: [], current: 0 },
    windows: [],
    pinned: [...DEFAULT_PINNED],
    recentApps: [],
  };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  /** @type {(() => Omit<SessionData, 'pinned' | 'recentApps' | 'version'>) | null} */
  let collect = null;

  async function save() {
    clearTimeout(timer);
    timer = undefined;
    if (collect) Object.assign(data, collect());
    try {
      await store.set('session', data);
    } catch (error) {
      log.warn('Could not save the desktop session', error);
    }
  }

  return {
    async load() {
      const saved = /** @type {Partial<SessionData> | undefined} */ (await store.get('session'));
      if (saved && typeof saved === 'object') data = { ...data, ...saved, version: 1 };
      return data;
    },
    get data() {
      return data;
    },
    /** @param {() => Omit<SessionData, 'pinned' | 'recentApps' | 'version'>} fn */
    setCollector(fn) {
      collect = fn;
    },
    /** Saves soon (coalesces bursts of layout changes). */
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    },
    save,
    /** @param {string[]} pinned */
    setPinned(pinned) {
      data.pinned = [...new Set(pinned)];
      this.schedule();
    },
    /** @param {string} appId */
    noteLaunch(appId) {
      data.recentApps = [appId, ...data.recentApps.filter((id) => id !== appId)].slice(0, RECENT_LIMIT);
      this.schedule();
    },
  };
}

/** @typedef {ReturnType<typeof createSession>} Session */
