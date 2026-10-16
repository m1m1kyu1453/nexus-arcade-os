// @ts-check
// The administrative parts of `ctx.system` (Settings, System Monitor, App Center): storage,
// backup, shortcuts, profiles, privacy, notifications and default apps. Plain data and verbs
// only; see system-api.js for who gets this.
import { comboFromEvent, formatShortcut } from '../services/commands/keys.js';
import { getPersistence, requestPersistence } from '../services/storage/persist.js';
import { deleteQuarantined, listQuarantine } from '../services/storage/quarantine.js';
import { approximateSize, estimateQuota } from '../services/storage/quota.js';
import { downloadBlob } from '../services/vfs/transfer.js';
import { liveWorkers } from './workers.js';

/**
 * @typedef {object} AdminDeps
 * @property {import('../services/storage/types.js').Database} db
 * @property {import('./registry.js').Registry} registry
 * @property {import('../services/vfs/vfs.js').Vfs} vfs
 * @property {import('../services/backup/backup.js').Backup} backup
 * @property {import('../services/profiles/profiles.js').Profiles} profiles
 * @property {{ id: string }} profile                     the open profile
 * @property {import('../services/commands/commands.js').Commands} commands
 * @property {import('../services/commands/shortcuts.js').Shortcuts} shortcuts
 * @property {import('../services/notifications/notifications.js').Notifications} notifications
 * @property {import('../services/clipboard/clipboard.js').ClipboardService} clipboard
 * @property {import('../services/vfs/recent.js').RecentFiles} recent
 * @property {import('./logger.js').SystemLogger} logger
 * @property {import('../services/search/search.js').Search | null} search
 * @property {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void>, delete(key: string): Promise<void>, entries(): Promise<Record<string, unknown>> }} intentDefaults
 * @property {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} backupState
 * @property {import('../services/network/network.js').NetworkLog} network
 * @property {string} engineKind
 * @property {(text: import('./types').L10n | string) => string} localize
 */

/** Store name → owning app id ('app:<id>/<collection>'), or null for system stores. @param {string} store */
const appOfStore = (store) => (store.startsWith('app:') ? store.slice(4, store.indexOf('/')) : null);

/** @param {AdminDeps} deps */
export function createAdminApi(deps) {
  const { db, registry, vfs, backup, profiles, commands, shortcuts, notifications, clipboard, recent, logger } = deps;

  const storage = {
    engine: deps.engineKind,
    estimate: estimateQuota,
    persistence: () => getPersistence(),
    requestPersistence: () => requestPersistence(),

    /**
     * Approximate bytes per app (its collections and key-value data), per VFS folder and for
     * the system's own stores.
     */
    async usage() {
      /** @type {Map<string, { bytes: number, records: number }>} */
      const apps = new Map();
      let system = 0;
      const add = (/** @type {string} */ appId, /** @type {number} */ bytes) => {
        const row = apps.get(appId) ?? { bytes: 0, records: 0 };
        row.bytes += bytes;
        row.records++;
        apps.set(appId, row);
      };
      for (const store of db.storeNames()) {
        if (store.startsWith('vfs-')) continue;
        const owner = appOfStore(store);
        await db.iterate(store, undefined, (value, key) => {
          const bytes = approximateSize(value);
          // Key-value data is scoped by app id (or "system:…").
          const scope = store === 'kv' && Array.isArray(key) ? String(key[0]) : null;
          if (owner) add(owner, bytes);
          else if (scope && registry.has(scope)) add(scope, bytes);
          else system += bytes;
        });
      }
      // Files: each top-level folder of the home folder, the trash, everything else.
      /** @type {Map<string, number>} */
      const folders = new Map();
      /** @param {string} path */
      const groupOf = (path) => {
        if (path.startsWith(`${vfs.home}/`)) {
          const parts = path.slice(vfs.home.length + 1).split('/');
          // Files directly in the home folder count for the home folder itself.
          return parts.length > 1 ? `${vfs.home}/${parts[0]}` : vfs.home;
        }
        return `/${path.split('/')[1]}`;
      };
      for (const n of await vfs.walk('/')) {
        if (n.type !== 'file') continue;
        const group = groupOf(n.path);
        folders.set(group, (folders.get(group) ?? 0) + n.size);
      }
      return {
        apps: [...apps].map(([id, row]) => ({ id, ...row })).sort((a, b) => b.bytes - a.bytes),
        folders: [...folders].map(([path, bytes]) => ({ path, bytes })).sort((a, b) => b.bytes - a.bytes),
        system,
      };
    },

    /** Records that couldn't be read and were set aside (never lost). */
    async quarantine() {
      const rows = /** @type {any[]} */ (await listQuarantine(db));
      return rows.map((r) => ({
        id: r.id,
        store: r.store,
        app: appOfStore(r.store),
        reason: r.reason,
        at: r.at,
        bytes: approximateSize(r.value),
      }));
    },
    /** @param {number} id */
    deleteQuarantined: (id) => deleteQuarantined(db, id),

    /**
     * Deletes runtime caches (files cached on first use). The installed app itself (the
     * Service Worker's precache) is kept so Nexus still works offline.
     * @returns {Promise<number>} caches removed
     */
    async clearCaches() {
      if (!globalThis.caches) return 0;
      const names = await caches.keys();
      const removable = names.filter((n) => !n.includes('precache'));
      await Promise.all(removable.map((n) => caches.delete(n)));
      return removable.length;
    },
  };

  const backups = {
    /**
     * Exports the whole profile as a `.nexus-backup` file and downloads it.
     * @param {{ password?: string, includeLog?: boolean }} [options]
     */
    async exportAndDownload(options = {}) {
      const { blob, filename, manifest } = await backup.export(options);
      downloadBlob(blob, filename);
      await deps.backupState.set('lastAt', Date.now());
      return manifest;
    },
    /** @param {Blob} file @param {string} [password] */
    inspect: (file, password) => backup.inspect(file, password),
    /**
     * Restores a backup; the page must reload afterwards (migrations run on boot).
     * @param {Blob} file
     * @param {{ mode: 'replace' | 'merge', password?: string }} options
     */
    restore: (file, options) => backup.restore(file, options),
    /** @returns {Promise<number | null>} when the last backup was made here */
    lastBackupAt: async () => /** @type {number | null} */ ((await deps.backupState.get('lastAt')) ?? null),
  };

  const keyboard = {
    /** Every command with its shortcut (hidden aliases included, marked). */
    list: () =>
      commands.list({ all: true }).map((c) => ({
        id: c.id,
        title: c.title,
        category: c.category ?? '',
        hidden: !!c.hidden,
        source: c.source ?? 'system',
        binding: shortcuts.bindingFor(c.id),
      })),
    /** @param {string} id @param {string | null} combo @returns {Promise<string[]>} conflicting ids */
    rebind: (id, combo) => shortcuts.rebind(id, combo),
    /** @param {string} id */
    reset: (id) => shortcuts.resetBinding(id),
    resetAll: () => shortcuts.resetAll(),
    conflicts: () => shortcuts.conflicts(),
    /** Shortcut notation for a key press ('Ctrl+Shift+K'), or null for a lone modifier. @param {KeyboardEvent} event */
    comboFromEvent: (event) => comboFromEvent(event),
    /** Shortcut as shown to the user ('⌘K' on a Mac). @param {string} combo */
    format: (combo) => formatShortcut(combo),
    /** While recording a new shortcut, other shortcuts must not fire. @param {boolean} on */
    setEnabled: (on) => shortcuts.setEnabled(on),
  };

  const profileApi = {
    list: () => profiles.list(),
    current: () => profiles.get(deps.profile.id),
    /** @param {{ name?: string, accent?: string }} patch */
    update: (patch) => profiles.update(deps.profile.id, patch),
    /** @param {{ kind: 'pin' | 'password', secret: string, current?: string }} lock */
    setLock: (lock) => profiles.setLock(deps.profile.id, lock),
    /** @param {string} current */
    clearLock: (current) => profiles.clearLock(deps.profile.id, current),
    /** @param {{ name: string, accent?: string }} init */
    create: (init) => profiles.create(init),
    /** Deletes another profile and all its data (not the open one). @param {string} id */
    async remove(id) {
      if (id === deps.profile.id) throw new Error('The open profile cannot be deleted');
      await profiles.remove(id);
    },
  };

  const privacy = {
    clearClipboardHistory: () => clipboard.clearHistory(),
    clearRecentFiles: () => recent.clear(),
    clearNotifications: () => notifications.clear(),
    clearSearchHistory: async () => deps.search?.clearUsage(),
    clearLog: () => logger.clear(),
    /** What is stored about the user's activity, as counts for the Privacy page. */
    async summary() {
      return {
        clipboard: clipboard.history().length,
        recent: recent.list().length,
        notifications: (await notifications.history({ limit: 10_000 })).length,
        log: logger.entries().length,
      };
    },
  };

  const notify = {
    /** @param {string} appId */
    isMuted: (appId) => notifications.isMuted(appId),
    /** @param {string} appId @param {boolean} muted */
    mute: (appId, muted) => notifications.mute(appId, muted),
    browserPermission: () => notifications.systemPermission(),
    requestBrowserPermission: () => notifications.requestSystemPermission(),
  };

  const defaults = {
    /** "Always open with" choices: [{ type: '.md', app: 'nexus.editor' }]. */
    async list() {
      const entries = await deps.intentDefaults.entries();
      return Object.entries(entries)
        .filter(([k, v]) => k.startsWith('open:') && typeof v === 'string')
        .map(([k, v]) => ({ type: k.slice(5), app: /** @type {string} */ (v) }))
        .sort((a, b) => a.type.localeCompare(b.type));
    },
    /** @param {string} type '.md' or a mime type */
    clear: (type) => deps.intentDefaults.delete(`open:${type}`),
  };

  const log = {
    /** @param {{ minLevel?: import('./logger.js').Level, source?: string, limit?: number }} [filter] */
    entries: (filter) => logger.entries(filter),
    /** New entries as they are logged; returns an unsubscribe. @param {(entry: import('./logger.js').LogEntry) => void} fn */
    subscribe: (fn) => logger.subscribe(fn),
    /**
     * Downloads the (filtered) log as a text file.
     * @param {{ minLevel?: import('./logger.js').Level, source?: string }} [filter]
     */
    download(filter) {
      const lines = logger.entries(filter).map((e) => {
        const data = e.data === undefined ? '' : ` ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}`;
        return `${new Date(e.t).toISOString()} ${e.level.toUpperCase().padEnd(5)} [${e.source}] ${e.message}${data}`;
      });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadBlob(new Blob([`${lines.join('\n')}\n`], { type: 'text/plain' }), `nexus-log-${stamp}.txt`);
    },
  };

  const performance = {
    /** Workers started by Nexus and still running. */
    workers: () => liveWorkers(),
    /** Elements on the page (the whole desktop). */
    domNodes: () => globalThis.document?.getElementsByTagName('*').length ?? 0,
    /** JS heap in bytes where the browser reports it (Chromium), else null. */
    heap() {
      const m = /** @type {any} */ (globalThis.performance)?.memory;
      return m ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit } : null;
    },
  };

  const network = {
    get online() {
      return globalThis.navigator?.onLine ?? true;
    },
    list: () => deps.network.list(),
    clear: () => deps.network.clear(),
  };

  return {
    storage,
    backup: backups,
    shortcuts: keyboard,
    profiles: profileApi,
    privacy,
    notifications: notify,
    defaults,
    log,
    performance,
    network,
  };
}
