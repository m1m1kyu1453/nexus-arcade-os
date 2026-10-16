// @ts-check
// `ctx.system`: the privileged OS API for built-in system apps (File Explorer, Terminal,
// Settings, System Monitor, App Center, Help). Only apps that declare the `system` permission
// get it, and only built-in apps may declare it; plugins (phase 13) never can.
// It is a facade: apps see plain data and a few verbs, never the services themselves.
import { createAppStorage } from '../services/storage/app-storage.js';

/**
 * @typedef {object} SystemApiDeps
 * @property {import('./registry.js').Registry} registry
 * @property {import('./lifecycle.js').Lifecycle} lifecycle
 * @property {import('../services/settings/settings.js').Settings} settings
 * @property {import('../services/storage/types.js').Database} db
 * @property {import('./bus.js').EventBus} bus
 * @property {(text: import('./types').L10n | string) => string} localize
 * @property {(appId: string) => boolean} isReadOnly
 * @property {Record<string, any>} host  filled by the shell (window titles, wallpaper …); empty headless
 */

/** Plain, structured-cloneable description of an app for system UIs. @param {import('./types').AppManifest} m */
function describe(m) {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    version: m.version,
    icon: m.icon,
    category: m.category,
    keywords: m.keywords ?? [],
    permissions: m.permissions ?? [],
    handles: m.handles ?? [],
    commands: (m.commands ?? []).map((c) => ({ id: c.id, title: c.title, shortcut: c.shortcut })),
    settings: m.settings ?? [],
    collections: Object.keys(m.storage?.collections ?? {}),
  };
}

/** @param {SystemApiDeps} deps */
export function createSystemApi(deps) {
  const { registry, lifecycle, settings, db, bus, localize, host } = deps;

  const apps = {
    /** @param {{ includeDisabled?: boolean }} [options] */
    list: ({ includeDisabled = false } = {}) =>
      registry.list({ includeDisabled }).map((m) => ({ ...describe(m), enabled: registry.isEnabled(m.id) })),
    /** @param {string} id */
    get(id) {
      const m = registry.get(id);
      return m ? { ...describe(m), enabled: registry.isEnabled(id) } : null;
    },
    /** @param {string} id */
    has: (id) => registry.isEnabled(id),
    /** Localized name of an app (falls back to the id). @param {string} id */
    name(id) {
      const m = registry.get(id);
      return m ? localize(m.name) : id;
    },
    /** "Uninstall" (hide everywhere) or "install" a built-in app. @param {string} id @param {boolean} enabled */
    async setEnabled(id, enabled) {
      if (!enabled) for (const i of lifecycle.list()) if (i.appId === id) await lifecycle.close(i.id, { force: true });
      registry.setEnabled(id, enabled);
    },
    /** Deletes an app's stored data (collections, key-value data and settings). @param {string} id */
    async clearData(id) {
      const m = registry.get(id);
      if (!m) throw new Error(`Unknown app "${id}"`);
      if (deps.isReadOnly(id)) throw new Error(`${id}'s data is read-only until its migration problem is resolved`);
      const storage = createAppStorage({ db, bus, manifest: m });
      for (const name of Object.keys(m.storage?.collections ?? {})) await storage.collection(name).clear();
      await storage.kv.clear();
      await settings.resetScope(id);
    },
  };

  const windows = {
    /** Open windows with their app, title and state. */
    list: () =>
      lifecycle.list().map((i) => ({
        id: i.id,
        appId: i.appId,
        appName: apps.name(i.appId),
        title: host.windowTitle?.(i.id) ?? apps.name(i.appId),
        state: i.state,
        focused: i.focused,
        suspended: i.suspended,
        launchedAt: i.launchedAt,
        activeTimers: i.activeTimers,
      })),
    /** @param {string} id */
    focus: (id) => lifecycle.focus(id),
    /** Closes a window normally (the app may still ask about unsaved changes). @param {string} id */
    close: (id) => lifecycle.close(id),
    /** Ends a window without asking ("End task"). @param {string} id */
    kill: (id) => lifecycle.close(id, { force: true }),
    /** @param {string} appId @param {import('./types').LaunchArgs} [args] */
    launch: (appId, args) => lifecycle.launch(appId, args ?? {}),
  };

  /** One facade object per app; `appId` is kept for logging and future auditing. */
  return (/** @type {string} */ _appId) => ({ apps, windows });
}

/** @typedef {ReturnType<ReturnType<typeof createSystemApi>>} SystemApi */
