# Architecture

Nexus Arcade OS is a static, offline-first web app. There is no backend: all data lives in the
browser (IndexedDB) unless the user exports it or configures an AI server.

## Layers

```
apps/ games/            ← features; talk to the OS only through `ctx`
   │  ctx (kernel/types.d.ts)
shell/                  ← desktop, windows, dock, launcher … (phase 2)
kernel/                 ← event bus, app registry, lifecycle, intents, error boundary, logger (phase 1)
services/               ← storage, VFS, settings, theme, i18n, search, scheduler … (phase 1)
ui/ styles/             ← shared Web Components, icons, design tokens
workers/                ← heavy work off the main thread
```

Rules:

- An app never touches another app's storage or DOM. Cross-app features use intents and events.
  `eslint.config.js` blocks imports from apps/games into anything but their own folder, `ui/`,
  `styles/` (and `games/engine/` for games).
- Manifests are **data only** plus lazy imports, so all of them can be loaded at boot without
  loading app code, and they can cross `postMessage` for sandboxed plugins (phase 13).
- `mount(container, ctx, args)` returns an `AppInstance`; one per window.
- Callbacks registered through `ctx` (`signal`, `timers`, `guard`, `events`) are cleaned up on
  unmount, paused on suspend, and report errors to that window's error boundary.

## App lifecycle

```
registry.register(manifest)          boot: validate all manifests (eager, small)
        │ launch(id, args)
        ▼
manifest.load()  ──►  AppModule        lazy chunk (web) / already inlined (Lite)
        │ mount(container, ctx, args)
        ▼
AppInstance  ── onSuspend/onResume ──  minimized, other workspace, hidden tab
        │ close
        ▼
instance.unmount() + ctx.signal aborted + timers/listeners cleared
```

## Two builds, one source

|                | Website (`vite.config.js`)   | Nexus Lite (`vite.lite.config.js`)                                    |
| -------------- | ---------------------------- | --------------------------------------------------------------------- |
| Entry          | `index.html` → `src/main.js` | `lite.html` → `src/lite.js`                                           |
| Output         | `dist/` with hashed chunks   | `dist/nexus-lite.html`, one file                                      |
| Code splitting | one chunk per app            | none (everything inlined)                                             |
| Offline        | Service Worker precache      | the file itself                                                       |
| Workers        | separate files               | Blob URL (`?worker` rewritten to `?worker&inline`)                    |
| CSP            | `script-src 'self'`          | needs `'unsafe-inline'`                                               |
| Data           | origin of the site           | `file://` origin (separate from the website; use backup to move data) |

`src/env.js` exposes the edition, version and build date as build-time constants.

## Offline and updates (website)

- `src/sw.js` precaches everything the build emits (JS, CSS, fonts, icons, HTML, manifest),
  except `nexus-lite.html`. Large optional assets (sql.js, Pyodide) will be cached on first use.
- Navigations are answered with the cached `index.html`.
- A new deploy installs a new SW that **waits**. The page shows "Update available — reload";
  clicking it sends `SKIP_WAITING`, the new SW takes over and the page reloads.
- Render serves `/sw.js`, `/` and `/index.html` with `no-cache`, and hashed `/assets/*` as immutable.

## Boot sequence (`src/kernel/system.js`)

1. Logger (ring buffer, persisted in `nexus-system`), event bus, global error handlers.
2. Storage engine: IndexedDB → localStorage → memory (`services/storage/select.js`); a fallback
   is announced to the user. Every engine passes the same contract tests.
3. Profile: last used (or a new default profile). Each profile has its own database
   `nexus-profile-<id>`; the profile list, last profile and log live in `nexus-system`.
4. Registry validates manifests; the profile database is opened with the stores of all services
   plus one store per declared app collection (`app:<id>/<name>`). The IndexedDB engine adds
   missing stores/indexes automatically and never deletes stores.
5. Settings → i18n → theme → VFS → notifications → sound → clipboard → achievements →
   scheduler → app migrations → commands/shortcuts → intents → permissions → lifecycle →
   search (worker) → cross-tab relay.
6. Startup notices: storage fallback warning, migration problems, missed reminders.

## Data

- **Migrations** (`services/storage/migrations.js`): each app declares `storage.version` and
  lazy `migrations`; each step runs in one transaction with its version update. A failed step or
  data from a newer version makes that app's storage read-only (reads work, writes are refused)
  and the user is told. Data is never wiped.
- **Quarantine:** records that fail validation on read move to the `quarantine` store.
- **Other tabs:** collection, kv, settings, VFS, notification-history and scheduler events are
  mirrored over `BroadcastChannel`; only one tab (Web Locks leader) fires scheduled jobs.
- **Persistence:** requested on the first real data write. Safari may evict data of
  non-installed sites after 7 days without a visit, so the UI encourages installing and backups.
- **Backup** (`services/backup/backup.js`): one `.nexus-backup` zip (manifest, per-store JSON,
  raw binary files), optionally AES-GCM encrypted; restore replaces or merges, and migrations
  run on the next boot.

## Testing

- `tests/unit` (Vitest, Node by default; jsdom per file; fresh `fake-indexeddb` per test).
- `tests/e2e` (Playwright, Chromium): website desktop + phone viewport via `vite preview`,
  Lite via `file://`. Helpers in `tests/helpers/nexus.js`.
- CI (`.github/workflows/ci.yml`): lint → type check → unit → build → e2e. Render deploys only
  after CI passes.
