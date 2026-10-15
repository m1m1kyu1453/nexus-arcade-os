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

## Data (phase 1)

- One IndexedDB database per profile, plus a small global `nexus-system` database (profile list,
  settings needed before login).
- Every store and app has a schema version and ordered migrations. Code that finds data newer than
  itself (an old Lite file, an old tab) refuses to write instead of corrupting it.
- Multiple tabs: a leader tab (Web Locks) runs the scheduler so reminders fire once.
- Storage persistence is requested on first meaningful use; Safari may evict data of
  non-installed sites after 7 days without a visit, so the UI encourages installing and backups.

## Testing

- `tests/unit` (Vitest, Node by default; jsdom per file; fresh `fake-indexeddb` per test).
- `tests/e2e` (Playwright, Chromium): website desktop + phone viewport via `vite preview`,
  Lite via `file://`. Helpers in `tests/helpers/nexus.js`.
- CI (`.github/workflows/ci.yml`): lint → type check → unit → build → e2e. Render deploys only
  after CI passes.
