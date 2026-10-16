// @ts-check
// `ctx.system`: the privileged OS API for built-in system apps (File Explorer, Terminal,
// Settings, System Monitor, App Center, Help). Only apps that declare the `system` permission
// get it, and only built-in apps may declare it; plugins (phase 13) never can.
// It is a facade: apps see plain data and a few verbs, never the services themselves.
import { buildDate } from '../env.js';
import { createAppStorage } from '../services/storage/app-storage.js';
import { createAdminApi } from './system-api-admin.js';

export const LIVE_URL = 'https://nexus-arcade-os.onrender.com';
export const REPO_URL = 'https://github.com/m1m1kyu1453/nexus-arcade-os';

/**
 * @typedef {object} SystemApiDeps
 * @property {import('./registry.js').Registry} registry
 * @property {import('./lifecycle.js').Lifecycle} lifecycle
 * @property {import('../services/settings/settings.js').Settings} settings
 * @property {import('../services/storage/types.js').Database} db
 * @property {import('./bus.js').EventBus} bus
 * @property {(text: import('./types').L10n | string) => string} localize
 * @property {(appId: string) => boolean} isReadOnly
 * @property {import('../services/theme/engine.js').ThemeService} theme
 * @property {(appId: string) => Promise<import('./types').HeadlessContext>} headless  ctx for an app's handlers (messages loaded)
 * @property {{ version: string, edition: 'web' | 'lite', profile: { name: string, username: string }, bootedAt: number }} info
 * @property {Record<string, any>} host  filled by the shell (window titles, wallpaper …); empty headless
 * @property {import('./system-api-admin.js').AdminDeps} admin
 * @property {(key: string, vars?: Record<string, unknown>) => string} systemText  OS messages (namespace 'system')
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
    terminal: m.terminal ?? [],
    hasHelp: typeof m.help === 'function',
    hasChangelog: typeof m.changelog === 'function',
  };
}

/** @param {SystemApiDeps} deps */
export function createSystemApi(deps) {
  const { registry, lifecycle, settings, db, bus, localize, host, theme } = deps;

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
    /** Terminal commands declared by enabled apps. */
    terminalCommands: () =>
      registry
        .list()
        .flatMap((m) =>
          (m.terminal ?? []).map((c) => ({ app: m.id, name: c.name, description: c.description, usage: c.usage })),
        ),
    /**
     * Runs an app's terminal command handler (loads the app's code and messages first).
     * @param {string} appId
     * @param {string} name
     * @param {import('./types').TerminalIo} io
     * @returns {Promise<number>}
     */
    async runTerminal(appId, name, io) {
      if (!registry.isEnabled(appId)) throw new Error(`Unknown app "${appId}"`);
      const mod = await registry.load(appId);
      const handler = mod.terminal?.[name];
      if (!handler) throw new Error(`${appId} declares terminal command "${name}" but has no handler`);
      const status = await handler(await deps.headless(appId), io);
      return typeof status === 'number' ? status : 0;
    },
    /** An app's help page (Markdown), or null. @param {string} id */
    async help(id) {
      const m = registry.get(id);
      if (!m?.help) return null;
      const loaded = await m.help();
      return typeof loaded === 'string' ? loaded : loaded.default;
    },
    /** An app's version history (Markdown), or null. @param {string} id */
    async changelog(id) {
      const m = registry.get(id);
      if (!m?.changelog) return null;
      const loaded = await m.changelog();
      return typeof loaded === 'string' ? loaded : loaded.default;
    },
    /** Image URLs of an app's screenshots (may be empty). @param {string} id */
    async screenshots(id) {
      const m = registry.get(id);
      return m?.screenshots ? [...(await m.screenshots()).default] : [];
    },
    /** Approximate code size per app id (its own source folder), from the build. */
    codeSizes: async () => (await import('virtual:nexus-app-sizes')).default,
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
        loops: i.loops,
        busyMs: i.busyMs,
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

  /**
   * System and app settings (scope 'system' or an app id), validated by the settings service.
   * @param {(unsub: () => void) => () => void} track  ends subscriptions with the window
   */
  const settingsFor = (track) => ({
    /** @param {string} key @param {string} [scope] */
    get: (key, scope = 'system') => settings.get(scope, key),
    /** @param {string} key @param {unknown} value @param {string} [scope] */
    set: (key, value, scope = 'system') => settings.set(scope, key, value),
    /** @param {string} key @param {string} [scope] */
    reset: (key, scope = 'system') => settings.reset(scope, key),
    /** Declarations with current values. @param {string} [scope] */
    describe: (scope = 'system') => settings.describe(scope),
    scopes: () => settings.scopes(),
    /** @param {string} key ('*' = any) @param {(value: unknown, key: string) => void} fn @param {string} [scope] */
    onChange: (key, fn, scope = 'system') => track(settings.onChange(scope, key, fn)),
  });

  const themes = {
    list: () => theme.themes().map((t) => ({ id: t.id, name: t.name, scheme: t.scheme })),
    get current() {
      return theme.current;
    },
  };

  /** Version, edition, profile and boot time (Terminal `nexusfetch`, Settings → About). */
  const info = () => ({ ...deps.info, buildDate, profile: { ...deps.info.profile } });

  const about = {
    liveUrl: LIVE_URL,
    repoUrl: REPO_URL,
    /** Nexus Lite is downloaded from the website (the Lite file itself has no copy of it). */
    liteUrl: `${LIVE_URL}/nexus-lite.html`,
    /** Third-party libraries and fonts with their license texts (generated at build time). */
    licenses: async () => (await import('virtual:nexus-licenses')).default,
    /** CHANGELOG.md (Markdown). */
    changelog: async () => (await import('../../CHANGELOG.md?raw')).default,
  };

  /** Update checks; only the website has them (null in Nexus Lite and without a Service Worker). */
  const updates = {
    get supported() {
      return !!host.updates;
    },
    get available() {
      return !!host.updates?.available;
    },
    /** @returns {Promise<'available' | 'current' | 'offline' | 'unavailable'>} */
    check: async () => (host.updates ? host.updates.check() : 'unavailable'),
    apply: () => host.updates?.apply(),
  };

  const admin = createAdminApi(deps.admin);

  /**
   * One facade object per app; `appId` is kept for logging and future auditing.
   * @param {string} _appId
   * @param {(unsub: () => void) => () => void} [track]
   */
  return (_appId, track = (u) => u) => ({
    apps,
    windows,
    settings: settingsFor(track),
    theme: themes,
    info,
    about,
    updates,
    /** An OS message (e.g. 'scheduler.limits'), so system apps show the same wording. */
    text: deps.systemText,
    ...admin,
    // Subscriptions end with the window.
    log: { ...admin.log, subscribe: (/** @type {any} */ fn) => track(admin.log.subscribe(fn)) },
    network: {
      ...admin.network,
      get online() {
        return admin.network.online;
      },
      /** @param {() => void} fn */
      onChange: (fn) => track(bus.on('network:changed', fn)),
    },
    performance: {
      ...admin.performance,
      /** Elements inside one window. @param {string} id */
      windowNodes: (id) => host.windowNodes?.(id) ?? null,
    },
  });
}

/** @typedef {ReturnType<ReturnType<typeof createSystemApi>>} SystemApi */
