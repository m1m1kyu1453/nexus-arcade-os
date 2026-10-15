// @ts-check
// Notifications: toasts (rendered by the shell from events), a persistent history for the
// notification center, Do-not-disturb (manual or during Focus sessions), per-app mute, and
// optional system notifications while Nexus is in the background.
//
// Events: 'notification:shown' (toast should appear), 'notification:updated',
// 'notification:closed', 'notification:action', 'notifications:history-changed'.

export const NOTIFICATIONS_STORE_SCHEMA = {
  notifications: { keyPath: 'id', indexes: { createdAt: { keyPath: 'createdAt' } } },
};
const STORE = 'notifications';
const HISTORY_LIMIT = 500;
const DEFAULT_TIMEOUT_MS = 6000;

/**
 * @typedef {object} NotificationInit
 * @property {string} title
 * @property {string} [body]
 * @property {string} [icon]                icon id or data URL
 * @property {string} [app]                 source app id ('system' if omitted)
 * @property {{ id: string, label: string }[]} [actions]
 * @property {number | null} [progress]     0–1, or null for indeterminate
 * @property {number} [timeoutMs]           0 = sticky
 * @property {boolean} [silent]             no sound
 * @property {boolean} [urgent]             shown even in Do-not-disturb (alarms)
 * @property {boolean} [transient]          not kept in history (e.g. "Copied")
 */

/**
 * @typedef {object} NotificationRecord
 * @property {string} id
 * @property {string} title
 * @property {string} [body]
 * @property {string} [icon]
 * @property {string} app
 * @property {{ id: string, label: string }[]} actions
 * @property {number | null | undefined} progress
 * @property {number} timeoutMs
 * @property {boolean} urgent
 * @property {number} createdAt
 * @property {boolean} read
 * @property {boolean} suppressed           not shown as a toast (DND or muted)
 */

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.db
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {import('../settings/settings.js').Settings} options.settings
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store  per-app mute list
 * @param {{ play(name: string, category?: string): void }} [options.sound]
 * @param {{ isHidden(): boolean, permission(): NotificationPermission | 'unsupported', request(): Promise<NotificationPermission | 'unsupported'>, show(n: NotificationRecord, onClick: () => void): void }} [options.system]
 * @param {() => number} [options.now]
 * @param {() => string} [options.newId]
 */
export function createNotifications({
  db,
  bus,
  log,
  settings,
  store,
  sound,
  system = browserSystemNotifications(),
  now = Date.now,
  newId = () => crypto.randomUUID(),
}) {
  /** @type {Set<string>} */
  let muted = new Set();
  let focusMode = false;
  /** @type {Map<string, Set<(actionId: string) => void>>} */
  const actionHandlers = new Map();

  const dndActive = () => focusMode || /** @type {boolean} */ (settings.get('system', 'doNotDisturb'));

  async function prune() {
    const count = await db.count(STORE);
    if (count <= HISTORY_LIMIT) return;
    const oldest = await db.getAllKeys(STORE, { index: 'createdAt', limit: count - HISTORY_LIMIT });
    await db.transaction(STORE, 'readwrite', async (tx) => {
      for (const key of oldest) await tx.delete(STORE, key);
    });
  }

  /** @param {NotificationRecord} record */
  async function persist(record) {
    await db.put(STORE, record);
    bus.emit('notifications:history-changed', {});
  }

  /**
   * Shows a notification. Returns a handle to update or close it and to react to actions.
   * @param {NotificationInit} init
   */
  async function notify(init) {
    if (!init?.title) throw new Error('Notifications need a title');
    const app = init.app ?? 'system';
    /** @type {NotificationRecord} */
    const record = {
      id: newId(),
      title: String(init.title),
      ...(init.body ? { body: String(init.body) } : {}),
      ...(init.icon ? { icon: init.icon } : {}),
      app,
      actions: (init.actions ?? []).slice(0, 3),
      progress: init.progress,
      timeoutMs: init.timeoutMs ?? (init.actions?.length || init.progress !== undefined ? 0 : DEFAULT_TIMEOUT_MS),
      urgent: !!init.urgent,
      createdAt: now(),
      read: false,
      suppressed: !init.urgent && (dndActive() || muted.has(app)),
    };
    if (!init.transient) {
      try {
        await persist(record);
        await prune();
      } catch (error) {
        log.warn('Could not store notification in history', error);
      }
    }
    if (!record.suppressed) {
      bus.emit('notification:shown', record);
      if (!init.silent) sound?.play('notification', 'notifications');
      if (system.isHidden() && settings.get('system', 'browserNotifications') && system.permission() === 'granted') {
        try {
          system.show(record, () => bus.emit('notification:clicked', { id: record.id }));
        } catch (error) {
          log.warn('System notification failed', error);
        }
      }
    }

    const handle = {
      id: record.id,
      /** @param {Partial<Pick<NotificationRecord, 'title' | 'body' | 'progress'>>} patch */
      async update(patch) {
        Object.assign(record, patch);
        bus.emit('notification:updated', record);
        if (!init.transient) await persist(record).catch(() => {});
      },
      close() {
        actionHandlers.delete(record.id);
        bus.emit('notification:closed', { id: record.id });
      },
      /** @param {(actionId: string) => void} fn */
      onAction(fn) {
        if (!actionHandlers.has(record.id)) actionHandlers.set(record.id, new Set());
        /** @type {Set<(actionId: string) => void>} */ (actionHandlers.get(record.id)).add(fn);
        return () => actionHandlers.get(record.id)?.delete(fn);
      },
    };
    return handle;
  }

  return {
    notify,

    /** Called by the shell when the user clicks a toast button. */
    triggerAction(/** @type {string} */ id, /** @type {string} */ actionId) {
      bus.emit('notification:action', { id, actionId });
      for (const fn of actionHandlers.get(id) ?? []) {
        try {
          fn(actionId);
        } catch (error) {
          log.error('Notification action handler failed', error);
        }
      }
    },

    /** @param {{ limit?: number }} [options] @returns {Promise<NotificationRecord[]>} newest first */
    history: ({ limit = 100 } = {}) => db.getAll(STORE, { index: 'createdAt', direction: 'prev', limit }),

    async unreadCount() {
      let n = 0;
      await db.iterate(STORE, undefined, (r) => {
        if (!r.read) n++;
      });
      return n;
    },

    /** @param {string} id */
    async markRead(id) {
      const record = await db.get(STORE, id);
      if (record && !record.read) await persist({ ...record, read: true });
    },

    async markAllRead() {
      await db.transaction(STORE, 'readwrite', async (tx) => {
        for (const r of await tx.getAll(STORE)) if (!r.read) await tx.put(STORE, { ...r, read: true });
      });
      bus.emit('notifications:history-changed', {});
    },

    /** @param {string} [id] one entry, or all when omitted */
    async clear(id) {
      if (id) await db.delete(STORE, id);
      else await db.clear(STORE);
      bus.emit('notifications:history-changed', {});
    },

    /** Loads the per-app mute list. */
    async load() {
      const saved = await store.get('muted');
      muted = new Set(Array.isArray(saved) ? saved : []);
    },

    /** @param {string} appId @param {boolean} value */
    async mute(appId, value) {
      if (value) muted.add(appId);
      else muted.delete(appId);
      await store.set('muted', [...muted]);
      bus.emit('notifications:mute-changed', { app: appId, muted: value });
    },

    isMuted: (/** @type {string} */ appId) => muted.has(appId),

    /** Focus sessions turn this on for their duration. */
    setFocusMode(/** @type {boolean} */ on) {
      focusMode = on;
      bus.emit('notifications:dnd-changed', { active: dndActive() });
    },

    get doNotDisturb() {
      return dndActive();
    },

    /** Asks for permission to show system notifications (call from a click). */
    requestSystemPermission: () => system.request(),
    systemPermission: () => system.permission(),
  };
}

/** Browser implementation of system notifications (Notification API). */
export function browserSystemNotifications() {
  const N = globalThis.Notification;
  return {
    isHidden: () => !!globalThis.document?.hidden,
    /** @returns {NotificationPermission | 'unsupported'} */
    permission: () => (N ? N.permission : 'unsupported'),
    /** @returns {Promise<NotificationPermission | 'unsupported'>} */
    request: async () => (N ? N.requestPermission() : 'unsupported'),
    /**
     * @param {{ id: string, title: string, body?: string }} n
     * @param {() => void} onClick
     */
    show(n, onClick) {
      if (!N) return;
      const shown = new N(n.title, { body: n.body, tag: n.id, icon: 'icons/icon-192.png' });
      shown.onclick = () => {
        globalThis.focus?.();
        onClick();
        shown.close();
      };
    },
  };
}

/** @typedef {ReturnType<typeof createNotifications>} Notifications */
