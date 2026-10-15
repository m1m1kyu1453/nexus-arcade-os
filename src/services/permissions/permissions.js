// @ts-check
// Permission model. Built-in apps are trusted: what they declare is granted. Plugins (phase 13)
// must declare a permission and are asked on first use; answers are remembered and can be
// revoked in Settings → Apps. Undeclared permissions are always denied for plugins.

/** @typedef {import('../../kernel/types').Permission} Permission */
/** @typedef {'granted' | 'denied'} Decision */

/**
 * @param {object} options
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store
 * @param {(appId: string, permission: Permission) => Promise<boolean>} options.ask  shows the prompt
 * @param {(appId: string) => { builtIn: boolean, declared: Permission[] } | undefined} options.appInfo
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 */
export function createPermissions({ store, ask, appInfo, bus }) {
  /** @type {Record<string, Partial<Record<Permission, Decision>>>} */
  let decisions = {};
  /** @type {Map<string, Promise<boolean>>} one prompt at a time per app+permission */
  const asking = new Map();

  const save = () => store.set('decisions', decisions);

  return {
    async load() {
      const saved = await store.get('decisions');
      decisions = saved && typeof saved === 'object' ? /** @type {typeof decisions} */ (saved) : {};
    },

    /**
     * Whether `appId` may use `permission`, asking the user for plugins the first time.
     * @param {string} appId
     * @param {Permission} permission
     */
    async request(appId, permission) {
      const app = appInfo(appId);
      if (!app || !app.declared.includes(permission)) return false;
      if (app.builtIn) return true;
      const decision = decisions[appId]?.[permission];
      if (decision) return decision === 'granted';
      const key = `${appId}\u0000${permission}`;
      let pending = asking.get(key);
      if (!pending) {
        pending = ask(appId, permission).then(async (granted) => {
          (decisions[appId] ??= {})[permission] = granted ? 'granted' : 'denied';
          await save();
          bus.emit('permissions:changed', { app: appId, permission, granted });
          return granted;
        });
        pending.finally(() => asking.delete(key));
        asking.set(key, pending);
      }
      return pending;
    },

    /** Answers without prompting (for UI that shows the current state). */
    status(/** @type {string} */ appId, /** @type {Permission} */ permission) {
      const app = appInfo(appId);
      if (!app || !app.declared.includes(permission)) return 'denied';
      if (app.builtIn) return 'granted';
      return decisions[appId]?.[permission] ?? 'ask';
    },

    /** Forgets a decision so the app asks again next time. */
    async revoke(/** @type {string} */ appId, /** @type {Permission} */ permission) {
      if (!decisions[appId]) return;
      delete decisions[appId][permission];
      await save();
      bus.emit('permissions:changed', { app: appId, permission, granted: false });
    },
  };
}

/** @typedef {ReturnType<typeof createPermissions>} Permissions */
