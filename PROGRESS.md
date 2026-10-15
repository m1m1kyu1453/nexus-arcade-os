# Progress

## Status

- **Current phase:** 2 — Shell (phase 1 done 2026-10-15, `v0.1.0`)
- **Next step:** phase 2 in progress. Done (not yet wired into boot): two-stage kernel boot (`bootKernel` → `openProfile`, progress steps for the boot screen), 140-icon set, UI kit (`src/ui/dom.js`, controls, context menu, modals/popovers/tooltips), window geometry + tests, window manager core (`src/shell/wm/window-manager.js` + `wm.css`: windows, drag/resize/snap/snap layouts, workspaces, minimize animation, session snapshot), `app-icon.js`, `session.js`, shell settings, `saveState()`/`args.restoredState`. NEXT: `src/shell/shell.js` orchestrator replacing `boot.js` placeholder flow (use WM as lifecycle host, restore session), then top bar, dock, Welcome app (`src/apps/welcome`), desktop + wallpapers, launcher, command palette, notification center/quick settings, overview/switcher, boot + lock screens, dialogs, widgets, mobile shell; update e2e (placeholder testids go away). Shortcut plan: browser-safe defaults (close Alt+W, switcher Alt+`, overview Mod+Shift+Space) plus hidden spec combos (Mod+W, Alt+Tab, Mod+Tab) that fire where delivered (fullscreen Keyboard Lock) — record as decision when implemented.
- **Phase 1 verification:** 336 unit tests incl. `tests/unit/system.test.js` (whole system in jsdom: launch, storage, VFS, search, crash/restart, language switch, backup → wipe → restore, newer-data read-only); e2e asserts the kernel boots (`<html data-kernel="ready">`) on the website, offline, and in Lite from `file://`.

## Decisions

Recorded per NEXUS_BRIEF.md §2.4. Newest last.

| Date       | Decision                                                                                                                                                                                                                                                                              | Why                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-15 | **Manifests are data-only** (plus lazy `load`/`search`/`migrations`/widget imports). Command handlers live in `AppModule.commands`; search providers are a lazy import.                                                                                                               | Manifests load eagerly at boot: functions would pull app code into the initial bundle (200 KB budget) and can't cross `postMessage` for phase 13 plugins. Approved by owner.            |
| 2026-10-15 | **`mount()` returns an `AppInstance`** (`unmount`, `onSuspend`, `onResume`, `onIntent`) instead of a module-level `unmount()`.                                                                                                                                                        | A module is loaded once but apps can have several windows. Approved by owner.                                                                                                           |
| 2026-10-15 | **`ctx.signal`, `ctx.timers`, `ctx.guard`** added to `ctx`.                                                                                                                                                                                                                           | All apps share one JS realm, so async errors can only be attributed to an app if callbacks go through ctx wrappers; the same wrappers pause loops on suspend (§5.5). Approved by owner. |
| 2026-10-15 | **App boundary enforced by ESLint** (`no-restricted-imports` regex in `eslint.config.js`): apps import only their own files, `ui/`, `styles/`; games also `games/engine/`.                                                                                                            | §5.3 is otherwise only a convention for built-in apps.                                                                                                                                  |
| 2026-10-15 | **Service Worker: vite-plugin-pwa in `injectManifest` mode** with our own `src/sw.js` (Workbox precaching + navigation fallback).                                                                                                                                                     | Workbox handles hashed precache lists and cache versioning; injectManifest keeps the SW ours so phase 7 can add a VFS route for iframe previews.                                        |
| 2026-10-15 | **Update flow:** `registerType: 'prompt'`; the SW calls `skipWaiting()` only on a `SKIP_WAITING` message sent when the user clicks "Reload" in the toast. Open tabs also check for updates hourly. The changelog is shown after reload (Settings → About, phase 3), not in the toast. | A waiting SW can't reliably tell the old page what changed without an extra network fetch.                                                                                              |
| 2026-10-15 | **`render.yaml`: `autoDeployTrigger: checksPass`** and a `no-cache` header for `/` in addition to `/index.html`.                                                                                                                                                                      | Red CI never deploys; visitors request `/`, not `/index.html`. Approved by owner.                                                                                                       |
| 2026-10-15 | **Lite workers:** the Lite build rewrites `?worker` imports to `?worker&inline` (Blob URL, data: URL fallback). Website workers stay separate cached files.                                                                                                                           | `file://` can't load worker files; the website keeps workers cacheable and CSP-clean.                                                                                                   |
| 2026-10-15 | **Build-time constants** (`__APP_VERSION__`, `__BUILD_DATE__`, `__EDITION__`) via Vite `define`; `window.NEXUS_EDITION` is also set by each entry as the spec asks.                                                                                                                   | A runtime global set in an entry module runs after its imports, so modules can't rely on it at import time.                                                                             |
| 2026-10-15 | **CSP** meta tag injected in production builds only. Website: `script-src 'self'`, `style-src 'self'`, `connect-src 'self'`. Lite needs `'unsafe-inline'` for its inlined script/style.                                                                                               | Dev server needs inline scripts and an HMR websocket. `connect-src` must widen in phase 12 for user-configured AI servers.                                                              |
| 2026-10-15 | **Fonts vendored** (Inter Variable, JetBrains Mono Variable; Latin subset woff2 from Fontsource, OFL texts next to them) in `src/styles/fonts/`, referenced relatively so Vite fingerprints them (web) and inlines them (Lite).                                                       | No npm dependency needed; ~88 KB total.                                                                                                                                                 |
| 2026-10-15 | **PNG icons rendered with Playwright** (`npm run icons`) from `src/ui/brand/logo.svg`; output committed to `public/icons/`.                                                                                                                                                           | No extra image tool; Playwright is already a dev dependency.                                                                                                                            |
| 2026-10-15 | **Unit tests run in Node by default**, DOM tests opt in with `// @vitest-environment jsdom`.                                                                                                                                                                                          | Node's real Blob/structuredClone work with fake-indexeddb; jsdom's Blob does not.                                                                                                       |
| 2026-10-15 | **Persistent storage request:** phase 0 asks on the first pointer interaction; from phase 1 the storage service asks on the first real data write. The placeholder shows the current state honestly.                                                                                  | "First meaningful use", never on page load.                                                                                                                                             |
| 2026-10-15 | **Node 24 LTS** pinned (`.nvmrc`, `engines`).                                                                                                                                                                                                                                         | Current Active LTS.                                                                                                                                                                     |
| 2026-10-15 | **PBKDF2 iterations: 600,000** (not 310,000) for all password-based encryption and PIN hashing.                                                                                                                                                                                       | Current OWASP recommendation for PBKDF2-HMAC-SHA256.                                                                                                                                    |
| 2026-10-15 | **Planned for phase 1:** a global `nexus-system` IndexedDB (profile list, pre-login settings) beside the per-profile databases; Web Locks leader tab for the scheduler; refuse/read-only when stored schema is newer than the code; Safari 7-day eviction warning + backup reminder.  | Risks raised in the phase 0 review and accepted by the owner.                                                                                                                           |

| 2026-10-15 | **App collections are declared in `manifest.storage`** (`{ version, collections: { name: { indexes } }, migrations }`), replacing the proposed `storageVersion`/`migrations` fields; `ctx.storage.collection(name)` takes no options. | IndexedDB creates stores only during a version upgrade; declaring them lets one upgrade at boot cover all apps instead of runtime upgrades that disrupt other tabs. No app used the old shape yet. |
| 2026-10-15 | **Storage engines share one contract** (`tests/unit/storage-engines.test.js`): IndexedDB, localStorage (whole store as JSON per key, Blobs base64) and memory, all with IndexedDB key ordering. IndexedDB schemas upgrade automatically (version bump when stores/indexes are missing); stores are never deleted. | Fallback engines behave identically; no hand-maintained IDB versions; older tabs/Lite files keep working. |
| 2026-10-15 | **Migrations are atomic per step** and record the data version in a `meta` store; data newer than the code or a failed migration makes that app's storage **read-only** (reads work, writes rejected). | "Failed migration → keep old data, never wipe" (spec 1.2). |
| 2026-10-15 | **An uncaught error in an app crashes its window** (first error trips the boundary; crash UI with Restart / Copy report). | Matches how real OSes treat uncaught exceptions; keeps a broken app from running in an inconsistent state. |

| 2026-10-15 | **Phase 1 dialogs are the browser's alert/confirm/prompt** (`src/shell/native-dialogs.js`, "Open with…" as a numbered prompt); file/save/color dialogs reject with an honest message until phase 2. | No app needs them before the shell exists; nothing pretends to work. |
| 2026-10-15 | **Cross-phase P1 "say so in Settings and Calendar/Clock help" (1.10)**: the text exists in EN/DE (`system: scheduler.limits`); the item is completed by phases 3–5 when those screens exist, and stays open here. Likewise the PIN notice ("privacy lock, not real security") is shown by the phase 2 lock screen. | The UI that must show them doesn't exist in phase 1. |
| 2026-10-15 | **Debug screen (#debug, dev builds only) and the kernel test app (`src/dev/test-app`) are English-only developer tools**, never shipped in production builds. | Spec 1.13: temporary developer page. |
| 2026-10-15 | **Apps cannot emit OS event namespaces** (`app:`, `vfs:`, `storage:`, … see docs/events.md); `ctx.events.emit` throws for them. | Keeps system events trustworthy (no spoofed `vfs:changed`). |
| 2026-10-15 | **App messages load together with the app** (lifecycle `prepare` step before mount; also before command handlers and search providers). | Spec 1.7: lazy-loaded with the app. |
| 2026-10-15 | **An app's search provider gets a relevance floor (score 350)** below exact/prefix matches of indexed items. | Providers filter for relevance themselves; their results shouldn't drown or be drowned by fuzzy matches. |

## Cuts

None yet.

## Known issues

- `npm audit`: 3 high-severity advisories in `braces` (via `micromatch` ← `vite-plugin-singlefile`). Build-time only, patterns are our own; no patched `braces` exists and the suggested fix downgrades the plugin to 0.9. Re-check when the plugin updates.

## Checklist

Every item from every spec, grouped by phase. Untagged items inherit the priority of their section heading.

### Phase 0 — Foundation — `specs/00-foundation.md`

**0.1 Project setup**

- [x] [P1] `git init`, Vite project (vanilla JS), Node LTS pinned in `.nvmrc` and `package.json` `engines`.
- [x] [P1] Scripts: `dev`, `build` (website + Lite), `build:web`, `build:lite`, `preview`, `test` (Vitest), `test:e2e` (Playwright), `lint`, `format`, `typecheck`.
- [x] [P1] ESLint + Prettier config, `.editorconfig`, `jsconfig.json` with `checkJs` for `src/kernel` and `src/services`.
- [x] [P1] Folder structure from the master brief §5.1, with an `index.js` per folder where it makes sense.
- [x] [P1] `CLAUDE.md`, `PROGRESS.md` (with **every** item from **all** spec files as a checklist, grouped by phase), `CHANGELOG.md`, `README.md`, `LICENSE` (MIT), `docs/architecture.md`.

**0.2 PWA and offline**

- [x] [P1] Web app manifest: name, short name, description, start URL, display `standalone`, theme/background colors, icons (192, 512, maskable, SVG). Generate PNG icons from one SVG source with a dev script (ask before adding a tool for it).
- [x] [P1] Service Worker (vite-plugin-pwa/Workbox or hand-written, decide and justify): precache shell + all chunks + fonts + icons; versioned; `skipWaiting` only after the user confirms the update toast.
- [x] [P1] Offline indicator in the placeholder UI, and an "Update available — reload" toast.
- [x] [P1] Request `navigator.storage.persist()` on first meaningful use (not on first page load).

**0.3 Nexus Lite build**

- [x] [P1] `vite.lite.config.js` → `dist/nexus-lite.html`, fully self-contained.
- [x] [P1] `src/lite.js` entry that sets a global `NEXUS_EDITION = 'lite'` flag; Service Worker registration is skipped there.
- [x] [P1] Proof that a Web Worker can be started from an inline Blob URL in Lite (a tiny ping/pong worker, with a test).
- [x] [P2] Build reports the size of the Lite file and fails if it exceeds a budget set in `CLAUDE.md` (start with 8 MB, adjust later with my OK).

**0.4 Testing**

- [x] [P1] Vitest set up with jsdom + `fake-indexeddb` (ask) for service tests.
- [x] [P1] Playwright set up; smoke tests: (a) website loads with no console errors, (b) load → go offline → reload → still loads, (c) `nexus-lite.html` loads from `file://`.
- [x] [P1] A test helper to start the app with a clean profile and seed data.

**0.5 CI and deployment**

- [x] [P1] GitHub Actions workflow per master brief §4.2, with npm and Playwright browser caching.
- [x] [P1] Create the GitHub repo `nexus-arcade-os`, push, CI green.
- [x] [P1] `render.yaml` per master brief §4.3. Tell me to connect it; after I confirm, verify the live site loads and works offline.
- [x] [P2] README badge for CI status; live URL in README.

**0.6 Placeholder screen**

- [x] [P1] A dark full-screen page with the Nexus logo (SVG), version number, build date, edition (web/lite), online/offline state, and "Phase 0 — foundation ready". This gets replaced in phase 2.

### Phase 1 — Kernel & Services — `specs/01-kernel-services.md`

**1.1 Kernel**

- [x] [P1] **Event bus:** typed events (documented in `docs/events.md`), `on/once/off/emit`, wildcard listeners, auto-unsubscribe when an app unmounts.
- [x] [P1] **App registry:** registers manifests, validates them (clear error for a bad manifest), lists by category, enable/disable, lazy-loads the code chunk, tracks instances.
- [x] [P1] **Lifecycle:** launch (with launch args), mount, focus/blur, suspend (minimized / other workspace / hidden tab), resume, unmount. Apps can declare `onSuspend`/`onResume`.
- [x] [P1] **Intents:** apps declare `handles`; `ctx.intents.open(file)` picks the default app or asks ("Open with…", "Always use this app"); `ctx.intents.share(data, type)` sends text/files/images to any app that accepts them.
- [x] [P1] **Error boundary + crash reporter:** catches errors in mount, event handlers and async code of an app; shows the crash UI; logs a report with stack, app id, version and recent log lines.
- [x] [P1] **Logger:** levels, per-source tags, ring buffer (last 2,000 entries) persisted across reloads, exported with backups if the user wants.
- [x] [P2] **Permissions:** apps declare permissions; built-in apps are trusted; the model is ready for plugins in phase 13 (ask user on first use, revoke in Settings).

**1.2 Storage**

- [x] [P1] **Storage adapter:** IndexedDB with `localStorage` fallback and in-memory last resort (visible warning). A small promise-based wrapper: stores, get/put/delete/query by index, transactions, cursors for large sets.
- [x] [P1] **Collections API** for apps (`ctx.storage.collection('notes')`): CRUD, indexes, simple queries, change events.
- [x] [P1] **Key-value API** for small app state (`ctx.storage.kv`).
- [x] [P1] **Migrations:** per-store and per-app schema version; ordered migration functions; run at boot with progress shown in the boot log; failed migration → keep old data, report, never wipe.
- [x] [P1] **Quota handling:** catch quota errors, notify the user with what is using space and how to free it.
- [ ] [P2] **Corrupt-data quarantine:** records that fail validation are moved to a quarantine store and listed in Settings → Storage. — _open: quarantine works (storage layer, tests); listing it in Settings → Storage comes with the Settings app (phase 3)._

**1.3 Virtual File System (VFS)**

- [x] [P1] Hierarchical file system in IndexedDB: folders and files, paths (`/home/<user>/Documents/...`), mime types, size, created/modified dates, tags, metadata. Blobs stored separately from metadata.
- [x] [P1] Default folders per profile: `Desktop`, `Documents`, `Downloads`, `Pictures`, `Music`, `Videos`, `Projects`, `.config`, plus `/system` (read-only) and a Trash.
- [x] [P1] Operations: create, read, write (text and binary), rename, move, copy (recursive), delete to trash, restore, empty trash, stat, list, exists, search by name/tag/content (text files).
- [x] [P1] Watchers: apps subscribe to changes on a path.
- [x] [P1] Import from the real OS (file picker + drag & drop, folders where supported) and export (download a file, or a folder as zip if fflate is approved).
- [x] [P1] Path utilities (normalize, join, dirname, basename, extname, relative), safe against `..` escapes.
- [ ] [P2] File versions: keep the last N versions of text files, restore from history. — _open (P2)._
- [ ] [P3] "Mount" a real folder via the File System Access API (Chromium only, honest fallback elsewhere). — _open (P3)._

**1.4 Profiles**

- [x] [P1] Multiple local profiles, each with its own database: name, avatar (generated identicon or uploaded image), accent color.
- [x] [P1] Optional PIN or password per profile (hashed with PBKDF2; this is a privacy lock, not real security, and the UI says so).
- [ ] [P2] Guest profile that wipes itself on logout. — _open: guest flag exists; wiping on sign-out needs the phase 2 lock screen/sign-out._

**1.5 Settings service**

- [x] [P1] Typed settings schema (string, number, boolean, enum, color, shortcut, file path), defaults, validation, migration.
- [x] [P1] System settings + per-app settings from manifests; change events so changes apply live without reload.
- [x] [P1] Reset one setting, one app, or everything.

**1.6 Theme engine**

- [x] [P1] Loads token sets, applies them as CSS custom properties on `:root`, live switching with a smooth transition.
- [x] [P1] The 8 themes from master brief §6, accent color override, font scale, transparency/blur level, animation level (full, reduced, off).
- [x] [P1] Follows system light/dark preference if the user picks "Auto".
- [x] [P2] Automatic contrast check of accent color against backgrounds; warns or adjusts if below WCAG AA.
- [ ] [P2] Time-based theme switching (e.g. light during the day, dark at night). — _open (P2)._

**1.7 i18n**

- [x] [P1] JSON message files per language and app, lazy-loaded with the app; fallback to English; missing keys logged in dev.
- [x] [P1] Interpolation, plurals (`Intl.PluralRules`), dates/times/numbers/currencies/relative time via `Intl`.
- [x] [P1] Language switch at runtime without reload.
- [x] [P2] A dev script that lists missing/unused keys per language; runs in CI.

**1.8 Commands and shortcuts**

- [x] [P1] Command registry: id, title, icon, category, `when` condition (e.g. only when an app is focused), run function, optional arguments.
- [x] [P1] Shortcut manager: global and app-scoped shortcuts, `Mod` = Ctrl/Cmd, conflict detection, user rebinding, a reset option, ignoring shortcuts inside text inputs where appropriate.
- [x] [P2] Chord shortcuts (e.g. `Ctrl+K Ctrl+T`).

**1.9 Notifications**

- [x] [P1] Toasts with title, body, icon, app source, actions (buttons), progress, timeout or sticky.
- [x] [P1] History stored for the notification center (phase 2 UI).
- [x] [P1] Do-not-disturb (manual and during Focus sessions), per-app mute.
- [x] [P1] Optional browser notifications (system-level) when Nexus is in the background, after asking permission.

**1.10 Scheduler**

- [x] [P1] Persistent scheduled jobs (reminders, alarms, recurring tasks): stored in IndexedDB, fired while Nexus is open, and **missed jobs are shown on next start** ("While you were away: 2 reminders").
- [ ] [P1] Honest about limits: a closed browser tab cannot fire reminders. Say so in Settings and in the Calendar/Clock help. — _open: the message exists in EN/DE (`scheduler.limits`); it is shown once Settings (phase 3) and Calendar/Clock (phases 4–5) exist._
- [x] [P1] Recurrence rules (daily, weekly on days, monthly, yearly, every N, until/count), with unit tests including DST changes.

**1.11 Search service**

- [x] [P1] Index in a Web Worker: apps, commands, settings, files (names + text content), and app-provided providers.
- [x] [P1] Fuzzy matching with ranking (exact > prefix > word start > fuzzy; recent and frequent items boosted), highlights of matched characters.
- [x] [P1] Incremental updates when files/data change.

**1.12 Other services**

- [x] [P1] **Sound service:** synthesized UI sounds (master brief §6), categories (UI, notifications, games, media), master volume, mute, respects reduced-motion/quiet mode.
- [x] [P1] **Clipboard service:** wraps the async Clipboard API with fallbacks; keeps a history of copies made inside Nexus (used by the Clipboard app in phase 5).
- [x] [P1] **Achievements & XP service:** register achievements per app, unlock with a notification, progress achievements (e.g. 0/100), secret achievements, global XP and levels (formula documented), stats per app.
- [x] [P1] **Backup service:** export the whole profile (all stores + VFS blobs + settings) as one `.nexus-backup` file (zip or JSON), optional password encryption; import with preview (what's inside, which version), merge or replace; restore runs migrations. Round-trip test: backup → wipe → restore → identical data.
- [x] [P2] **AI service stub:** just the interface `ctx.ai` that phase 12 fills in. `ctx.ai.isAvailable()` returns false until configured, so apps can hide AI buttons honestly.

**1.13 Debug screen**

- [x] [P1] A temporary developer page (only in dev mode) that shows registered apps, services, storage contents, the event log, and buttons to trigger notifications/crashes. This proves the kernel works before the shell exists.

### Phase 2 — Shell (the desktop experience) — `specs/02-shell.md`

**2.1 Boot and login**

- [ ] [P1] **Boot sequence:** animated Nexus logo, a progress bar tied to real init steps (storage, migrations, settings, theme, app registry, search index), a scrolling system log with real messages, and a smooth transition to the lock screen or desktop.
- [ ] [P1] Skippable with any key/click; "Fast boot" setting; much shorter on later visits.
- [ ] [P1] **Lock screen:** large clock and date, wallpaper with blur, profile picker, PIN/password field, "Switch profile", "Create profile". Lock with `Mod+L` and after an idle time (setting).
- [ ] [P2] First-boot setup: name, avatar, language, theme, accent. Done in under 30 seconds.
- [ ] [P3] A BIOS-style "boot menu" easter egg when holding a key during boot (safe mode = start without restoring windows).

**2.2 Desktop**

- [ ] [P1] **Desktop icons:** files and app shortcuts from the `Desktop` folder; drag with grid snap; multi-select (box select, Ctrl/Shift click); rename; delete; open; drag files in from the real OS.
- [ ] [P1] **Desktop context menu:** new folder, new text file, new note, paste, sort icons, change wallpaper, display settings, open terminal here — all functional.
- [ ] [P1] **Wallpapers:** · static gradient and image wallpapers (a set of generated ones built into the app, plus user images from the VFS), · **live wallpapers** on canvas/WebGL: particle network (reacts to cursor), aurora, synthwave grid, matrix rain, starfield, and a slow fluid gradient, · fit modes (fill, fit, center, tile), dimming and blur sliders, slideshow from a folder with an interval.
- [ ] [P1] Live wallpapers pause when windows are maximized or the tab is hidden, and fall back to static in battery-saver/reduced-motion.
- [ ] [P2] Time-of-day wallpaper (colors shift from morning to night).
- [ ] [P2] Desktop sticky notes (stored as notes, so they also appear in Nexus Notes).

**2.3 Widgets**

- [ ] [P1] Widget host: add from a widget gallery, drag to place, resize in grid steps, remove, per-widget settings, layout saved per workspace.
- [ ] [P1] Built-in widgets: clock (analog/digital/world), calendar month, system status (FPS, storage, online/offline, battery where supported), quick note, today's tasks, now playing, Pomodoro, countdown to a date, app launcher grid.
- [ ] [P2] Quote/tip of the day (from a bundled list), habit streaks, upcoming events, XP/level progress.
- [ ] [P1] Apps can provide widgets through their manifest (master brief §5.2).

**2.4 Window manager**

- [ ] [P1] Windows: title bar with icon, title, and min/max/close buttons; drag; resize from all edges and corners; minimum sizes; z-order; focus with a visual focused state (cursor-following glow on the border).
- [ ] [P1] Open/close/minimize/maximize/restore animations (with reduced-motion fallback), minimize animates into the dock icon.
- [ ] [P1] Double-click title bar to maximize; drag a maximized window to restore it.
- [ ] [P1] **Snapping:** drag to left/right edge (halves), corners (quarters), top (maximize), with a preview overlay. **Snap layouts** menu when hovering the maximize button (halves, thirds, quarters, 2/3 + 1/3). Resizing snapped neighbours together.
- [ ] [P1] Window state (position, size, snap, workspace, app state where the app supports it) restored after reload.
- [ ] [P1] Keyboard: `Mod+Arrows` to snap, `Mod+M` minimize, `Mod+W` close, `Alt+F4` style close where possible, `Mod+Shift+Arrows` move between workspaces.
- [ ] [P1] Multiple instances of the same app where the manifest allows it.
- [ ] [P1] Windows stay within the viewport on browser resize; nothing gets lost off-screen.
- [ ] [P2] **Tiling mode** toggle per workspace: windows auto-arrange in a master/stack layout, keyboard-driven (like a tiling WM).
- [ ] [P2] Always-on-top, window opacity, "roll up" (title bar only), pin to all workspaces.
- [ ] [P2] App menu bar inside windows (File, Edit, View …) provided by apps through `ctx.window.setMenu`.
- [ ] [P3] Shake a window to minimize all others.

**2.5 Workspaces and overview**

- [ ] [P1] At least 4 virtual workspaces (user can add/remove/rename), switch with `Ctrl+Alt+Arrows` or `Mod+1..9`, slide animation, move windows between them by drag or shortcut.
- [ ] [P1] **Overview** (`Mod+Tab` or hot corner): all windows of the current workspace as live-ish thumbnails, workspaces strip on top, drag windows between workspaces, type to search apps.
- [ ] [P1] **Alt+Tab switcher:** window list with icons and titles, cycling with Tab/Shift+Tab, release to switch.

**2.6 Dock, top bar, launcher**

- [ ] [P1] **Dock:** pinned apps, running indicators (dot per instance), badges (unread count), progress bars (e.g. downloads, exports), right-click menu (new window, pin/unpin, close all, app settings), drag to reorder, position bottom/left/right, auto-hide option.
- [ ] [P1] Hover magnification (macOS-like), configurable or off.
- [ ] [P1] Window previews on hover for running apps with multiple windows.
- [ ] [P1] **Top bar / system tray:** launcher button, active app name, workspace indicator, clock (click opens calendar popover), online/offline state, volume, notifications bell with count, profile menu (lock, switch profile, settings, log out).
- [ ] [P1] **Launcher / start menu:** search box, pinned apps, all apps by category, recent files, recent apps; fully keyboard-operable; opens with `Mod` key tap or `Mod+Space`.
- [ ] [P2] Dock folders/stacks (e.g. "Games").

**2.7 Command palette (`Ctrl+K`)**

- [ ] [P1] Fuzzy search across apps, commands, settings, files and app search providers (phase 1 search service), with icons, categories, highlighted matches, keyboard navigation, recent items on empty input.
- [ ] [P1] Prefix modes: `>` commands only, `/` files, `@` settings, `=` calculator (inline result, Enter copies), `?` help topics, `#` tags.
- [ ] [P1] Commands can ask for arguments in the palette (e.g. "Change theme → pick theme" with live preview).
- [ ] [P2] Unit and currency-free conversion inline (`= 5 km in miles`, `= 0xff in dec`).

**2.8 Notification center and quick settings**

- [ ] [P1] Slide-out panel: notifications grouped by app, clear one/all, actions on notifications, "While you were away" section from the scheduler.
- [ ] [P1] Quick settings tiles: Do not disturb, theme light/dark, battery saver, sound mute, volume slider, focus session start, screenshot, lock.
- [ ] [P2] Media controls tile when something is playing.

**2.9 Context menus, dialogs, misc**

- [ ] [P1] One context menu system used everywhere: keyboard navigation, submenus, icons, shortcuts shown, disabled states, separators, checkable items, positioned within the viewport.
- [ ] [P1] System dialogs via `ctx.dialog`: alert, confirm, prompt, file open/save (using the VFS with a mini file browser), color picker, app picker.
- [ ] [P1] **Keyboard shortcut overlay:** hold `Mod+/` to see all shortcuts available right now.
- [ ] [P2] **Screenshot tool:** capture the screen via `getDisplayMedia` (with permission), select a region, save PNG to `Pictures/Screenshots`, copy to clipboard.
- [ ] [P2] **Screensaver** after idle time: a few canvas screensavers (starfield, pipes-like, clock bounce), disabled during media playback.
- [ ] [P3] Konami code easter egg.

**2.10 Mobile shell**

- [ ] [P1] Below ~768 px: one window at a time as a full-screen sheet, bottom app bar instead of dock, swipe up for the app switcher, swipe down from the top for notifications/quick settings, launcher as a full-screen grid.
- [ ] [P1] Touch: long-press = context menu, large hit targets, no hover-only features.

### Phase 3 — System apps — `specs/03-system-apps.md`

**3.1 File Explorer**

- [ ] [P1] Sidebar: favorites (Desktop, Documents, Downloads, Pictures, Music, Videos, Projects), Trash, tags, recent files; storage usage bar.
- [ ] [P1] Views: icons (with thumbnails for images), list, details (sortable columns: name, size, type, modified), and column view.
- [ ] [P1] Breadcrumb path bar (click to navigate, click empty space to type a path), back/forward/up, search within the current folder and below.
- [ ] [P1] Operations: new folder/file, rename (F2), copy/cut/paste, drag & drop (within Explorer, to the desktop, to other apps, from the real OS), delete to trash, restore, permanent delete with confirm, properties dialog (size, dates, type, tags, default app).
- [ ] [P1] Multi-select (Ctrl/Shift, box select), keyboard navigation (type-ahead), undo for the last operation.
- [ ] [P1] "Open with…", "Set default app", "Download", "Copy path", "Open terminal here".
- [ ] [P1] Preview pane: images, text/code (highlighted), Markdown (rendered), audio/video players, PDF (browser's built-in viewer if available).
- [ ] [P2] Tabs and split view (two folders side by side).
- [ ] [P2] Zip: compress selection, extract archive (if fflate is approved).
- [ ] [P2] Tags with colors, filter by tag.
- [ ] [P3] Batch rename with a pattern and preview.

**3.2 Terminal**

- [ ] [P1] Proper terminal UI: monospace, ANSI colors, prompt with user@nexus and current path, scrollback, selection and copy, paste, `Ctrl+C` to cancel, `Ctrl+L` clear, tabs (multiple sessions).
- [ ] [P1] History (up/down, `history`, `!n`, search with `Ctrl+R`), tab completion for commands, paths and app ids.
- [ ] [P1] Shell features: quoting, escaping, pipes `|`, redirection `>`, `>>`, `<`, `&&`, `||`, `;`, environment variables (`$HOME`, `export`), aliases, `~` expansion, glob `*` in paths.
- [ ] [P1] Built-in commands: `help`, `man <cmd>`, `ls` (`-la`), `cd`, `pwd`, `cat`, `less`, `head`, `tail`, `touch`, `mkdir -p`, `rm -r`, `mv`, `cp -r`, `find`, `grep` (regex, `-i -n -r`), `wc`, `sort`, `uniq`, `tree`, `echo`, `date`, `cal`, `clear`, `whoami`, `uptime`, `du`, `df`, `env`, `alias`, `history`, `open <app|file>`, `apps`, `kill <window>`, `theme <name>`, `wallpaper <file>`, `notify <text>`, `calc <expr>`, `nexusfetch` (system info with ASCII logo).
- [ ] [P1] Apps can register their own commands (e.g. `notes new "Title"`, `task add "Buy milk" --due tomorrow`, `play snake`).
- [ ] [P2] Scripts: run `.nsh` files from the VFS (line-by-line with variables, `if`, `for`), and `~/.nexusrc` on start.
- [ ] [P2] A small text editor inside the terminal (`edit file.txt`, nano-like).
- [ ] [P3] `cowsay`, `fortune`, `sl`, `matrix`, and similar fun commands.

**3.3 Nexus Edit (text editor)**

- [ ] [P1] Tabs, open/save from VFS, new file, "Save as", unsaved-changes indicator and protection on close.
- [ ] [P1] Syntax highlighting for common languages (via CodeMirror 6 if approved), line numbers, word wrap toggle, find/replace (regex), go to line, font size zoom.
- [ ] [P1] Status bar: line/column, encoding, language, line ending.
- [ ] [P2] Markdown preview side by side; minimap; multiple cursors.

**3.4 Settings**

- [ ] [P1] Sections: Personalization (theme, accent, wallpaper, fonts, transparency, animations, sounds), Desktop & Dock, Windows (snapping, tiling, animations), Notifications, Shortcuts (view/rebind all), Language & Region, Profiles & Lock, Storage, Apps (per-app settings rendered from manifests, default apps for file types), Privacy (what is stored, clear history), Accessibility, Backup & Restore, Updates, About.
- [ ] [P1] Settings search (finds individual settings, deep-links to them; also available from the command palette with `@`).
- [ ] [P1] **Storage page:** usage per app and per VFS folder, clear app data (with confirm), clear caches, quarantine list, persistent-storage status and request button.
- [ ] [P1] **Backup page:** export full backup (optional password), import with preview, automatic backup reminder (every N days).
- [ ] [P1] **About page:** version, edition (web/Lite), build date, changelog, licenses of all bundled libraries and fonts, live URL, download link for Nexus Lite, link to GitHub.
- [ ] [P1] **Accessibility page:** reduced motion, high contrast, font size, focus ring style, screen-reader hints, larger hit targets, disable sounds.

**3.5 System Monitor**

- [ ] [P1] Tabs: Processes (open windows/apps with memory estimate where possible, CPU-ish frame time, "End task"), Performance (FPS graph, frame time, JS heap where supported, number of DOM nodes, active animation loops and workers), Storage (per app), Log (system log with filters and export), Network (online/offline, request log of user-initiated requests like AI/HTTP client).

**3.6 App Center**

- [ ] [P1] Lists all built-in apps by category with icon, description, version, size estimate and permissions.
- [ ] [P1] "Uninstall" built-in apps = hide them everywhere (launcher, dock, search) and optionally delete their data; "Install" = show again.
- [ ] [P1] Per-app page: screenshots (taken by you during development and bundled), changelog, settings shortcut, "Clear data".
- [ ] [P2] Plugin section (filled in phase 13).

**3.7 Help**

- [ ] [P1] Help app that renders every app's `help.md` plus general docs (getting started, keyboard shortcuts, offline, backups, privacy, FAQ), with search and a table of contents.
- [ ] [P1] `F1` in any app opens Help for that app.

**3.8 Trash and recovery**

- [ ] [P1] Trash in Explorer with original paths, restore, empty, auto-empty after N days (setting).

### Phase 4 — Productivity core — `specs/04-productivity.md`

**4.1 Nexus Notes**

- [ ] [P1] Markdown editor (CodeMirror 6 if approved) with live preview; modes: edit, preview, split; synchronized scrolling.
- [ ] [P1] Formatting toolbar and shortcuts (bold, italic, headings, lists, checklists, code, quote, link, table, horizontal rule).
- [ ] [P1] Rendering: GitHub-flavored Markdown (tables, task lists, strikethrough, footnotes), syntax-highlighted code blocks, **math via KaTeX** (`$…$`, `$$…$$`), **Mermaid-like diagrams** only if a small library is approved, otherwise skip.
- [ ] [P1] Images: paste or drop images → stored in the VFS next to the note and embedded.
- [ ] [P1] Autosave with a configurable delay, "saved" indicator, conflict-safe if the note is open twice.
- [ ] [P1] Notes are `.md` files in `Documents/Notes` (so Explorer, Terminal and other apps can use them), with front-matter for tags, favorite, created/updated.
- [ ] [P1] Sidebar: folders (nested), tags, favorites, recent, trash; drag notes between folders.
- [ ] [P1] Full-text search with highlighted results and filters (tag, folder, date).
- [ ] [P1] Sort by title, created, updated; pin notes.
- [ ] [P1] **Wiki links** `[[Note title]]` with autocomplete, backlinks panel, and creating a note from a missing link.
- [ ] [P2] **Graph view** of note links (force-directed, on canvas), click to open.
- [ ] [P2] Daily notes (one note per day, template), note templates (meeting, lecture, project).
- [ ] [P2] Outline panel (headings), word/character count, reading time.
- [ ] [P2] Turn a checklist item into a task in Tasks (via intent), and show linked tasks.
- [ ] [P3] Focus/typewriter mode, version history view (from VFS versions).
- [ ] [P1] Optional encryption per note (master brief §7 rules): locked notes show a lock screen, content never stored unencrypted, auto-lock after N minutes.
- [ ] [P1] Import: `.md`, `.txt`, a folder of Markdown files. Export: single note as `.md`/`.html`/print-to-PDF, all notes as zip (if fflate approved) or a JSON bundle.

**4.2 Tasks**

- [ ] [P1] Projects (with color and icon), sections inside projects, an Inbox for unsorted tasks.
- [ ] [P1] Tasks: title, description (Markdown), subtasks (nested, with their own progress), priority (4 levels), due date and time, start date, tags, estimate, attachments (VFS files), links to notes.
- [ ] [P1] **Quick add** with natural language parsing in EN and DE: `Prepare presentation tomorrow 14:00 #uni !high` / `Präsentation vorbereiten morgen 14 Uhr #uni !hoch`. Show what was parsed before saving.
- [ ] [P1] Recurring tasks (using the scheduler's recurrence rules), reminders.
- [ ] [P1] Views: list (grouped by date/project/priority), **Kanban** (custom columns per project, drag & drop, WIP limits), **Today**, **Upcoming** (next 7 days), **Overdue**, and a calendar view.
- [ ] [P1] Filters and saved filters (e.g. "#uni and due this week and not done").
- [ ] [P1] Progress per project, completion animation and sound, undo complete.
- [ ] [P1] **Statistics:** completed per day/week (chart), streak, average completion time, overdue rate, time tracked per project.
- [ ] [P2] Time tracking per task (start/stop timer, linked with Focus sessions).
- [ ] [P2] Eisenhower matrix view (urgent/important).
- [ ] [P2] Dependencies (task B blocked by task A), shown on Kanban.
- [ ] [P3] Gantt/timeline view per project.

**4.3 Calendar**

- [ ] [P1] Views: day, week, month, year, agenda; mini-month navigator; "today" button; week start setting (Monday by default in DE).
- [ ] [P1] Events: title, location, description, all-day or timed, start/end with time zone, color/calendar, recurrence (full rules incl. exceptions: "edit this / this and following / all"), reminders (multiple per event).
- [ ] [P1] Multiple calendars (Personal, Uni, Work …) with colors and visibility toggles.
- [ ] [P1] Drag to create, drag to move, drag edges to resize events; keyboard creation.
- [ ] [P1] Tasks with due dates and timetable entries (phase 5) appear as overlays that can be toggled.
- [ ] [P1] **`.ics` import/export** (RFC 5545 subset: VEVENT, RRULE, EXDATE, VALARM), with unit tests.
- [ ] [P1] Public holidays for Germany (by state, including Hesse) computed locally (Easter-based holidays included), toggleable; other countries optional.
- [ ] [P2] Natural-language quick add ("Lunch with Max Friday 12:30").
- [ ] [P2] Search events; print/export week as PDF via print styles.
- [ ] [P3] Show week numbers, moon phases, and sunrise/sunset (computed locally from a configured location, no network).

**4.4 Focus**

- [ ] [P1] Pomodoro timer with configurable work/short break/long break lengths and rounds; big, beautiful timer UI (ring) and a compact mini-window/widget mode.
- [ ] [P1] Link a session to a task; time is logged on the task.
- [ ] [P1] Notifications and sounds at transitions (synthesized), optional auto-start of the next phase.
- [ ] [P1] **Distraction blocking:** user picks "distracting" apps (default: all games); during a work session they can't be opened (a blocking overlay with remaining time and an "I really need it" override that is logged).
- [ ] [P1] Do-not-disturb automatically during work sessions.
- [ ] [P1] **Ambient sounds generated with Web Audio:** rain, thunderstorm, white/pink/brown noise, café murmur, fireplace crackle, ocean waves, forest/birds (procedural), binaural tones; mix several with individual volumes; save mixes.
- [ ] [P1] Statistics: focus time per day/week (charts), sessions completed, longest streak, best time of day, per task/project.
- [ ] [P2] Goals (e.g. 4 hours/day) with progress on the widget.
- [ ] [P2] "Flow mode": a count-up timer instead of fixed Pomodoros.
- [ ] [P3] Session journaling: a short note after each session ("What did you get done?").

### Phase 5 — Study & Life tools — `specs/05-study-and-life.md`

**5.1 Timetable (Stundenplan)**

- [ ] [P1] Weekly grid of courses: name, type (lecture/tutorial/lab/seminar), lecturer, room, color, weekdays and times, weekly or biweekly (A/B weeks), start/end date.
- [ ] [P1] Semesters: lecture period, lecture-free period, holidays; switch between semesters, archive old ones.
- [ ] [P1] "Now and next" view and a desktop widget ("Next: Algorithms & Data Structures, 10:15, Room C 213").
- [ ] [P1] Entries appear in the Calendar (as a read-only calendar layer).
- [ ] [P1] Each course links to a notes folder, a task project and a flashcard deck (created on demand).
- [ ] [P2] Attendance tracking per session; cancellation/room change marks.
- [ ] [P2] Import/export as `.ics` and as JSON to share with classmates.

**5.2 Grade tracker (Notenrechner)**

- [ ] [P1] Modules with ECTS/credit points, grade, attempt number, semester, status (planned, in progress, passed, failed), and whether the grade counts towards the final grade.
- [ ] [P1] German scale (1.0–5.0, with 0.3/0.7 steps; 4.0 = pass) with **ECTS-weighted average**, and alternative scales (percentages, US GPA, UK classes, Swiss 6–1, Austrian 1–5) selectable per profile.
- [ ] [P1] Dashboard: current weighted average, ECTS earned vs. required (e.g. 180 for a Bachelor), progress per semester (chart), best/worst modules.
- [ ] [P1] **What-if calculator:** "What average do I need in my remaining modules to reach 2.0?" and "What happens if I get a 1.7 in this module?"
- [ ] [P2] Exam attempts history and retake planning; final grade prediction range.
- [ ] [P2] Partial grades within a module (e.g. 40 % exam, 30 % project, 30 % homework) with automatic module grade.

**5.3 Flashcards**

- [ ] [P1] Decks and subdecks, cards with front/back in Markdown, **math (KaTeX)**, code blocks, images.
- [ ] [P1] Card types: basic, basic + reversed, **cloze deletion** (`{{c1::text}}`), type-the-answer.
- [ ] [P1] Spaced repetition with **FSRS** (or SM-2 as a first step; document which), daily new-card and review limits, learning steps, ease buttons, keyboard-only review (1–4, Space).
- [ ] [P1] Study session UI: progress, remaining counts, undo last answer, flip animation.
- [ ] [P1] Statistics: reviews per day, retention, forecast of upcoming reviews (chart), heatmap calendar, hardest cards.
- [ ] [P1] Import CSV/TSV (column mapping), export CSV and JSON.
- [ ] [P2] Create cards from a selected text in Notes (intent), and from AI in phase 12.
- [ ] [P2] Cram mode (review everything regardless of schedule) and custom study by tag.
- [ ] [P3] Anki `.apkg` import (sql.js needed; only if already approved for phase 8).

**5.4 Exam planner**

- [ ] [P1] Exams with date, module, room, type, and topics checklist; countdown cards ("12 days until Theoretical CS").
- [ ] [P1] Generate a study plan: distribute topics over the remaining days into Tasks, respecting other exams.
- [ ] [P2] Readiness score per exam from checklist progress + flashcard retention for the linked deck.

**5.5 Habits**

- [ ] [P1] Habits: daily, specific weekdays, or N times per week; yes/no or count (e.g. 8 glasses of water) or duration.
- [ ] [P1] Check-in from the app, from a widget, from the command palette, and from the terminal (`habit done reading`).
- [ ] [P1] Streaks, best streak, completion rate, a GitHub-style yearly heatmap per habit.
- [ ] [P2] Reminders via the scheduler; skip days without breaking streaks (rest days).

**5.6 Journal**

- [ ] [P1] One entry per day (more allowed), rich Markdown, mood (5-point scale with icons), tags, photos from VFS.
- [ ] [P1] Calendar view of entries and mood, "On this day" (entries from previous years), search.
- [ ] [P1] Optional encryption of the whole journal with its own password and auto-lock.
- [ ] [P2] Writing prompts (bundled list, EN/DE), mood chart over time, word count stats.

**5.7 Budget**

- [ ] [P1] Accounts (e.g. cash, bank), transactions (income/expense/transfer) with category, date, note, tags; recurring transactions (rent, subscriptions).
- [ ] [P1] Monthly budgets per category with progress bars and warnings.
- [ ] [P1] Reports: spending by category (donut), over time (bars), income vs. expenses, monthly balance.
- [ ] [P1] CSV import with column mapping (to import bank exports), CSV export.
- [ ] [P1] Currency formatting via `Intl` (EUR default for DE locale).
- [ ] [P2] Savings goals with progress; subscription overview (total per month/year).
- [ ] [P2] Split expenses with friends (simple "who owes whom" calculator).

**5.8 Calculator**

- [ ] [P1] **Standard** and **scientific** modes (trig in deg/rad, logs, powers, roots, factorial, constants, memory, parentheses, history tape).
- [ ] [P1] **Programmer mode:** bin/oct/dec/hex side by side, word size (8/16/32/64-bit), signed/unsigned, bitwise AND/OR/XOR/NOT/shifts/rotates, clickable bit grid.
- [ ] [P1] An expression parser written by us (no `eval`), with unit tests; shared with the command palette's `=` mode.
- [ ] [P2] **Graphing mode:** plot multiple functions, zoom/pan, trace values, find roots/intersections numerically.
- [ ] [P2] Equation solver (linear systems, quadratic), matrix mode (add, multiply, determinant, inverse, transpose).
- [ ] [P3] Statistics mode (mean, median, standard deviation, regression from a data list).

**5.9 Unit converter**

- [ ] [P1] Length, area, volume, mass, temperature, time, speed, pressure, energy, power, angle, **data size (SI and IEC: kB vs KiB)**, data rate, frequency, fuel economy, cooking units.
- [ ] [P1] Two-way live conversion, favorites, recent conversions.
- [ ] [P2] Number bases and Roman numerals; shoe/clothing sizes.

**5.10 Clock**

- [ ] [P1] World clock (cities with time zones from `Intl`), analog + digital.
- [ ] [P1] Alarms (via the scheduler, honest about closed tabs), timers (multiple at once, named), stopwatch with laps and export.
- [ ] [P2] Time-zone planner ("find a meeting time across these 3 cities").

**5.11 Password generator and vault**

- [ ] [P1] Generator: length, character sets, exclude similar characters, passphrases from a bundled word list (EN and DE), strength estimate (entropy), copy with auto-clear of the clipboard after 30 s.
- [ ] [P1] Vault: entries (title, username, password, URL, notes, TOTP secret), encrypted with a master password (master brief §7), auto-lock after inactivity, search, categories.
- [ ] [P1] **TOTP code generator** (RFC 6238) with countdown, unit-tested against RFC test vectors.
- [ ] [P1] Clear statement in the UI: this vault lives only in this browser; back it up.
- [ ] [P2] Password health check (reused, weak, old passwords) — fully local.
- [ ] [P2] Import/export CSV (with a strong warning about unencrypted exports).

**5.12 Bookmarks and reading list**

- [ ] [P1] Bookmark collections with title, URL, tags, notes, favicon fallback (letter avatar, no network fetch); open in a new browser tab.
- [ ] [P1] Import/export browser bookmarks HTML format.
- [ ] [P2] Reading list with read/unread state.

**5.13 Clipboard manager**

- [ ] [P1] History of everything copied inside Nexus (via the clipboard service), search, pin entries, paste with one click, clear history, exclude password fields/vault.
- [ ] [P2] Snippets with variables (date, clipboard) and a shortcut to insert them.

### Phase 6 — Office & Creative — `specs/06-office-and-creative.md`

**6.1 Nexus Sheets (spreadsheet)**

- [ ] [P1] Grid with virtual scrolling (handles 10,000 × 100 cells smoothly), column/row headers, resize columns/rows, freeze rows/columns, multiple sheets (tabs).
- [ ] [P1] Selection (cells, ranges, whole rows/columns, keyboard extension with Shift+arrows), copy/paste (also to/from real spreadsheets as TSV), fill handle (drag to fill series and formulas).
- [ ] [P1] **Formula engine written by us:** cell references (A1, $A$1, ranges, cross-sheet refs), operators, dependency graph with incremental recalculation, circular reference detection, error values (`#DIV/0!`, `#REF!`, `#NAME?`, `#VALUE!`).
- [ ] [P1] Functions (at least): SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTIF, SUMIF, IF, IFS, AND, OR, NOT, ROUND, ABS, SQRT, POWER, MOD, CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TODAY, NOW, DATE, YEAR, MONTH, DAY, VLOOKUP, XLOOKUP, INDEX, MATCH, AVERAGEIF, STDEV, MEDIAN, RAND, RANDBETWEEN. Each one unit-tested.
- [ ] [P1] Formatting: number formats (number, currency, percent, date, custom decimals), bold/italic, text and fill color, alignment, borders, wrap.
- [ ] [P1] Sort and filter ranges; find & replace.
- [ ] [P1] File format: `.nsheet` (JSON) in the VFS; import/export CSV and TSV.
- [ ] [P2] Charts from a selected range (line, bar, pie, scatter) placed on the sheet.
- [ ] [P2] Conditional formatting (color scales, rules), data validation (dropdown lists).
- [ ] [P2] Undo/redo history with at least 100 steps.
- [ ] [P3] `.xlsx` import/export (only with an approved library).

**6.2 Nexus Write (documents)**

- [ ] [P1] Rich text editor: headings, bold/italic/underline/strike, lists, checklists, quotes, code blocks, links, tables, images, horizontal rules, text color and highlight.
- [ ] [P1] Page view with margins and paper sizes (A4/Letter), print styles so "Print → Save as PDF" gives a clean document.
- [ ] [P1] Document outline, word/character count, reading time.
- [ ] [P1] Save as `.ndoc` (structured JSON) in the VFS; export HTML, Markdown and plain text; import Markdown and HTML.
- [ ] [P2] Find & replace, spell check via the browser's built-in spell checker, footnotes, table of contents generation.
- [ ] [P2] Document templates (letter in DIN 5008 layout, CV, report, lab report).
- [ ] [P3] Comments and suggestion mode.

**6.3 Whiteboard**

- [ ] [P1] Infinite canvas with smooth pan/zoom (mouse, trackpad, pinch).
- [ ] [P1] Tools: select/move, pen (pressure-sensitive on supported devices), highlighter, eraser, rectangle, ellipse, line, arrow (with connectors that stay attached to shapes), text, sticky notes, image.
- [ ] [P1] Styling: stroke color/width, fill, opacity, font size; group/ungroup; layering (bring to front/back); alignment and distribution guides; snap to grid.
- [ ] [P1] Undo/redo, copy/paste, duplicate, keyboard shortcuts for tools.
- [ ] [P1] Save as `.nboard` in VFS; export PNG and SVG (selection or everything).
- [ ] [P2] Hand-drawn style option (sketchy rendering), templates (flowchart, retro, SWOT, Kanban).
- [ ] [P2] Presentation mode: frames as slides.
- [ ] [P3] Shape recognition (rough circle → perfect circle).

**6.4 Mind Map**

- [ ] [P1] Central topic, child nodes, keyboard-first editing (Tab = child, Enter = sibling, Delete, arrows to navigate), drag to rearrange, collapse/expand.
- [ ] [P1] Automatic layouts (radial, right-tree, org chart), node colors, icons, notes per node.
- [ ] [P1] Save to VFS; export PNG/SVG and as Markdown outline; import from Markdown outline.
- [ ] [P2] Turn a branch into tasks or into a note.

**6.5 Paint**

- [ ] [P1] Canvas with layers (add, delete, reorder, hide, opacity, blend modes), brushes (round, soft, pencil, spray), eraser, fill bucket (tolerance), shapes, text, eyedropper, selection (rectangle, lasso) with move/copy.
- [ ] [P1] Color picker with recent colors, palettes from Color Lab.
- [ ] [P1] Image adjustments: brightness/contrast, hue/saturation, invert, grayscale, blur (in a worker for large images).
- [ ] [P1] Undo/redo, zoom/pan, canvas resize/crop, open images from VFS, save as PNG/JPEG/WebP and as `.npaint` (layers kept).
- [ ] [P2] Pressure sensitivity, symmetry mode, custom brushes.

**6.6 Pixel Art Studio**

- [ ] [P1] Grid editor with configurable size (8×8 to 256×256), pencil, eraser, fill, line, rectangle, circle, mirror drawing, color palettes (preset retro palettes + custom).
- [ ] [P1] **Animation frames** with onion skinning, frame duration, playback preview.
- [ ] [P1] Export PNG (scaled), sprite sheet, and **animated GIF** (write a small GIF encoder or ask for a library).
- [ ] [P2] Use sprites in the Code Playground or as a custom cursor/wallpaper/avatar via intents.

**6.7 Nexus Present (slides)**

- [ ] [P2] Slides written in Markdown (`---` separates slides), themes matching the OS themes, code highlighting, math, images.
- [ ] [P2] Presenter mode in a second window (notes, timer, next slide), full-screen presentation, keyboard/clicker navigation.
- [ ] [P2] Export to a standalone HTML file and to PDF via print.

**6.8 Document scanner / PDF tools**

- [ ] [P3] Combine images to a PDF, view PDFs (browser viewer), only if a small approved library makes it feasible. Otherwise skip and record the cut.

### Phase 7 — Developer Toolkit — `specs/07-dev-tools.md`

**7.1 Code Playground**

- [ ] [P1] HTML, CSS and JavaScript editors (CodeMirror 6 if approved) with highlighting, autocomplete, bracket matching, Emmet-style HTML abbreviations if cheap, formatting (Prettier only if approved; otherwise a basic formatter).
- [ ] [P1] Live preview in a **sandboxed iframe** (`sandbox="allow-scripts"`, no same-origin), auto-refresh with debounce or manual run (`Mod+Enter`).
- [ ] [P1] Console panel that captures `console.log/warn/error/table`, uncaught errors with line numbers, and lets the user run expressions in the preview context.
- [ ] [P1] Layouts: side-by-side, stacked, preview-only, editor-only; resizable panes.
- [ ] [P1] Projects saved in the VFS (`Projects/<name>/index.html, style.css, script.js`); a project list with thumbnails.
- [ ] [P1] Templates: blank, canvas game loop, CSS animation, fetch + JSON demo, Web Component, p5-like drawing helper (our own tiny one).
- [ ] [P1] Export a project as a single HTML file; import a single HTML file (splitting into the three editors).
- [ ] [P2] Additional library selection from **bundled** libraries only (no CDN), clearly listed.
- [ ] [P2] Share as a URL (project compressed into the URL hash) — works offline for opening.

**7.2 Nexus Code (multi-file editor)**

- [ ] [P1] A VS Code-like layout: file tree of a VFS folder, tabs, editor, status bar, command palette integration.
- [ ] [P1] Search across files (with regex), go to file (`Mod+P`), go to line, multi-cursor, split editors.
- [ ] [P1] Run web projects: an `index.html` in the folder is previewed in a sandboxed iframe with the other files served from the VFS (using a Service Worker route or blob URLs; document the approach).
- [ ] [P2] Markdown preview, image preview, a built-in terminal panel (the Nexus Terminal) docked at the bottom.
- [ ] [P2] Git-like local history: snapshots of the project folder with diff view (using the Diff Viewer component).
- [ ] [P3] Run JavaScript files in a Worker with captured console ("node-lite").

**7.3 JSON Toolkit**

- [ ] [P1] Format (indent options), minify, validate with exact error position and message, sort keys, escape/unescape.
- [ ] [P1] Tree view with collapse/expand, path copy (`data.items[3].name`), search.
- [ ] [P1] Convert: JSON ↔ CSV, JSON ↔ YAML (with an approved library or our own simple YAML subset — document limits), JSON → TypeScript types / JSDoc typedefs.
- [ ] [P2] JSONPath queries; JSON Schema validation (with an approved library).
- [ ] [P2] JSON diff (structural, using the Diff Viewer).

**7.4 Encoding & Crypto tools**

- [ ] [P1] Base64 (text and file, URL-safe variant), Base32, hex, binary, URL encode/decode (component and full), HTML entities, Unicode escapes (`ä`), punycode.
- [ ] [P1] Hashes: MD5 (own implementation, tested), SHA-1, SHA-256, SHA-384, SHA-512 (SubtleCrypto), CRC32; for text and files; compare against an expected hash.
- [ ] [P1] HMAC (SHA-256/512) with key.
- [ ] [P2] AES-GCM encrypt/decrypt text with a password (educational, using the same crypto helpers as the OS).
- [ ] [P2] RSA/ECDSA key pair generation and export (PEM/JWK) via SubtleCrypto.

**7.5 Regex Tester**

- [ ] [P1] Pattern input with flags (g, i, m, s, u, y, d), test text with live **match highlighting**, groups (numbered and named) in a table, match count, error messages.
- [ ] [P1] Replace mode with live preview, including `$1`/`$<name>` references.
- [ ] [P1] Cheat sheet panel and a library of common patterns (email, URL, IPv4/6, dates, German postal codes, IBAN format).
- [ ] [P1] Runs matching in a Worker with a timeout, so catastrophic backtracking can't freeze the OS.
- [ ] [P2] Regex explanation in plain English/German (token-by-token breakdown).
- [ ] [P2] Unit test mode: list of strings that should / should not match.

**7.6 Diff Viewer**

- [ ] [P1] Text diff side-by-side and inline, line and word level, ignore whitespace/case options, jump between changes.
- [ ] [P1] Compare two VFS files, or pasted text.
- [ ] [P2] Three-way view; export as unified diff (`.patch`).

**7.7 Color Laboratory**

- [ ] [P1] Conversion between HEX, RGB(A), HSL(A), HSV, CMYK, **OKLCH** and CSS named colors; picker with color wheel and sliders; EyeDropper API where supported.
- [ ] [P1] Palette generator: complementary, analogous, triadic, tetradic, monochromatic, shades/tints; random harmonious palettes; lock colors and regenerate others.
- [ ] [P1] **Contrast checker** (WCAG 2.x AA/AAA for normal and large text; APCA as P2).
- [ ] [P1] Save palettes; export as CSS variables, JSON, SCSS; "Use as OS accent" and "Create theme from palette" (feeds phase 13 theme editor).
- [ ] [P2] Color blindness simulation; gradient generator (linear, radial, conic) with CSS output.
- [ ] [P2] Extract a palette from an image in the VFS (k-means in a worker).

**7.8 Small dev tools**

- [ ] **JWT decoder:** header/payload pretty-printed, expiry shown as a date with "expired" badge, signature verification for HS256 with a secret (P2: RS256 with a public key).
- [ ] **UUID / ULID / nanoid generator:** bulk generation, versions v4 and v7, copy all.
- [ ] **Timestamp converter:** Unix seconds/milliseconds ↔ ISO 8601 ↔ local time ↔ relative time, time zones.
- [ ] **Number base converter:** any base 2–36, two's complement view, byte order.
- [ ] **Cron expression tool:** explain an expression in plain EN/DE, show the next 10 run times, builder UI.
- [ ] **Text tools:** case conversion (camel, snake, kebab, title …), slugify, sort/dedupe/reverse lines, count characters/words/lines/bytes, trim, find & replace, lorem ipsum generator (for user use only).
- [ ] **Markdown table generator:** editable grid → Markdown/HTML/CSV.
- [ ] **CSS generators:** box-shadow, border-radius, gradient, clip-path, cubic-bezier easing editor with preview, flexbox and grid playgrounds.
- [ ] **SVG viewer & optimizer:** preview, basic optimization (remove metadata/comments, round numbers), convert to data URI and PNG.
- [ ] **QR code generator** (approved library or own implementation) and reader via camera (P2, BarcodeDetector API where supported).
- [ ] **Fake data generator** (P2): names (EN/DE), emails, addresses, dates, numbers → JSON/CSV with a schema.
- [ ] **HTTP status code / MIME type / keyboard key code reference** (P2).

**7.9 HTTP Client**

- [ ] [P1] Request builder: method, URL, query params table, headers table, body (JSON, form, raw text), auth helpers (Bearer, Basic).
- [ ] [P1] Response viewer: status, time, size, headers, body pretty-printed (JSON tree, HTML preview, image preview).
- [ ] [P1] Collections of saved requests, environments with variables (`{{baseUrl}}`), request history.
- [ ] [P1] Clear explanation when a request fails because of CORS or being offline (not a fake error).
- [ ] [P2] Import/export collections as JSON; generate code snippets (fetch, curl).

**7.10 Snippet Manager**

- [ ] [P1] Snippets with title, language, tags, description, code (highlighted); folders; search; favorites.
- [ ] [P1] Copy with one click, insert into Code Playground / Nexus Code via intents, available in the command palette.
- [ ] [P2] Import/export as JSON or a folder of files.

### Phase 8 — CS Lab (computer science learning tools) — `specs/08-cs-lab.md`

**8.0 Shared visualizer engine**

- [ ] [P1] One reusable "step engine": algorithms are written as generators that `yield` steps (compare, swap, visit, highlight …); the UI provides play/pause, step forward/back, speed slider, restart, and shows counters (comparisons, swaps, visited nodes).
- [ ] [P1] A pseudocode panel that highlights the current line, in English and German.
- [ ] [P1] Every tool can save/load its state to the VFS and export the current view as PNG/SVG.

**8.1 Sorting visualizer**

- [ ] [P1] Algorithms: bubble, selection, insertion, shell, merge, quick (Lomuto and Hoare, pivot choices), heap, counting, radix (LSD), bucket.
- [ ] [P1] Inputs: random, sorted, reversed, nearly sorted, few unique values, custom list; size 5–500.
- [ ] [P1] Views: bars, dots, color wheel; synthesized sound per comparison (toggleable).
- [ ] [P1] Side-by-side race of 2–4 algorithms on the same input.
- [ ] [P2] Complexity panel: best/average/worst time, space, stable or not, in-place or not.

**8.2 Pathfinding and maze lab**

- [ ] [P1] Grid editor: walls, weights (e.g. mud = 5), start/goal, diagonal on/off.
- [ ] [P1] Algorithms: BFS, DFS, Dijkstra, A* (Manhattan/Euclidean/Chebyshev heuristics), Greedy best-first, bidirectional BFS.
- [ ] [P1] Maze generators: recursive backtracker, Prim, Kruskal, recursive division.
- [ ] [P1] Stats: nodes visited, path length, path cost, time.

**8.3 Graph editor & algorithms**

- [ ] [P1] Draw graphs: add/move/delete nodes and edges, directed/undirected, weighted, labels; auto-layout (force-directed, circular, grid).
- [ ] [P1] Algorithms with step mode: BFS, DFS (with discovery/finish times), Dijkstra, Bellman-Ford (with negative-cycle detection), Floyd-Warshall (distance matrix), Prim, Kruskal (with union-find shown), topological sort, strongly connected components (Tarjan/Kosaraju), bipartite check, cycle detection.
- [ ] [P2] Max flow (Edmonds-Karp) with residual graph; Euler path; graph coloring (greedy).
- [ ] [P1] Import/export as adjacency list/matrix, edge list, and DOT; preset example graphs.

**8.4 Data structures visualizer**

- [ ] [P1] Array/dynamic array (with resizing), stack, queue, circular buffer, singly/doubly linked list, binary search tree, **AVL tree** (rotations animated), **binary heap** (array + tree view), hash table (chaining and open addressing with linear/quadratic probing, load factor and rehash), trie.
- [ ] [P1] Operations via buttons and a mini command line (`insert 5`, `delete 3`, `search 7`), each animated with explanations.
- [ ] [P2] Red-black tree, B-tree (order configurable), skip list, union-find, segment tree.

**8.5 Automata lab**

- [ ] [P1] Editor for **DFA and NFA (with ε)**: states, start, accepting, transitions; validation (e.g. DFA completeness).
- [ ] [P1] Simulate a word step by step (with all active states for NFAs), batch test many words.
- [ ] [P1] Conversions: NFA → DFA (subset construction, step-by-step), DFA minimization (table-filling or Hopcroft), regex → ε-NFA (Thompson), DFA → regex (state elimination, P2).
- [ ] [P1] Set operations: complement, union, intersection, product construction.
- [ ] [P2] Pushdown automata simulator; context-free grammar tools (CYK algorithm, first/follow sets, remove left recursion).
- [ ] [P2] Equivalence check of two automata with a counterexample word.

**8.6 Turing machine simulator**

- [ ] [P1] Single-tape TM editor (state table and diagram views), tape visualization with head movement, step/run/speed, step counter, halting detection with a step limit.
- [ ] [P1] Example machines: binary increment, palindrome check, unary addition, copy, busy beaver (2–4 states).
- [ ] [P2] Multi-tape machines.

**8.7 Logic circuit simulator**

- [ ] [P1] Canvas editor: inputs (switches, clock), outputs (LEDs, 7-segment display), gates (AND, OR, NOT, NAND, NOR, XOR, XNOR, buffer), wires with routing and junctions.
- [ ] [P1] Real-time simulation with signal colors; truth table generation for the whole circuit.
- [ ] [P1] Presets: half adder, full adder, 4-bit ripple-carry adder, multiplexer, decoder, SR latch, D flip-flop.
- [ ] [P2] Custom components (save a circuit as a reusable block with pins); JK/T flip-flops, counters, registers.
- [ ] [P2] Timing diagram view.

**8.8 Boolean algebra tool**

- [ ] [P1] Parse expressions (`(A ∧ B) ∨ ¬C`, also `A&B|!C` and `AB + C'`), generate truth tables, check equivalence of two expressions, tautology/contradiction check.
- [ ] [P1] **KV maps (Karnaugh)** for 2–4 variables (P2: 5–6) with interactive grouping and suggested optimal groups.
- [ ] [P1] Minimization with Quine-McCluskey (prime implicant table shown), output as DNF and CNF.
- [ ] [P2] Convert expressions to NAND-only/NOR-only and open the result in the circuit simulator.

**8.9 Number representation lab**

- [ ] [P1] Integer formats: unsigned, sign-magnitude, one's complement, **two's complement**, with bit width 4–64; overflow demonstration in addition/subtraction.
- [ ] [P1] **IEEE 754 inspector** (half, single, double): sign/exponent/mantissa bits clickable, special values (±0, ±∞, NaN, subnormals), decimal ↔ float with rounding error shown, "why is 0.1 + 0.2 ≠ 0.3".
- [ ] [P1] Base conversions with the step-by-step division/multiplication method shown (exam style).
- [ ] [P2] Fixed-point formats, BCD, Gray code, Hamming code (encode, flip a bit, detect/correct), parity, CRC step-by-step.
- [ ] [P2] Character encodings: ASCII table, UTF-8/UTF-16 byte breakdown of any text.

**8.10 SQL playground**

- [ ] [P1] SQLite in the browser via **sql.js (WASM, lazy-loaded and cached for offline; needs approval)**.
- [ ] [P1] Editor with highlighting and autocomplete of table/column names, run query (`Mod+Enter`), results table, error messages, query history.
- [ ] [P1] Schema browser; sample databases (university: students, courses, enrollments, professors; shop; movies) created from bundled SQL scripts.
- [ ] [P1] Databases saved in the VFS (`.sqlite`), import/export `.sqlite` and `.sql`.
- [ ] [P2] ER diagram generated from the schema; query plan (`EXPLAIN QUERY PLAN`) view.
- [ ] [P2] Relational algebra → SQL translator for simple expressions (σ, π, ⋈, ∪, −).

**8.11 Toy CPU / assembly simulator**

- [ ] [P2] "Nexus-8": a small 8-bit CPU with a documented instruction set (load/store, ALU ops, jumps, stack, I/O), an assembler with error messages, memory and register view, step execution, breakpoints, a memory-mapped pixel display and keyboard input.
- [ ] [P2] Example programs (counter, Fibonacci, bubble sort, a tiny Snake).
- [ ] [P3] A MIPS or RISC-V subset mode for university courses.

**8.12 Other CS tools**

- [ ] [P2] **Big-O playground:** plot growth functions (1, log n, n, n log n, n², 2ⁿ, n!) and compare with measured run times of real JS implementations run in a worker.
- [ ] [P2] **Scheduling simulator (OS course):** FCFS, SJF, SRTF, Round Robin, priority; Gantt chart, waiting/turnaround times.
- [ ] [P2] **Page replacement simulator:** FIFO, LRU, Optimal, Clock; page fault count.
- [ ] [P3] **Python playground** via Pyodide (large: lazy-loaded, cached on first use, with a size warning; needs approval).
- [ ] [P3] **Network lab:** subnet calculator (IPv4/IPv6, CIDR), packet encapsulation visualizer.

### Phase 9 — Game engine & Arcade — `specs/09-game-engine-and-arcade.md`

**9.1 Game engine (`src/games/engine/`)**

- [ ] [P1] **Loop:** fixed-timestep update (e.g. 60 Hz) with interpolated rendering, pause/resume, time scaling (slow motion), automatic pause when the window loses focus, is minimized, or the tab is hidden.
- [ ] [P1] **Rendering:** Canvas 2D with high-DPI scaling, letterboxing for fixed-resolution games, a camera (position, zoom, shake), sprite drawing from generated or bundled sprites, text rendering with the OS fonts.
- [ ] [P1] **Input:** keyboard, mouse, **touch** (virtual joystick/buttons, swipe gestures), **Gamepad API** (standard mapping, rumble where supported), rebindable controls stored per game; an input abstraction ("actions" like `left`, `jump`, `fire`).
- [ ] [P1] **Scenes/states:** title, playing, paused, game over, with transitions.
- [ ] [P1] **Helpers:** vector math, collision (AABB, circle, SAT for polygons), tweening/easing, timers, object pools, particle system, seeded random (for daily challenges and replays).
- [ ] [P1] **Audio:** synthesized sound effects (jsfxr-like generator written by us: jump, coin, explosion, hit, power-up), chiptune music player for simple pattern-based songs, volume per channel.
- [ ] [P1] **Common UI:** pause menu (resume, restart, settings, controls, quit), game-over screen with score and new-record celebration, settings (sound, music, difficulty, controls, colorblind palette).
- [ ] [P1] **Services:** high scores (local leaderboard per mode/difficulty, top 10 with name and date), statistics per game, achievements (via the OS achievement service), XP awarded after each game.
- [ ] [P2] **Replays:** record inputs + seed, play back deterministic replays, share as a file.
- [ ] [P2] **Daily challenge:** a seed based on the date gives everyone the same level/board each day; separate leaderboard and streak.

**9.2 Arcade hub**

- [ ] [P1] Library of all games with cover art (generated in-game screenshots or vector art), genre, best score, play time, achievements progress.
- [ ] [P1] Player profile: level and XP bar, total play time, achievements gallery (locked/unlocked/secret), recent games.
- [ ] [P1] Filters (genre, multiplayer, controller support), favorites, "continue" for games with saved state.
- [ ] [P1] Gamepad navigation of the entire hub.
- [ ] [P2] Daily challenges page with streaks.
- [ ] [P2] "Arcade cabinet" mode: full-screen hub for TV/gamepad use.

**9.3 Snake Evolution**

- [ ] [P1] Smooth interpolated movement (not tile-jumping), responsive input buffering (queue turns so fast inputs aren't lost).
- [ ] [P1] Maps: classic open, walls, maze, portals, moving obstacles, wrap-around (at least 6).
- [ ] [P1] Difficulties (speed curves), modes: classic, time attack, survival, zen (no death).
- [ ] [P1] Power-ups: speed boost, slow-mo, ghost (pass through self), shrink, magnet, double points, shield.
- [ ] [P1] Achievements (e.g. length 50, no power-ups run, all maps), high scores per map/mode.
- [ ] [P2] Local 2-player (same keyboard or two gamepads); AI snakes in a battle mode.

**9.4 Breakout**

- [ ] [P1] Ball physics with angle control depending on where the ball hits the paddle, speed increase, no tunneling at high speed (continuous collision).
- [ ] [P1] Block types: normal, multi-hit (shows damage), unbreakable, explosive (chain reactions), moving, power-up carriers.
- [ ] [P1] Power-ups: wide/narrow paddle, multi-ball, laser, sticky paddle, slow ball, extra life, fireball.
- [ ] [P1] At least 30 handcrafted levels in level packs, progression, lives, score multipliers.
- [ ] [P1] **Level editor**: place blocks on the grid, test play, save to VFS, share as a file.
- [ ] [P2] Boss levels; endless random level mode.

**9.5 Memory Master**

- [ ] [P1] Grid sizes (4×4 up to 8×8), themes for card faces (icons from the OS icon set, colors, numbers, emoji, CS terms), flip animation.
- [ ] [P1] Timer, move counter, score with combo bonus, star rating.
- [ ] [P1] Statistics: best times per size, average moves, games played.
- [ ] [P2] Modes: classic, time attack, "triple" (match three), local 2-player alternating turns.

**9.6 2048**

- [ ] [P1] Correct merge rules (unit-tested: each tile merges once per move, direction order), smooth slide/merge/spawn animations, swipe and keyboard controls.
- [ ] [P1] Undo (configurable number of steps), board sizes 3×3 to 8×8, continue after 2048.
- [ ] [P1] High scores per board size, best tile statistics.
- [ ] [P2] Variants: Fibonacci tiles, 3-in-a-row merges; a hint/AI solver (expectimax in a worker) that can suggest moves.

**9.7 Reaction Trainer**

- [ ] [P1] Classic test: wait for green, click; detect false starts; average of 5 with min/max.
- [ ] [P1] More tests: aim trainer (targets of varying size), sequence memory, number memory, visual memory grid, typing reaction, choice reaction (press the correct key for the color).
- [ ] [P1] History graphs per test, personal records, percentile against bundled typical-human reference data.

### Phase 10 — More games — `specs/10-more-games.md`

**Tier 1 [P1]**

- [ ] **Blockfall** (falling-blocks puzzle): 7 standard piece shapes, rotation system with wall kicks, hold piece, next queue (5), ghost piece, hard/soft drop, lock delay, line-clear animations, levels and speed curve, T-spin-style bonus moves, modes: marathon, sprint (40 lines), ultra (2 minutes), zen.
- [ ] **Minesweeper:** beginner/intermediate/expert/custom, first click always safe (and opens an area), chording, flags and question marks, timer, no-guess board generator option (P2).
- [ ] **Void Drifter** (asteroids-style): vector graphics with glow, inertia flight, splitting asteroids, UFO enemies, waves, hyperspace with risk, power-ups (shield, triple shot, rapid fire), particles and screen shake.
- [ ] **Sudoku:** generator with unique solutions at 5 difficulty levels (rated by required techniques), pencil marks, auto-notes, highlight same numbers, mistakes check (optional), hints that explain the technique (naked single, hidden single, pairs …), timer, daily puzzle.
- [ ] **Typing Trainer:** WPM/accuracy/consistency, lessons for touch typing (QWERTY and QWERTZ layouts with an on-screen keyboard and finger hints), modes: words, quotes (bundled, public-domain or own), **code typing** (snippets in JS/Python/Java/C), German text mode with umlauts, error heatmap per key, progress graphs.
- [ ] **Neon Pong:** vs AI (3 difficulties), local 2-player, ball spin, power-ups mode, first to 11.

**Tier 2 [P2]**

- [ ] **Solitaire collection:** Klondike (draw 1/3), Spider (1/2/4 suits), FreeCell; drag & drop and click-to-move, auto-complete, undo, solvable-deal option, statistics.
- [ ] **Nexus Chess:** full rules (castling, en passant, promotion, draw by repetition/50 moves/stalemate/insufficient material), legal move highlighting, AI in a Web Worker (alpha-beta with iterative deepening, piece-square tables, several strength levels), local 2-player, PGN import/export, move list with navigation, board flip, puzzle mode with bundled puzzles (generated or public domain), analysis arrows.
- [ ] **Connect Four:** vs AI (minimax, difficulty levels), local 2-player, win highlighting.
- [ ] **Grid Invaders** (fixed-shooter): waves, shields, diving enemies, boss waves, power-ups.
- [ ] **Neon Glide** (one-button flyer): procedurally generated obstacles, ghost of your best run.
- [ ] **Nonogram:** puzzles from bundled packs (5×5 to 25×25) and generated ones, line-check helper, X marks.
- [ ] **Block Pusher** (sokoban-style): 60+ levels (generated with a solver to verify they're solvable, or self-made), undo, move counter, level editor.
- [ ] **Hexword** (word-guessing game): 5-letter words in EN and DE with **self-curated, license-clean word lists**, hard mode, statistics, share result as emoji grid (copy to clipboard), daily word by seed.
- [ ] **Checkers / Dame:** international rules choice, AI, forced captures.
- [ ] **Battleships:** vs AI with probability-based targeting, ship placement editor.

**Tier 3 [P3]**

- [ ] **Grid Defense** (tower defense): 10+ maps, 6 tower types with upgrades, enemy types, waves, speed controls.
- [ ] **Pixel Runner** (platformer): tight controls (coyote time, jump buffering, variable jump height), 20+ levels, collectibles, **level editor** using Pixel Art Studio sprites, share levels as files.
- [ ] **Neon Racer** (top-down racing): tracks, AI opponents, lap times, ghost cars.
- [ ] **Ultimate Tic-Tac-Toe:** vs AI (MCTS in a worker) and 2-player.
- [ ] **Mahjong Solitaire:** layouts, shuffle, hint, only solvable deals.
- [ ] **Match-3 puzzle:** combos, special tiles, level goals.
- [ ] **Bubble shooter:** aim with bank shots, color matching, levels.
- [ ] **Game of Life & cellular automata sandbox:** draw patterns, step/run, pattern library (glider, gun …), other rules (HighLife, Seeds, Brian's Brain).
- [ ] **Quiz arena:** quiz packs (CS basics, general knowledge EN/DE, written by us), user-made quiz packs, timer, streaks.

**Arcade-wide additions**

- [ ] [P2] Local multiplayer lobby screen for games that support it (assign gamepads/keyboard sides).
- [ ] [P2] Seasonal/rotating "featured game" on the Arcade home and a "random game" button.
- [ ] [P3] Online multiplayer is **out of scope** (no backend). Don't fake it.

### Phase 11 — Media Center — `specs/11-media.md`

**11.1 Nexus Music**

- [ ] [P1] Library from the VFS `Music` folder and imported files/folders; scanning shows progress.
- [ ] [P1] Metadata: parse **ID3v2 (MP3)**, Vorbis comments (OGG/FLAC) and MP4 tags (title, artist, album, year, track, cover art) with our own parser; fallback to the file name.
- [ ] [P1] Views: songs (sortable table), albums (grid with covers), artists, folders, playlists, recently added, most played.
- [ ] [P1] Playback: play/pause, seek, next/previous, shuffle, repeat (one/all), queue (add next, add to end, reorder by drag), volume, playback speed, gapless where the browser allows.
- [ ] [P1] Playlists (create, rename, reorder, delete, smart playlists by rule: "most played this month", "rating ≥ 4"), ratings, play counts.
- [ ] [P1] **Visualizer:** several styles (bars, circular spectrum, waveform, particles reacting to bass, starfield), full-screen mode; uses an `AnalyserNode`.
- [ ] [P1] **Media Session API:** title/artist/artwork in the OS media controls, hardware media keys.
- [ ] [P1] Mini player widget on the desktop and media controls in quick settings.
- [ ] [P2] **10-band equalizer** with presets (BiquadFilterNodes), crossfade between tracks, ReplayGain-like normalization.
- [ ] [P2] Lyrics: `.lrc` files next to songs, synced highlighting.
- [ ] [P2] Sleep timer.

**11.2 Video player**

- [ ] [P1] Play local video files (formats the browser supports; clear message for unsupported codecs), playlist from a folder.
- [ ] [P1] Controls: play/pause, seek with thumbnails preview (generated by sampling frames), volume, speed (0.25×–3×), frame-by-frame step, full screen, **Picture-in-Picture**, loop A-B.
- [ ] [P1] Subtitles: `.vtt` and `.srt` (converted to VTT), size/color/offset settings.
- [ ] [P1] Remember playback position per file.
- [ ] [P2] Video filters (brightness, contrast, saturation via CSS filters), screenshot a frame to `Pictures`.

**11.3 Image viewer & editor (Nexus Photos)**

- [ ] [P1] Gallery of `Pictures` (and any folder): virtualized thumbnail grid (thumbnails generated in a worker and cached), sort by date/name/size, albums, favorites.
- [ ] [P1] Viewer: zoom (wheel/pinch), pan, fit/fill/100 %, next/previous, full screen, **slideshow** with transitions and interval.
- [ ] [P1] **Metadata panel:** dimensions, size, type, dates; **EXIF** (camera, lens, exposure, ISO, date taken, GPS coordinates shown as numbers) parsed by our own JPEG EXIF reader.
- [ ] [P1] Editing: rotate, flip, crop (free and fixed ratios), resize, adjustments (brightness, contrast, saturation, warmth, vignette), filters (presets), save as copy or overwrite (with version history).
- [ ] [P2] Annotate (arrows, text, highlight, blur/pixelate area for privacy), remove EXIF data on export.
- [ ] [P2] Compare two images side by side; set as wallpaper or avatar via intents.

**11.4 Voice Recorder**

- [ ] [P1] Record via `MediaRecorder` with a live waveform and level meter, pause/resume, save to VFS (`Music/Recordings`), list of recordings with playback.
- [ ] [P1] Trim start/end; rename; tags.
- [ ] [P2] Bookmarks during recording (e.g. "important point in lecture"), playback speed, noise gate.

**11.5 Camera / Photo Booth**

- [ ] [P2] Camera via `getUserMedia` with device selection, take photos (with countdown timer, burst), record short videos, live filters (WebGL shaders: grayscale, sepia, neon edges, pixelate, mirror, thermal), save to VFS.
- [ ] [P2] QR/barcode scanning via `BarcodeDetector` where supported (shared with the dev tools).

**11.6 Screen Recorder**

- [ ] [P2] Record screen/window/tab via `getDisplayMedia` + `MediaRecorder`, optional microphone, save WebM to `Videos`, honest messages on browsers without support.

**11.7 Beat Lab (drum machine)**

- [ ] [P1] 16-step sequencer with 8+ tracks, **all drum sounds synthesized** (kick, snare, hi-hat open/closed, clap, tom, rim, cowbell) with per-sound parameters (pitch, decay, tone).
- [ ] [P1] Tempo, swing, pattern length, per-step velocity, mute/solo per track, multiple patterns chained into a song.
- [ ] [P1] Accurate timing with a Web Audio lookahead scheduler (not `setInterval` timing).
- [ ] [P1] Save/load to VFS; export the song as WAV (offline rendering with `OfflineAudioContext`).
- [ ] [P2] Kits/presets (808-style, 909-style, lo-fi — original synthesized sounds, no samples from commercial machines).

**11.8 Synth**

- [ ] [P1] Playable synthesizer: on-screen piano keyboard, computer keyboard mapping, **Web MIDI input** where supported.
- [ ] [P1] Two oscillators (sine, square, saw, triangle, noise), detune, ADSR envelope, filter (low/high/band-pass) with its own envelope, LFO, polyphony, effects (delay, reverb via generated impulse response, distortion, chorus).
- [ ] [P1] Presets (save/load), oscilloscope and spectrum display.
- [ ] [P2] Arpeggiator, simple step sequencer that syncs with Beat Lab tempo, record a performance and export WAV.

**11.9 Podcast/audiobook player mode**

- [ ] [P3] For long files in Music: remember position, chapters (from metadata or manual), skip ±15/30 s, speed control.

### Phase 12 — AI Workspace — `specs/12-ai-workspace.md`

**12.1 Provider layer (`services/ai`)**

- [ ] [P1] One provider interface: `listModels()`, `chat(messages, options)` with **streaming**, `cancel()`, `embed(texts)` where supported, capability flags (streaming, tools, vision, embeddings, JSON mode).
- [ ] [P1] Adapters: · **Ollama** (native API: `/api/tags`, `/api/chat`, `/api/embed`), · **Lemonade** (its OpenAI-compatible endpoint), · **any OpenAI-compatible API** (LM Studio, llama.cpp server, vLLM, LocalAI, OpenRouter, OpenAI …: `/v1/models`, `/v1/chat/completions`, `/v1/embeddings`).
- [ ] [P2] **Anthropic API** adapter (Messages API with streaming; requires the browser-access header; warn clearly that the API key is stored in this browser).
- [ ] [P1] Multiple saved provider profiles (name, type, base URL, API key, default model, extra headers), "Test connection" with a clear diagnosis (offline, DNS/connection refused, CORS blocked, 401 unauthorized, model not found).
- [ ] [P1] Setup guides in Help: installing Ollama, allowing the Nexus origin (`OLLAMA_ORIGINS`), starting Lemonade, using an OpenAI-compatible server; and the note that the live HTTPS site can't call an `http://` server on another machine because of mixed-content rules (localhost is fine in most browsers).
- [ ] [P1] API keys encrypted at rest with a device key (and optionally the profile password); never written to logs or backups unless the user opts in.
- [ ] [P1] Token/time stats per message (tokens in/out if reported, tokens per second, latency).

**12.2 Chat app**

- [ ] [P1] Conversation list with search, folders/pins, rename (auto-title from the first message using the model, optional), delete, archive.
- [ ] [P1] Messages rendered as Markdown with code highlighting, math (KaTeX), tables; copy buttons per message and per code block.
- [ ] [P1] Streaming with a stop button; regenerate; edit a previous user message and resend (branching: keep alternative answers, switch between them).
- [ ] [P1] Model selector per conversation, parameters panel (temperature, top-p, max tokens, context length where supported), system prompt per conversation.
- [ ] [P1] **Personas / assistants:** saved system prompts with name, icon, default model and parameters (e.g. "CS Tutor", "German ↔ English translator", "Code Reviewer", "Exam Coach").
- [ ] [P1] **Prompt templates** with variables (`{{topic}}`, `{{language}}`), filled in by a small form; library with categories; import/export.
- [ ] [P1] Attachments: text files and code from VFS or drag & drop inserted as context (with size/token estimate warnings); **images for vision models**.
- [ ] [P1] Export a conversation as Markdown/JSON/HTML; import JSON.
- [ ] [P1] Context management: show approximate token usage, auto-trim oldest messages with a visible note, or summarize older parts (P2).
- [ ] [P2] **Compare mode:** send the same prompt to 2–3 models side by side.
- [ ] [P2] Voice input via the Web Speech API where supported, read answers aloud via speech synthesis.

**12.3 Code assistant mode**

- [ ] [P1] A layout with a code panel next to the chat; the assistant's code blocks can be applied to the panel, diffed against the current version (Diff Viewer), and sent to Code Playground / Nexus Code via intents.
- [ ] [P1] Quick actions on selected code: explain, find bugs, add comments, write tests, convert to another language, optimize.
- [ ] [P2] "Fix this error": send the Playground console error + code to the assistant.

**12.4 Knowledge: chat with your files (RAG)**

- [ ] [P1] Index selected folders (e.g. Notes) using the provider's **embedding** endpoint; chunking with overlap; vectors stored in IndexedDB; cosine similarity search in a worker.
- [ ] [P1] In chat: "Use my notes" toggle; retrieved chunks shown as citations that open the source note.
- [ ] [P1] Index status, re-index on changes, clear index; honest message if the configured provider has no embedding model.
- [ ] [P2] Hybrid search (keyword via the OS search index + vectors).

**12.5 OS actions (tool calling)**

- [ ] [P1] Tools exposed to models that support tool calling: create note, append to note, search notes, create task, list today's tasks, create calendar event, start a focus session, open app, set theme/wallpaper, create flashcards.
- [ ] [P1] **Every action needs user confirmation** in an approval card that shows exactly what will happen; a per-conversation "allow this tool without asking" option for harmless read-only tools.
- [ ] [P1] Actions are logged and undoable where the target app supports undo.
- [ ] [P2] For models without native tool calling: a JSON-mode fallback with strict parsing; if parsing fails, ask the user instead of guessing.

**12.6 AI inside other apps (through `ctx.ai`)**

- [ ] **Notes:** summarize, continue writing, fix grammar (EN/DE), translate, generate an outline, explain a selection.
- [ ] **Tasks:** break a task into subtasks, estimate effort, plan my day from today's tasks and calendar.
- [ ] **Flashcards:** generate cards from a note or selection (user reviews them before saving).
- [ ] **Exam planner:** generate a study plan from topics.
- [ ] **Sheets:** explain a formula, write a formula from a description.
- [ ] **Code Playground / Nexus Code / Regex / SQL:** explain, generate, fix (regex from description, SQL from description using the current schema).
- [ ] **Terminal:** `ai "question"` command and `ai explain <command>`.
- [ ] **Photos:** describe an image (vision models), generate alt text.

**12.7 Safety and privacy**

- [ ] [P1] A clear notice in the AI app and Settings: what is sent where (only to the configured server), nothing else leaves the browser.
- [ ] [P1] Per-request preview of attached context (which files/notes are being sent).
- [ ] [P1] No auto-sending of any data in the background; RAG indexing only on user request.

### Phase 13 — Ecosystem, polish & v1.0 release — `specs/13-ecosystem-and-release.md`

**13.1 Plugin SDK**

- [ ] [P1] Plugins are apps loaded from a `.nexus-plugin` (zip or folder) or single `.js` file in the VFS, using the same manifest format.
- [ ] [P1] **Real isolation:** plugins run in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin) and talk to the OS through a `postMessage` RPC bridge that exposes a **permission-checked** subset of `ctx` (storage scoped to the plugin, VFS paths it was granted, notifications, commands, dialogs, intents).
- [ ] [P1] Permission prompts on first use; revoke in Settings → Apps; a plugin can never read another app's data.
- [ ] [P1] Install/uninstall/enable/disable in App Center; crash isolation like built-in apps.
- [ ] [P1] `docs/plugin-sdk.md` with a tutorial, API reference, and **two example plugins** in `examples/plugins/` (e.g. a Pomodoro stats widget and a Markdown word-cloud app).
- [ ] [P2] Plugin widgets on the desktop; plugin themes; plugin terminal commands.
- [ ] [P2] Plugin dev mode: reload a plugin from a VFS folder on change.

**13.2 Theme editor & personalization**

- [ ] [P1] Theme editor: edit every token with live preview across the OS (sample windows, controls, charts), contrast warnings, import/export themes as `.nexus-theme` JSON, create from a Color Lab palette or from the current wallpaper's dominant colors.
- [ ] [P1] Icon accent/style options (outline, filled), window corner radius, title bar style (Windows-like right buttons, macOS-like left traffic lights), font choice among bundled fonts.
- [ ] [P2] Custom CSS (advanced, with a warning and a "safe mode" escape hatch).
- [ ] [P2] Profile cards and sharing: export your desktop setup (theme, wallpaper, widget layout, dock) as a file, import someone else's.

**13.3 Sync and data portability (no backend)**

- [ ] [P1] Backup reminders and one-click backup (from phase 1) polished; restore wizard with merge conflicts shown.
- [ ] [P2] **Sync folder** via the File System Access API (Chromium): mirror the VFS to a real folder (e.g. inside Dropbox/OneDrive/Syncthing) with conflict detection; honest fallback on other browsers.
- [ ] [P2] Device-to-device transfer: export as a file + optional QR code containing a short pairing summary (the data itself goes via file).
- [ ] [P3] Peer-to-peer sync over WebRTC with manual copy-paste signaling (no server). Only if it can be done reliably; otherwise record the cut.

**13.4 Onboarding & discoverability**

- [ ] [P1] First-run tour: a short, skippable, interactive walkthrough (open an app, snap windows, Ctrl+K, workspaces, backup).
- [ ] [P1] "Tips" notifications for features the user hasn't discovered (max one per day, can be turned off).
- [ ] [P1] Help app complete for every app; "What's new" after updates (from `CHANGELOG.md`).
- [ ] [P2] Demo profile with rich sample data to explore everything instantly (clearly marked, removable).

**13.5 OS-wide gamification**

- [ ] [P1] Achievements across all apps (e.g. "Wrote 100 notes", "7-day focus streak", "Opened every app", "Solved a Sudoku in under 5 minutes") in a central Achievements page.
- [ ] [P2] Profile page: level, XP sources, stats from every app (focus hours, tasks done, cards reviewed, games played), yearly "Nexus Wrapped" summary.
- [ ] [P3] Secret easter eggs (document them only in a hidden spoiler section of the docs).

**13.6 Quality audits (all [P1])**

- [ ] **Performance:** Lighthouse scores ≥ 90 for Performance, Accessibility, Best Practices, and PWA checks on the live site; initial JS within budget; no long tasks > 100 ms during normal use; 60 fps with 8 open windows on a mid-range laptop. Profile and fix the worst offenders.
- [ ] **Accessibility:** automated checks with axe-core (dev dependency, ask) in the e2e suite for every app; manual keyboard-only pass through every app; screen-reader spot checks (NVDA or VoiceOver) of the shell and three core apps.
- [ ] **i18n:** CI check shows 0 missing keys in EN and DE; review German texts for natural phrasing (no literal translations); date/number formats correct.
- [ ] **Offline:** every app opened and used with the network disabled after a fresh install; results recorded in `docs/offline-audit.md`.
- [ ] **Nexus Lite:** final list of included/excluded apps, size, and a test pass from `file://` in Chrome, Firefox and Safari.
- [ ] **Security review:** sanitization everywhere user content is rendered, sandbox attributes, CSP, crypto parameters, no secrets in logs/backups by default; record findings in `docs/security.md`.
- [ ] **Data safety:** migration tests from every earlier version's data format (fixtures saved in each phase) to v1.0.
- [ ] **Cross-browser:** full e2e suite on Chromium, Firefox and WebKit in CI.

**13.7 Documentation**

- [ ] [P1] `README.md`: hero screenshot/GIF, live link, feature overview with screenshots per category, Nexus Lite download, privacy statement, how to build, how to contribute, license.
- [ ] [P1] `docs/`: architecture, app API (`ctx`, manifests, intents, events), plugin SDK, design system (tokens, components with examples), testing guide, release process.
- [ ] [P1] `CONTRIBUTING.md`, issue templates (bug, feature), `CODE_OF_CONDUCT.md`.

**13.8 Release v1.0**

- [ ] [P1] Version `1.0.0`, final changelog, git tag, **GitHub Release** with release notes and `nexus-lite.html` attached (via `gh release create`).
- [ ] [P1] Verify the live Render site after deploy: fresh visit, install as PWA, offline use, update flow from the previous version.
- [ ] [P2] A short demo video/GIF of the main features for the README.
