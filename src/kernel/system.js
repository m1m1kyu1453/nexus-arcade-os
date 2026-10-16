// @ts-check
// Boots the OS in two stages:
//   bootKernel()               logger, storage engine, system database, profile list
//   kernel.openProfile(p)      the profile's database, every service and the apps
// The shell runs the lock screen between the two stages, so a locked profile's data is only
// opened after unlocking. `startSystem` does both for tests and the debug screen.
import { createAchievements, ACHIEVEMENTS_STORE_SCHEMA } from '../services/achievements/achievements.js';
import { createAi } from '../services/ai/ai.js';
import { createBackup } from '../services/backup/backup.js';
import { createClipboard } from '../services/clipboard/clipboard.js';
import { createCommands } from '../services/commands/commands.js';
import { createShortcuts, isEditable } from '../services/commands/shortcuts.js';
import { createI18n, detectLocale } from '../services/i18n/i18n.js';
import { createNotifications, NOTIFICATIONS_STORE_SCHEMA } from '../services/notifications/notifications.js';
import { createPermissions } from '../services/permissions/permissions.js';
import { createProfiles, profileDbName, PROFILES_STORE_SCHEMA } from '../services/profiles/profiles.js';
import { createScheduler, JOBS_STORE_SCHEMA } from '../services/scheduler/scheduler.js';
import { createSearch } from '../services/search/search.js';
import { connectSearchSources } from '../services/search/sources.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../services/settings/settings.js';
import { SYSTEM_SETTINGS } from '../services/settings/system-settings.js';
import { createSound } from '../services/sound/sound.js';
import { appStoreSchema, migrateApp } from '../services/storage/app-storage.js';
import { createKeyValue, KV_STORE_SCHEMA } from '../services/storage/collections.js';
import { META_STORE_SCHEMA } from '../services/storage/migrations.js';
import { requestPersistence } from '../services/storage/persist.js';
import { QUARANTINE_STORE_SCHEMA } from '../services/storage/quarantine.js';
import { storageBreakdown, withQuotaReporting } from '../services/storage/quota.js';
import { selectEngine } from '../services/storage/select.js';
import { createThemeService } from '../services/theme/engine.js';
import { createRecentFiles } from '../services/vfs/recent.js';
import { createVfs, VFS_STORE_SCHEMA } from '../services/vfs/vfs.js';
import { createNativeDialogs } from '../shell/native-dialogs.js';
import { createEventBus } from './bus.js';
import { createAppContext } from './context.js';
import { createSystemApi } from './system-api.js';
import { createIntents } from './intents.js';
import { createBoundary } from './error-boundary.js';
import { createLifecycle } from './lifecycle.js';
import { createLogger } from './logger.js';
import { createRegistry } from './registry.js';
import { createRuntime } from './runtime.js';
import { createTabRelay } from './tab-relay.js';

/** @typedef {import('./types').AppManifest} AppManifest */

const SYSTEM_DB = 'nexus-system';
const SYSTEM_DB_SCHEMA = { ...PROFILES_STORE_SCHEMA, 'system-kv': {}, log: {} };
const PROFILE_BASE_SCHEMA = {
  ...META_STORE_SCHEMA,
  ...KV_STORE_SCHEMA,
  ...QUARANTINE_STORE_SCHEMA,
  ...SETTINGS_STORE_SCHEMA,
  ...VFS_STORE_SCHEMA,
  ...NOTIFICATIONS_STORE_SCHEMA,
  ...JOBS_STORE_SCHEMA,
  ...ACHIEVEMENTS_STORE_SCHEMA,
};
/** Events mirrored to other tabs of the same profile. */
const RELAYED = ['storage:', 'vfs:', 'settings:', 'notifications:history-changed', 'scheduler:changed', 'clipboard:'];

/**
 * @typedef {object} StartOptions
 * @property {'web' | 'lite'} edition
 * @property {string} version
 * @property {boolean} dev
 * @property {AppManifest[]} manifests          built-in apps
 * @property {import('./lifecycle.js').Host} host
 * @property {Document} [document]
 * @property {import('../services/storage/types.js').Engine} [engine]   tests inject one
 * @property {(fn: () => void) => void} [whenLeader]
 * @property {import('../services/search/backend.js').SearchBackend} [searchBackend]
 * @property {readonly string[]} [languages]
 * @property {typeof AudioContext | null} [AudioContextImpl]
 */

/**
 * Boot step names reported through `onProgress` (the boot screen shows them).
 * @typedef {'storage' | 'profile' | 'settings' | 'theme' | 'files' | 'services' | 'migrations' | 'apps' | 'search' | 'ready'} BootStep
 */
export const BOOT_STEPS = /** @type {const} */ ([
  'storage',
  'profile',
  'settings',
  'theme',
  'files',
  'services',
  'migrations',
  'apps',
  'search',
  'ready',
]);

/** Boots the kernel and opens the last used (or a new default) unlocked profile. @param {StartOptions} options */
export async function startSystem(options) {
  const kernel = await bootKernel(options);
  return kernel.openProfile(await kernel.defaultProfile());
}

/**
 * Stage 1: logging, storage and the profile list. Nothing profile-specific is opened yet.
 * @param {StartOptions & { onProgress?: (step: BootStep) => void, onLog?: (entry: import('./logger.js').LogEntry) => void }} options
 */
export async function bootKernel(options) {
  const { edition, version, dev } = options;
  const progress = options.onProgress ?? (() => {});
  const doc = options.document ?? globalThis.document;
  const win = doc?.defaultView ?? undefined;

  // 1. Logging first, so everything after can report problems.
  /** @type {import('../services/storage/types.js').Database | null} */
  let systemDb = null;
  const logger = createLogger({
    echo: dev
      ? (e) => console[e.level === 'debug' ? 'log' : e.level](`[${e.source}] ${e.message}`, e.data ?? '')
      : undefined,
    persist: { save: (entries) => systemDb?.put('log', entries, 'entries') },
  });
  const log = logger.child('kernel');
  if (options.onLog) logger.subscribe(options.onLog);
  const bus = createEventBus({ onError: (error, { type }) => log.error(`A listener for "${type}" failed`, error) });
  if (win) {
    win.addEventListener('error', (e) => logger.log('error', 'global', e.message || 'Uncaught error', e.error));
    win.addEventListener('unhandledrejection', (e) =>
      logger.log('error', 'global', 'Unhandled promise rejection', e.reason),
    );
    win.addEventListener('pagehide', () => void logger.flush());
  }

  // 2. Storage engine and the system database.
  const selected = options.engine ? { engine: options.engine, warning: null, reasons: [] } : await selectEngine();
  for (const reason of selected.reasons) log.warn(reason);
  const { engine } = selected;
  systemDb = await engine.open(SYSTEM_DB, SYSTEM_DB_SCHEMA);
  logger.restore(await systemDb.get('log', 'entries'));
  log.info(`Nexus ${version} (${edition}) starting; storage: ${engine.kind}`);
  const systemKv = {
    get: (/** @type {string} */ key) => /** @type {any} */ (systemDb).get('system-kv', key),
    set: (/** @type {string} */ key, /** @type {unknown} */ value) =>
      /** @type {any} */ (systemDb).put('system-kv', value, key),
  };

  progress('storage');
  const languages = options.languages ?? globalThis.navigator?.languages ?? ['en'];
  const profiles = createProfiles({ systemDb, engine, bus });
  /** Messages for screens shown before a profile (and its language setting) is open. */
  const preLoginMessages = async () =>
    (detectLocale(languages) === 'de' ? await import('../i18n/de.json') : await import('../i18n/en.json')).default;

  return {
    logger,
    bus,
    engine,
    storageWarning: selected.warning,
    systemDb,
    systemKv,
    profiles,
    preLoginMessages,
    /** Locale for pre-login screens (lock screen, boot screen). */
    preLoginLocale: () => detectLocale(languages),

    /** The last used unlocked profile, or a new default profile on first start. */
    async defaultProfile() {
      const lastId = await systemKv.get('lastProfile');
      const all = await profiles.list();
      const found = all.find((p) => p.id === lastId && !p.locked) ?? all.find((p) => !p.locked);
      if (found) return found;
      const profile = await profiles.create({ name: (await preLoginMessages()).profile.defaultName });
      log.info('Created the default profile');
      return profile;
    },

    /** The profile the lock screen should preselect (last used, even if locked). */
    async lastProfile() {
      const lastId = await systemKv.get('lastProfile');
      const all = await profiles.list();
      return all.find((p) => p.id === lastId) ?? all[0] ?? null;
    },

    /**
     * Stage 2: opens a profile (the caller has unlocked it) with all services and apps.
     * @param {import('../services/profiles/profiles.js').PublicProfile} profile
     */
    openProfile: (profile) =>
      openProfile(
        { ...options, progress },
        { logger, log, bus, engine, selected, systemDb, systemKv, win, doc },
        profile,
      ),
  };
}

/**
 * @param {StartOptions & { progress: (step: BootStep) => void }} options
 * @param {{
 *   logger: import('./logger.js').SystemLogger,
 *   log: import('./logger.js').Logger,
 *   bus: import('./bus.js').EventBus,
 *   engine: import('../services/storage/types.js').Engine,
 *   selected: { warning: null | 'localstorage' | 'memory' },
 *   systemDb: import('../services/storage/types.js').Database,
 *   systemKv: { get(key: string): Promise<any>, set(key: string, value: unknown): Promise<unknown> },
 *   win: (Window & typeof globalThis) | undefined,
 *   doc: Document | undefined,
 * }} k  stage 1 objects
 * @param {import('../services/profiles/profiles.js').PublicProfile} profile
 */
async function openProfile(options, k, profile) {
  const { edition, version, dev, manifests, host, progress } = options;
  const { logger, log, bus, engine, selected, systemDb, systemKv, win, doc } = k;
  const languages = options.languages ?? globalThis.navigator?.languages ?? ['en'];
  const profiles = createProfiles({ systemDb, engine, bus });
  progress('profile');
  await profiles.touch(profile.id);
  await systemKv.set('lastProfile', profile.id);

  // 4. Registry (validates manifests) and the profile database with every store.
  const registry = createRegistry({ bus, log: logger.child('registry') });
  const { failed } = registry.registerAll(manifests);
  const appSchemas = registry
    .list({ includeDisabled: true })
    .reduce((acc, m) => ({ ...acc, ...appStoreSchema(m) }), {});
  /** @type {ReturnType<typeof createNotifications> | null} */
  let notificationsRef = null;
  let quotaNotifiedAt = 0;
  const rawDb = await engine.open(
    profileDbName(profile.id),
    { ...PROFILE_BASE_SCHEMA, ...appSchemas },
    {
      onVersionChange: () => log.info('Another tab upgraded the database; reconnecting'),
    },
  );
  const db = withQuotaReporting(rawDb, ({ store }) => {
    bus.emit('storage:quota-exceeded', { store });
    if (Date.now() - quotaNotifiedAt < 10_000) return;
    quotaNotifiedAt = Date.now();
    // Tell the user what uses the space, not just that it's full.
    storageBreakdown(rawDb)
      .then((rows) => rows[0])
      .catch(() => undefined)
      .then((largest) =>
        notificationsRef?.notify({
          title: i18n.t('system', 'storage.quotaTitle'),
          body: [
            i18n.t('system', 'storage.quotaBody'),
            largest &&
              i18n.t('system', 'storage.quotaLargest', {
                store: describeStore(largest.store),
                size: i18n.format.bytes(largest.bytes),
              }),
          ]
            .filter(Boolean)
            .join(' '),
          urgent: true,
          timeoutMs: 0,
        }),
      )
      .catch(() => {});
  });
  /** Human name of a store for the quota notice. @param {string} store */
  const describeStore = (store) => {
    if (store.startsWith('vfs-')) return i18n.t('system', 'storage.files');
    const appId = store.match(/^app:([^/]+)\//)?.[1];
    const m = appId ? registry.get(appId) : undefined;
    return m ? localize(m.name) : store;
  };
  const kv = (/** @type {string} */ scope) => createKeyValue({ db, scope, bus });

  // 5. Settings, language and theme.
  const settings = createSettings({ db, bus, log: logger.child('settings') });
  settings.register('system', SYSTEM_SETTINGS);
  for (const m of registry.list({ includeDisabled: true })) if (m.settings?.length) settings.register(m.id, m.settings);
  await settings.load();
  progress('settings');

  const resolveLocale = () => {
    const chosen = /** @type {string} */ (settings.get('system', 'language'));
    return chosen === 'auto' ? detectLocale(languages) : /** @type {'en' | 'de'} */ (chosen);
  };
  const i18n = createI18n({ bus, log: logger.child('i18n'), locale: resolveLocale(), dev });
  i18n.register('system', { en: () => import('../i18n/en.json'), de: () => import('../i18n/de.json') });
  for (const m of registry.list({ includeDisabled: true })) if (m.messages) i18n.register(m.id, m.messages);
  await i18n.load('system');
  doc?.documentElement.setAttribute('lang', i18n.locale);
  settings.onChange('system', 'language', () => void i18n.setLocale(resolveLocale()));
  /** @param {string | import('./types').L10n} text */
  const localize = (text) => (typeof text === 'string' ? text : (text[i18n.locale] ?? text.en));

  const theme = createThemeService({
    settings,
    bus,
    root: /** @type {HTMLElement} */ (doc?.documentElement),
    matchMedia: win?.matchMedia?.bind(win),
  });
  if (doc) theme.apply();
  progress('theme');

  // 6. Files, notifications, sound and the other services.
  const vfs = createVfs({ db, bus, user: profile.username });
  await vfs.init();
  const recent = createRecentFiles({ store: kv('system:recent'), bus });
  await recent.load();
  /** Auto-empty: trash items older than the retention setting go for good (0 = keep). */
  const purgeTrash = async () => {
    const days = Number(settings.get('system', 'trashRetentionDays'));
    if (!(days > 0)) return;
    const removed = await vfs.purgeTrash(Date.now() - days * 86_400_000);
    if (removed) log.info(`Emptied ${removed} old item(s) from the trash`);
  };
  await purgeTrash().catch((error) => log.warn('Could not empty old trash items', error));
  const trashTimer = setInterval(() => void purgeTrash().catch(() => {}), 6 * 3_600_000);
  progress('files');

  /** @type {ReturnType<typeof createSound>} */
  let sound;
  const notifications = createNotifications({
    db,
    bus,
    log: logger.child('notifications'),
    settings,
    store: kv('system:notifications'),
    sound: { play: (name, category) => sound.play(/** @type {any} */ (name), /** @type {any} */ (category)) },
  });
  notificationsRef = notifications;
  await notifications.load();
  sound = createSound({
    settings,
    quiet: () => notifications.doNotDisturb,
    AudioContextImpl: options.AudioContextImpl,
  });

  const clipboard = createClipboard({ store: kv('system:clipboard'), bus });
  await clipboard.load();

  const achievements = createAchievements({
    db,
    bus,
    log: logger.child('achievements'),
    store: kv('system:xp'),
    onUnlock: (app, decl) => {
      sound.play('achievement', 'notifications');
      notifications
        .notify({
          title: i18n.t('system', 'achievements.unlockedTitle'),
          body: localize(decl.title),
          app,
          icon: decl.icon,
          silent: true,
        })
        .catch(() => {});
    },
  });
  for (const m of registry.list({ includeDisabled: true }))
    if (m.achievements?.length) achievements.register(m.id, m.achievements);
  await achievements.load();
  bus.on('xp:level-up', ({ level }) => {
    notifications.notify({ title: i18n.t('system', 'achievements.levelUp', { level }), silent: true }).catch(() => {});
  });

  const scheduler = createScheduler({
    db,
    bus,
    log: logger.child('scheduler'),
    notifications,
    whenLeader: options.whenLeader,
  });
  const ai = createAi(bus);
  progress('services');

  // 7. App data migrations. Problems make that app's storage read-only, never wipe data.
  /** @type {Set<string>} */
  const readOnlyApps = new Set();
  /** @type {import('../services/storage/migrations.js').MigrationResult[]} */
  const migrationResults = [];
  for (const m of registry.list({ includeDisabled: true })) {
    if (!m.storage) continue;
    const result = await migrateApp({
      db,
      manifest: m,
      onProgress: (p) => log.info(`Migrating ${m.id}: step ${p.step}/${p.total} → v${p.to}`),
    }).catch((error) => ({
      scope: m.id,
      status: /** @type {const} */ ('failed'),
      from: 0,
      version: 0,
      target: m.storage?.version ?? 0,
      error,
    }));
    migrationResults.push(result);
    if (result.status === 'ok') continue;
    readOnlyApps.add(m.id);
    const name = localize(m.name);
    if (result.status === 'failed') log.error(`Migration of ${m.id} failed at v${result.version}`, result.error);
    else log.warn(`${m.id} data (v${result.version}) is newer than this version expects (v${result.target})`);
    const key = result.status === 'failed' ? 'failed' : 'newer';
    await notifications.notify({
      title: i18n.t('system', `migration.${key}Title`, { app: name }),
      body: i18n.t('system', `migration.${key}Body`),
      timeoutMs: 0,
    });
  }

  progress('migrations');

  // 8. Commands, shortcuts, intents, permissions, search, lifecycle.
  /** @type {ReturnType<typeof createLifecycle>} */
  let lifecycle;
  const focusedAppId = () => (lifecycle?.focusedId ? (lifecycle.get(lifecycle.focusedId)?.appId ?? null) : null);
  const commands = createCommands({
    bus,
    log: logger.child('commands'),
    localize,
    context: () => ({
      appFocused: !!lifecycle?.focusedId,
      focusedApp: focusedAppId(),
      inputFocused: isEditable(doc?.activeElement ?? null),
      online: globalThis.navigator?.onLine ?? true,
      edition,
      dev,
    }),
  });
  const shortcuts = createShortcuts({
    commands,
    bus,
    log: logger.child('shortcuts'),
    store: kv('system:shortcuts'),
    activeScope: () => lifecycle?.focusedId ?? null,
  });
  await shortcuts.load();

  const dialogs = createNativeDialogs(i18n.scoped('system'), win);
  const intents = createIntents({
    registry,
    lifecycle: { launch: (appId, args) => lifecycle.launch(appId, args) },
    choose: (request) =>
      dialogs.pickApp({ candidates: request.candidates.map((m) => ({ id: m.id, name: localize(m.name) })) }),
    defaults: kv('system:intents'),
    onOpened: (path) => {
      // Folders are "opened" by navigating; recent files lists files only.
      void vfs.stat(path).then((n) => n?.type === 'file' && recent.add(path));
    },
    storedMime: async (path) => (await vfs.stat(path))?.mime,
  });

  const permissions = createPermissions({
    store: kv('system:permissions'),
    bus,
    appInfo: (id) => {
      const m = registry.get(id);
      return m && { builtIn: true, declared: m.permissions ?? [] };
    },
    ask: async () => false, // plugins arrive in phase 13 with their prompt UI
  });
  await permissions.load();

  /** @type {import('./context.js').Services} */
  const services = {
    bus,
    logger,
    db,
    vfs,
    recent,
    settings,
    i18n,
    theme,
    notifications,
    commands,
    shortcuts,
    intents,
    clipboard,
    sound,
    achievements,
    scheduler,
    ai,
    dialogs,
    env: { edition, dev },
    isReadOnly: (appId) => readOnlyApps.has(appId),
  };
  /** @param {AppManifest} m */
  const headless = (m) => createAppContext(m, services);

  /**
   * Context for a desktop widget: the headless ctx plus timers, signal and guard that end when
   * the widget is removed (dispose). The first uncaught error reaches `onCrash`.
   * @param {AppManifest} m
   * @param {{ onCrash: (error: unknown) => void }} options
   */
  async function widgetContext(m, { onCrash }) {
    const boundary = createBoundary({ onCrash });
    const runtime = createRuntime({ boundary });
    await i18n.load(m.id);
    const ctx = createAppContext(m, services, { runtime, boundary, instanceId: `${m.id}#widget` });
    return { ctx, guard: runtime.guard, dispose: () => runtime.dispose() };
  }

  for (const m of registry.list({ includeDisabled: true })) {
    for (const decl of m.commands ?? []) {
      commands.register({
        id: decl.id,
        title: decl.title,
        icon: decl.icon,
        category: m.name,
        when: decl.when,
        source: m.id,
        run: async (args) => {
          const [mod] = await Promise.all([registry.load(m.id), i18n.load(m.id)]);
          const handler = mod.commands?.[decl.id];
          if (!handler) throw new Error(`${m.id} declares command "${decl.id}" but has no handler`);
          return handler(headless(m), args);
        },
      });
      if (decl.shortcut) shortcuts.setDefault(decl.id, decl.shortcut);
    }
  }
  registerSystemCommands({ commands, settings, i18n, theme });

  lifecycle = createLifecycle({
    registry,
    bus,
    logger,
    host,
    os: `${version} (${edition})`,
    document: doc,
    createContext: (manifest, extras) => createAppContext(manifest, services, extras),
    prepare: (manifest) => i18n.load(manifest.id),
  });
  /** Parts of ctx.system only the shell can provide (window titles, wallpaper …). */
  const systemHost = {};
  services.systemApi = createSystemApi({
    registry,
    lifecycle,
    settings,
    db,
    bus,
    localize,
    isReadOnly: services.isReadOnly,
    theme,
    info: { version, edition, profile: { name: profile.name, username: profile.username }, bootedAt: Date.now() },
    headless: async (appId) => {
      await i18n.load(appId);
      return headless(/** @type {AppManifest} */ (registry.get(appId)));
    },
    host: systemHost,
  });
  bus.on('app:launched', () => sound.play('open'));
  bus.on('app:closed', () => sound.play('close'));
  bus.on('app:crashed', () => sound.play('error'));
  const detachShortcuts = win ? shortcuts.attach(win) : () => {};

  progress('apps');
  const search = createSearch({
    backend:
      options.searchBackend ??
      (await import('../services/search/backend.js').then((b) => b.createSearchBackend(logger.child('search')))),
    log: logger.child('search'),
    store: kv('system:search'),
  });
  await search.load();
  for (const m of registry.list()) {
    const loadProvider = m.search;
    if (!loadProvider) continue;
    search.registerProvider(m.id, async (query) => {
      const [provider] = await Promise.all([loadProvider(), i18n.load(m.id)]);
      return provider.default(query, headless(m));
    });
  }
  const sources = connectSearchSources({
    search,
    bus,
    registry,
    commands,
    settings,
    vfs,
    localize,
    log: logger.child('search'),
  });
  await sources.start();
  progress('search');

  const relay = createTabRelay({ bus, channel: `nexus:${profileDbName(profile.id)}`, prefixes: RELAYED });

  // Ask for persistent storage on the first real data write (not on page load).
  const askPersistence = () => {
    off1();
    off2();
    requestPersistence().then((state) => log.info(`Storage persistence: ${state}`));
  };
  const off1 = bus.on('storage:changed', (p) => !p?.remote && askPersistence());
  const off2 = bus.on('vfs:changed', (p) => !p?.remote && askPersistence());

  const backup = createBackup({
    db: rawDb,
    nexusVersion: version,
    profile: () => /** @type {any} */ (profile),
    logEntries: () => logger.entries(),
  });

  // 9. Startup notices.
  if (selected.warning) {
    await notifications.notify({
      title: i18n.t('system', `storage.${selected.warning}Title`),
      body: i18n.t('system', `storage.${selected.warning}Body`),
      urgent: true,
      timeoutMs: 0,
    });
  }
  if (failed.length)
    log.error(`${failed.length} app(s) could not be registered: ${failed.map((f) => f.id).join(', ')}`);
  scheduler.start().then(async (missed) => {
    if (!missed.length) return;
    await notifications.notify({
      group: 'away',
      title: i18n.t('system', 'scheduler.missedTitle'),
      body: i18n.t('system', 'scheduler.missedBody', {
        count: missed.length,
        titles: i18n.format.list(missed.slice(0, 3).map((j) => j.title)),
      }),
      timeoutMs: 0,
    });
  });

  log.info(`Ready: ${registry.list().length} app(s), profile "${profile.name}"`);
  bus.emit('system:ready', { profile: profile.id });
  progress('ready');

  return {
    ...services,
    engine,
    storageWarning: selected.warning,
    systemDb,
    profiles,
    profile,
    registry,
    lifecycle,
    search,
    permissions,
    backup,
    migrationResults,
    localize,
    widgetContext,
    systemHost,
    async stop() {
      sources.stop();
      scheduler.stop();
      relay.close();
      clearInterval(trashTimer);
      detachShortcuts();
      for (const i of lifecycle.list()) await lifecycle.close(i.id, { force: true });
      await logger.flush();
      rawDb.close();
      systemDb?.close();
    },
  };
}

/**
 * A few system-wide commands (more arrive with the shell in phase 2).
 * @param {{ commands: import('../services/commands/commands.js').Commands, settings: import('../services/settings/settings.js').Settings, i18n: import('../services/i18n/i18n.js').I18nService, theme: import('../services/theme/engine.js').ThemeService }} deps
 */
function registerSystemCommands({ commands, settings, i18n, theme }) {
  /** A title/category that follows language switches (resolved when listed). @param {string} key */
  const live = (key) => ({
    get en() {
      return i18n.t('system', key);
    },
    get de() {
      return i18n.t('system', key);
    },
  });
  const category = live('commands.category');
  commands.register({
    id: 'system.toggleDnd',
    title: live('commands.toggleDnd'),
    category,
    run: () => settings.set('system', 'doNotDisturb', !settings.get('system', 'doNotDisturb')),
  });
  commands.register({
    id: 'system.language.en',
    title: live('commands.languageEnglish'),
    category,
    run: () => settings.set('system', 'language', 'en'),
  });
  commands.register({
    id: 'system.language.de',
    title: live('commands.languageGerman'),
    category,
    run: () => settings.set('system', 'language', 'de'),
  });
  commands.register({
    id: 'system.nextTheme',
    title: live('commands.nextTheme'),
    category,
    run: () => {
      const ids = theme.themes().map((th) => th.id);
      return settings.set('system', 'theme', ids[(ids.indexOf(theme.current) + 1) % ids.length]);
    },
  });
}

/** @typedef {Awaited<ReturnType<typeof startSystem>>} System */
