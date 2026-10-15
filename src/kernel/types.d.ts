// Public app API: the manifest every app/game/tool/plugin exports, and the `ctx` it receives.
// Declarations only (no TS compile step). Referenced from JS via JSDoc:
//   /** @type {import('../../kernel/types').AppManifest} */
// Shapes marked "phase N" are filled in by that phase; changing a shape used by more than one
// app needs the owner's OK (NEXUS_BRIEF.md §2.4).

export type Locale = 'en' | 'de';
/** A user-visible string in every supported language. Needed before an app's i18n files load. */
export type L10n = Record<Locale, string>;
export type Unsub = () => void;

export type AppCategory = 'productivity' | 'study' | 'office' | 'dev' | 'cslab' | 'games' | 'media' | 'ai' | 'system';

/** Scoped storage is always granted. Enforced for plugins (phase 13), shown for all apps. */
export type Permission = 'vfs' | 'notifications' | 'clipboard' | 'network' | 'ai' | 'scheduler' | 'intents';

// ─── Manifest ──────────────────────────────────────────────────────────────────────────────
// Data only, plus lazy imports. Manifests are loaded eagerly at boot, so they must stay small
// and must not import app code. Functions other than lazy loaders are not allowed, so manifests
// can also cross postMessage for sandboxed plugins.

export interface AppManifest {
  /** Reverse-DNS style id: /^[a-z0-9]+(\.[a-z0-9-]+)+$/, e.g. 'nexus.notes'. */
  id: string;
  name: L10n;
  description: L10n;
  /** Semver. */
  version: string;
  /** Id in the shared SVG icon set. */
  icon: string;
  category: AppCategory;
  keywords?: string[];
  window?: WindowOptions;
  permissions?: Permission[];
  /** File/data types this app can open or receive (intents). */
  handles?: IntentHandlerDecl[];
  /** Command metadata. Handlers live in `AppModule.commands`, keyed by id. */
  commands?: CommandDecl[];
  settings?: SettingDecl[];
  widgets?: WidgetDecl[];
  achievements?: AchievementDecl[];
  /** Lazy search provider, loaded when the search service first needs it. */
  search?: () => Promise<{ default: SearchProvider }>;
  /** Stored data: collections (one IndexedDB store each) and the data schema version. */
  storage?: StorageDecl;
  /** Lazy message files (`i18n/en.json`, `i18n/de.json`), loaded together with the app. */
  messages?: Record<Locale, () => Promise<{ default: Record<string, unknown> }>>;
  /** Lazy code chunk. */
  load: () => Promise<AppModule>;
}

export interface WindowOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  resizable?: boolean;
  /** Re-launching focuses the existing window and passes the intent to `AppInstance.onIntent`. */
  singleInstance?: boolean;
}

export interface IntentHandlerDecl {
  action: 'open' | 'share';
  /** Mime types ('text/markdown', 'image/*') or extensions ('.md'). */
  types: string[];
}

export interface CommandDecl {
  id: string;
  title: L10n;
  icon?: string;
  /** e.g. 'Mod+Alt+N' (Mod = Ctrl on Windows/Linux, Cmd on macOS). */
  shortcut?: string;
  /** Context condition, e.g. 'appFocused'. Grammar defined by the command service (phase 1). */
  when?: string;
}

interface SettingBase {
  key: string;
  label: L10n;
  description?: L10n;
}
export type SettingDecl =
  | (SettingBase & { type: 'number'; default: number; min?: number; max?: number; step?: number })
  | (SettingBase & { type: 'string' | 'color' | 'shortcut' | 'path' | 'date'; default: string })
  | (SettingBase & { type: 'boolean'; default: boolean })
  | (SettingBase & { type: 'enum'; default: string; options: { value: string; label: L10n }[] });

export interface WidgetDecl {
  id: string;
  title: L10n;
  /** Default size in grid cells [columns, rows]. */
  size: [number, number];
  /** Smallest size the user can resize to (default [1, 1]). */
  minSize?: [number, number];
  /** Per-widget settings; the shell renders the form and stores values per placed widget. */
  settings?: SettingDecl[];
  icon?: string;
  load: () => Promise<WidgetModule>;
}

export interface AchievementDecl {
  id: string;
  title: L10n;
  description: L10n;
  icon?: string;
  secret?: boolean;
  /** Target for progress achievements (e.g. 100 for "0/100"). */
  goal?: number;
}

export interface StorageDecl {
  /** Data schema version. Bump it together with a new migration (data from phase 2 must load in phase 13). */
  version: number;
  /**
   * Collections this app uses, with their indexes. Declared up front so one IndexedDB upgrade at
   * boot creates every store (stores can only be created during an upgrade).
   * Index value: a key path ('updatedAt', 'meta.due', ['folder', 'title']) or full options.
   */
  collections?: Record<string, { indexes?: Record<string, string | string[] | IndexDecl> }>;
  /** Lazy list of migrations; each runs atomically with its version update. */
  migrations?: () => Promise<{ default: Migration[] }>;
}

export interface IndexDecl {
  keyPath: string | string[];
  unique?: boolean;
  /** Index each element of an array value (e.g. tags). */
  multiEntry?: boolean;
}

export interface Migration {
  /** Schema version this migration produces. Migrations run in ascending order. */
  to: number;
  description?: string;
  /** Use only `tx` inside (no other async work), so the step stays one atomic transaction. */
  run(tx: MigrationContext): Promise<void>;
}

// ─── App code ──────────────────────────────────────────────────────────────────────────────

export interface AppModule {
  /** Called once per window. Must not do work at import time (Lite evaluates every module on load). */
  mount(container: HTMLElement, ctx: AppContext, args: LaunchArgs): AppInstance | Promise<AppInstance>;
  /** Handlers for `manifest.commands`, run without a window (e.g. from the command palette). */
  commands?: Record<string, (ctx: HeadlessContext, args?: unknown) => unknown>;
}

/** One running window of an app. */
export interface AppInstance {
  unmount?(): void | Promise<void>;
  onSuspend?(): void;
  onResume?(): void;
  /** A single-instance app received a new file or shared data. */
  onIntent?(intent: Intent): void;
  /** State to restore after a reload (structured-cloneable); returned as `args.restoredState`. */
  saveState?(): unknown;
}

export interface LaunchArgs {
  intent?: Intent;
  command?: string;
  /** What `saveState()` returned before the page was reloaded. */
  restoredState?: unknown;
  [key: string]: unknown;
}

export interface Intent {
  action: 'open' | 'share';
  type: string;
  /** VFS path for files, or the shared value. */
  path?: string;
  data?: unknown;
}

export interface WidgetModule {
  mount(container: HTMLElement, ctx: WidgetContext): { unmount?(): void } | void;
}

/** ctx for a placed desktop widget: headless ctx plus a lifetime (timers, signal) and its own settings. */
export type WidgetContext = HeadlessContext &
  Pick<AppContext, 'signal' | 'timers' | 'guard'> & {
    widget: {
      /** Unique id of this placed widget. */
      id: string;
      /** Current size in grid cells. */
      size(): [number, number];
      onResize(fn: (size: [number, number]) => void): () => void;
      config: {
        get<T = unknown>(key: string): T;
        set(key: string, value: unknown): void;
        onChange(fn: (key: string) => void): () => void;
      };
    };
  };

export interface SearchResult {
  title: string;
  subtitle?: string;
  icon?: string;
  run(): void | Promise<void>;
}
export type SearchProvider = (query: string, ctx: HeadlessContext) => Promise<SearchResult[]>;

// ─── ctx ───────────────────────────────────────────────────────────────────────────────────

export interface AppContext {
  app: { id: string; version: string; instanceId: string };
  env: { edition: 'web' | 'lite'; dev: boolean; readonly online: boolean };
  storage: AppStorage;
  fs: VFS;
  settings: AppSettings;
  window: WindowHandle;
  dialog: Dialogs;
  notify(notification: NotificationInit): NotificationHandle;
  commands: {
    register(command: CommandDef): Unsub;
    execute(id: string, args?: unknown): Promise<unknown>;
  };
  shortcuts: {
    register(combo: string, handler: (event: KeyboardEvent) => void, options?: { allowInInputs?: boolean }): Unsub;
  };
  events: EventApi;
  intents: {
    open(target: string | VfsEntry, options?: { with?: string }): Promise<void>;
    share(data: unknown, type: string): Promise<void>;
  };
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
    write(items: ClipboardItem[]): Promise<void>;
  };
  sound: { play(name: UiSound): void };
  i18n: I18n;
  theme: { readonly current: string; token(name: string): string; onChange(fn: () => void): Unsub };
  achievements: {
    unlock(id: string): void;
    progress(id: string, value: number): void;
    stat(key: string, delta?: number): void;
  };
  scheduler: {
    schedule(job: JobInit): Promise<string>;
    cancel(id: string): Promise<void>;
    list(): Promise<Job[]>;
  };
  ai: { isAvailable(): boolean };
  log: Logger;
  /** Aborted on unmount: `el.addEventListener('click', fn, { signal: ctx.signal })`. */
  signal: AbortSignal;
  /** Error-guarded timers: paused while the window is suspended, cleared on unmount. */
  timers: {
    setTimeout(fn: () => void, ms: number): Unsub;
    setInterval(fn: () => void, ms: number): Unsub;
    /** requestAnimationFrame loop; `dt` in ms since the previous frame. */
    loop(fn: (dt: number) => void): Unsub;
  };
  /** Wraps a callback so its errors (sync or async) reach this window's error boundary. */
  guard<F extends (...args: never[]) => unknown>(fn: F): F;
}

/** ctx for code that runs without a window: command handlers, search providers, widgets. */
export type HeadlessContext = Omit<AppContext, 'window' | 'signal' | 'timers'>;

// Service-side shapes. Placeholders marked here are specified by the phase that builds them.

export interface AppStorage {
  kv: KeyValueStore;
  /** A collection declared in `manifest.storage.collections`. */
  collection<T extends { id: string }>(name: string): Collection<T>;
}
export interface KeyValueStore {
  get<T>(key: string, fallback?: T): Promise<T | undefined>;
  /** `undefined` is rejected; use delete(). */
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  entries(): Promise<Record<string, unknown>>;
  clear(): Promise<void>;
}

/** IndexedDB key: number, string, Date, binary, or an array of those. */
export type StorageKey = IDBValidKey;
export interface KeyRange {
  only?: StorageKey;
  lower?: StorageKey;
  upper?: StorageKey;
  lowerOpen?: boolean;
  upperOpen?: boolean;
}
export interface CollectionQuery {
  /** Index declared in the manifest; omitted = by id. */
  index?: string;
  equals?: StorageKey;
  range?: KeyRange;
  direction?: 'next' | 'prev';
  offset?: number;
  limit?: number;
}
export interface Collection<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  all(query?: CollectionQuery): Promise<T[]>;
  query(query: CollectionQuery): Promise<T[]>;
  count(query?: CollectionQuery): Promise<number>;
  /** Creates or replaces. Throws ValidationError for invalid items. */
  put(item: T): Promise<T>;
  /** Adds an item, generating an id if it has none. */
  create(data: Omit<T, 'id'> & { id?: string }): Promise<T>;
  /** Merges a patch into an existing item atomically. */
  update(id: string, patch: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  /** Also fires for changes made in other tabs (`remote: true`). */
  onChange(fn: (change: { type: 'put' | 'delete' | 'clear'; id?: string; remote?: boolean }) => void): Unsub;
}

export interface AppSettings {
  get<T>(key: string): T;
  set(key: string, value: unknown): Promise<void>;
  /** Without a key: reset all of this app's settings. */
  reset(key?: string): Promise<void>;
  onChange(key: string, fn: (value: unknown) => void): Unsub;
  /** Read-only access to system settings (e.g. 'locale', 'reducedMotion'). */
  system<T>(key: string): T;
}

export interface EventApi {
  /** `type` may end in '*' (e.g. 'vfs:*'). Listeners are removed automatically on unmount. */
  on(type: string, fn: (payload: unknown, type: string) => void): Unsub;
  once(type: string, fn: (payload: unknown, type: string) => void): Unsub;
  off(type: string, fn: (payload: unknown, type: string) => void): void;
  emit(type: string, payload?: unknown): void;
}

export interface I18n {
  readonly locale: Locale;
  t(key: string, vars?: Record<string, unknown>): string;
  date(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  currency(value: number, currency: string): string;
  relative(value: number, unit: Intl.RelativeTimeFormatUnit): string;
  list(items: string[], options?: Intl.ListFormatOptions): string;
  onChange(fn: () => void): Unsub;
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export type UiSound = 'open' | 'close' | 'minimize' | 'notification' | 'error' | 'click' | 'achievement';

export interface CommandDef extends CommandDecl {
  run(args?: unknown): unknown;
}

// Phase 1 (VFS, notifications, scheduler) and phase 2 (window, dialogs) specify these fully.
export interface VFS {
  [operation: string]: unknown;
}
export interface VfsEntry {
  path: string;
  type: 'file' | 'folder';
  mime?: string;
}
export interface WindowHandle {
  readonly title: string;
  setTitle(title: string): void;
  /** Number shown on the app's dock icon (null hides it). */
  setBadge(count: number | null): void;
  /** Progress bar on the dock icon, 0–1 (null hides it). */
  setProgress(value: number | null): void;
  minimize(): void;
  maximize(): void;
  restore(): void;
  close(): Promise<void> | void;
  focus(): void;
  resize(width: number, height: number): void;
  setFullscreen(on: boolean): void;
  readonly isFocused: boolean;
  /** Called when the window's content area changes size. */
  onResize(fn: () => void): Unsub;
}
export interface Dialogs {
  [operation: string]: unknown;
}
export interface NotificationInit {
  title: string;
  body?: string;
  [option: string]: unknown;
}
export interface NotificationHandle {
  close(): void;
}
export interface JobInit {
  [option: string]: unknown;
}
export interface Job {
  id: string;
  [field: string]: unknown;
}
export interface MigrationContext {
  /** Raw access to one of this app's collections inside the migration transaction. */
  collection(name: string): {
    get(id: string): Promise<any>;
    getAll(): Promise<any[]>;
    put(item: any): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
  };
}
