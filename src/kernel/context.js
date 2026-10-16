// @ts-check
// Builds the `ctx` object an app receives (NEXUS_BRIEF.md §5.3). Everything is scoped to the
// app: its own storage, settings, scheduler jobs and log tag. Subscriptions made through ctx
// are tracked by the instance runtime and removed on unmount. Apps cannot emit system events.
import { createAppStorage } from '../services/storage/app-storage.js';
import {
  entriesFromDataTransfer,
  entriesFromFileList,
  exportFile,
  exportFolder,
  importEntries,
} from '../services/vfs/transfer.js';

/** Event namespaces only the OS may emit. Apps use their own, e.g. 'notes:saved'. */
const RESERVED_EVENTS = [
  'app:',
  'vfs:',
  'storage:',
  'settings:',
  'theme:',
  'i18n:',
  'notification',
  'scheduler:',
  'command',
  'shortcuts:',
  'profile:',
  'xp:',
  'achievement',
  'clipboard:',
  'permissions:',
  'ai:',
  'search:',
  'system:',
  'window:',
  'workspace:',
  'shell:',
  'boot:',
];

/**
 * @typedef {object} Services
 * @property {import('./bus.js').EventBus} bus
 * @property {import('./logger.js').SystemLogger} logger
 * @property {import('../services/storage/types.js').Database} db
 * @property {import('../services/vfs/vfs.js').Vfs} vfs
 * @property {import('../services/vfs/recent.js').RecentFiles} recent
 * @property {import('../services/settings/settings.js').Settings} settings
 * @property {import('../services/i18n/i18n.js').I18nService} i18n
 * @property {import('../services/theme/engine.js').ThemeService} theme
 * @property {import('../services/notifications/notifications.js').Notifications} notifications
 * @property {import('../services/commands/commands.js').Commands} commands
 * @property {import('../services/commands/shortcuts.js').Shortcuts} shortcuts
 * @property {import('./intents.js').Intents} intents
 * @property {import('../services/clipboard/clipboard.js').ClipboardService} clipboard
 * @property {import('../services/sound/sound.js').Sound} sound
 * @property {import('../services/achievements/achievements.js').Achievements} achievements
 * @property {import('../services/scheduler/scheduler.js').Scheduler} scheduler
 * @property {import('../services/ai/ai.js').Ai} ai
 * @property {{ alert(message: string): Promise<void>, confirm(message: string): Promise<boolean>, prompt(message: string, value?: string): Promise<string | null>, [name: string]: unknown }} dialogs
 * @property {{ edition: 'web' | 'lite', dev: boolean }} env
 * @property {(appId: string) => boolean} isReadOnly  data newer than the code, or a failed migration
 */

/** VFS operations apps may use (never with the OS-only `system` option). */
const FS_METHODS = /** @type {const} */ ([
  'stat',
  'exists',
  'uniquePath',
  'list',
  'mkdir',
  'writeFile',
  'readFile',
  'readText',
  'rename',
  'move',
  'copy',
  'trash',
  'listTrash',
  'restore',
  'deletePermanently',
  'emptyTrash',
  'setTags',
  'setMeta',
  'search',
  'walk',
  'usage',
]);

/**
 * @param {import('../services/vfs/vfs.js').Vfs} vfs
 * @param {import('../services/vfs/recent.js').RecentFiles} recent
 * @param {(unsub: () => void) => () => void} track
 */
function appFs(vfs, recent, track) {
  /** @type {Record<string, unknown>} */
  const fs = { home: vfs.home };
  for (const name of FS_METHODS) {
    const method = /** @type {(...args: any[]) => any} */ (vfs[name]).bind(vfs);
    fs[name] = (/** @type {any[]} */ ...args) => {
      const last = args.at(-1);
      if (last && typeof last === 'object' && !Array.isArray(last) && 'system' in last) {
        args[args.length - 1] = { ...last, system: false };
      }
      return method(...args);
    };
  }
  fs.watch = (/** @type {string} */ path, /** @type {any} */ fn, /** @type {any} */ options) =>
    track(vfs.watch(path, fn, options));
  /** Files from the real OS (drop or file picker) into a VFS folder; returns the paths written. */
  fs.importFiles = async (
    /** @type {DataTransfer | FileList | File[]} */ source,
    /** @type {string} */ dest,
    /** @type {{ onProgress?: (done: number, total: number) => void }} */ options,
  ) => {
    const entries =
      typeof DataTransfer !== 'undefined' && source instanceof DataTransfer
        ? await entriesFromDataTransfer(source)
        : entriesFromFileList(/** @type {FileList | File[]} */ (source));
    return importEntries(vfs, entries, dest, options);
  };
  /** Downloads a file to the real OS, or a folder as .zip. */
  fs.download = async (/** @type {string} */ path) => {
    const node = await vfs.stat(path);
    if (!node) throw new Error(`No such file or folder: ${path}`);
    return node.type === 'folder' ? exportFolder(vfs, path) : exportFile(vfs, path);
  };
  /** Recently opened files that still exist, newest first. */
  fs.recent = async () => {
    const out = [];
    for (const item of recent.list()) {
      const node = await vfs.stat(item.path);
      if (node && node.type === 'file') out.push({ ...node, openedAt: item.at });
    }
    return out;
  };
  return fs;
}

/**
 * @param {import('./types').AppManifest} manifest
 * @param {Services} services
 * @param {{ instanceId?: string, window?: any, runtime?: import('./runtime.js').Runtime, boundary?: import('./error-boundary.js').Boundary }} [extras]
 *   without a runtime (command handlers, search providers, widgets) nothing is auto-tracked
 * @returns {import('./types').AppContext}
 */
export function createAppContext(manifest, services, extras = {}) {
  const {
    bus,
    logger,
    settings,
    notifications,
    commands,
    shortcuts,
    intents,
    clipboard,
    sound,
    achievements,
    scheduler,
  } = services;
  const appId = manifest.id;
  const { runtime, boundary } = extras;
  /** Tracks a subscription so it ends with the instance. @param {() => unknown} unsub */
  const track = (unsub) => (runtime ? runtime.track(() => void unsub()) : () => void unsub());
  /** @template {(...args: any[]) => any} F @param {F} fn @returns {F} */
  const guard = (fn) => (boundary ? boundary.wrap(fn, 'event') : fn);
  const events = bus.scope({ wrap: guard });
  if (runtime) runtime.track(() => events.dispose());
  const storage = createAppStorage({
    db: services.db,
    bus,
    manifest,
    readOnly: services.isReadOnly(appId),
    onQuarantine: (info) => logger.log('warn', `app:${appId}`, 'Quarantined a corrupt record', info),
  });
  const i18n = services.i18n.scoped(appId);

  return /** @type {import('./types').AppContext} */ (
    /** @type {unknown} */ ({
      app: { id: appId, version: manifest.version, instanceId: extras.instanceId ?? `${appId}#headless` },
      env: {
        ...services.env,
        get online() {
          return globalThis.navigator?.onLine ?? true;
        },
      },
      storage: {
        kv: storage.kv,
        collection(/** @type {string} */ name) {
          const collection = storage.collection(name);
          return {
            ...collection,
            onChange: (/** @type {(change: any) => void} */ fn) => track(collection.onChange(guard(fn))),
          };
        },
      },
      fs: appFs(services.vfs, services.recent, track),
      settings: {
        get: (/** @type {string} */ key) => settings.get(appId, key),
        set: (/** @type {string} */ key, /** @type {unknown} */ value) => settings.set(appId, key, value),
        reset: (/** @type {string} */ key) => (key ? settings.reset(appId, key) : settings.resetScope(appId)),
        onChange: (/** @type {string} */ key, /** @type {(v: unknown) => void} */ fn) =>
          track(settings.onChange(appId, key, guard(fn))),
        system: (/** @type {string} */ key) => settings.get('system', key),
      },
      window: extras.window ?? null,
      dialog: services.dialogs,
      notify: (/** @type {any} */ init) => notifications.notify({ ...init, app: appId }),
      commands: {
        register: (/** @type {any} */ command) =>
          track(commands.register({ ...command, source: appId, run: guard(command.run) })),
        execute: (/** @type {string} */ id, /** @type {unknown} */ args) => commands.execute(id, args),
      },
      shortcuts: {
        register: (
          /** @type {string} */ combo,
          /** @type {(e: KeyboardEvent) => void} */ handler,
          /** @type {any} */ options = {},
        ) =>
          track(
            shortcuts.register(combo, guard(handler), {
              ...options,
              scope: extras.instanceId ?? 'global',
            }),
          ),
      },
      events: {
        on: events.on,
        once: events.once,
        off: events.off,
        emit(/** @type {string} */ type, /** @type {unknown} */ payload) {
          if (RESERVED_EVENTS.some((p) => type.startsWith(p)))
            throw new Error(`Apps cannot emit system events ("${type}")`);
          bus.emit(type, payload);
        },
      },
      intents: {
        open: (/** @type {any} */ target, /** @type {any} */ options) => intents.open(target, options),
        share: (/** @type {unknown} */ data, /** @type {string} */ type, /** @type {any} */ options) =>
          intents.share(data, type, options),
        openersFor: (/** @type {string} */ path) => intents.openersFor(path).map((m) => m.id),
        getDefault: (/** @type {string} */ path) => intents.getDefault(path),
        setDefault: (/** @type {string} */ path, /** @type {string} */ appId) => intents.setDefault(path, appId),
        clearDefault: (/** @type {string} */ path) => intents.clearDefault(path),
      },
      clipboard: {
        readText: () => clipboard.readText(),
        writeText: (/** @type {string} */ text, /** @type {{ sensitive?: boolean }} */ options = {}) =>
          clipboard.writeText(text, { ...options, app: appId }),
        writeImage: (/** @type {Blob} */ image) => clipboard.writeImage(image, { app: appId }),
        files: () => clipboard.files(),
        setFiles: (/** @type {string[]} */ paths, /** @type {{ cut?: boolean }} */ options) =>
          clipboard.setFiles(paths, options),
      },
      sound: {
        play: (/** @type {any} */ name) => sound.play(name, 'ui'),
        output: (/** @type {any} */ category) => sound.output(category),
      },
      // Prototype (not spread) so the `locale` getter stays live after language switches.
      i18n: Object.create(i18n, {
        onChange: { value: (/** @type {() => void} */ fn) => track(i18n.onChange(guard(fn))) },
      }),
      theme: {
        get current() {
          return services.theme.current;
        },
        get scheme() {
          return services.theme.scheme;
        },
        token: (/** @type {string} */ name) => services.theme.token(name),
        onChange: (/** @type {() => void} */ fn) => track(services.theme.onChange(guard(fn))),
      },
      achievements: {
        unlock: (/** @type {string} */ id) => achievements.unlock(appId, id),
        progress: (/** @type {string} */ id, /** @type {number} */ value) => achievements.progress(appId, id, value),
        stat: (/** @type {string} */ key, /** @type {number} */ delta) => achievements.stat(appId, key, delta),
        award: (/** @type {number} */ amount) => achievements.award(appId, amount),
      },
      scheduler: {
        schedule: (/** @type {any} */ job) => scheduler.schedule(appId, job),
        async cancel(/** @type {string} */ id) {
          const job = await scheduler.get(id);
          if (job && job.app !== appId) throw new Error('Apps can only cancel their own jobs');
          await scheduler.cancel(id);
        },
        list: () => scheduler.list(appId),
      },
      ai: services.ai,
      log: logger.child(`app:${appId}`),
      signal: runtime?.signal ?? new AbortController().signal,
      timers: runtime?.timers,
      guard: runtime ? runtime.guard : (/** @type {any} */ fn) => fn,
    })
  );
}
