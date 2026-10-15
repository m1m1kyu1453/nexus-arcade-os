# Phase 1 — Kernel & Services

Goal: the invisible engine everything else stands on. Almost no UI yet, except a minimal debug screen. **Every service gets unit tests.** Take your time here; a weak kernel makes every later phase worse.

## 1.1 Kernel
- [P1] **Event bus:** typed events (documented in `docs/events.md`), `on/once/off/emit`, wildcard listeners, auto-unsubscribe when an app unmounts.
- [P1] **App registry:** registers manifests, validates them (clear error for a bad manifest), lists by category, enable/disable, lazy-loads the code chunk, tracks instances.
- [P1] **Lifecycle:** launch (with launch args), mount, focus/blur, suspend (minimized / other workspace / hidden tab), resume, unmount. Apps can declare `onSuspend`/`onResume`.
- [P1] **Intents:** apps declare `handles`; `ctx.intents.open(file)` picks the default app or asks ("Open with…", "Always use this app"); `ctx.intents.share(data, type)` sends text/files/images to any app that accepts them.
- [P1] **Error boundary + crash reporter:** catches errors in mount, event handlers and async code of an app; shows the crash UI; logs a report with stack, app id, version and recent log lines.
- [P1] **Logger:** levels, per-source tags, ring buffer (last 2,000 entries) persisted across reloads, exported with backups if the user wants.
- [P2] **Permissions:** apps declare permissions; built-in apps are trusted; the model is ready for plugins in phase 13 (ask user on first use, revoke in Settings).

## 1.2 Storage
- [P1] **Storage adapter:** IndexedDB with `localStorage` fallback and in-memory last resort (visible warning). A small promise-based wrapper: stores, get/put/delete/query by index, transactions, cursors for large sets.
- [P1] **Collections API** for apps (`ctx.storage.collection('notes')`): CRUD, indexes, simple queries, change events.
- [P1] **Key-value API** for small app state (`ctx.storage.kv`).
- [P1] **Migrations:** per-store and per-app schema version; ordered migration functions; run at boot with progress shown in the boot log; failed migration → keep old data, report, never wipe.
- [P1] **Quota handling:** catch quota errors, notify the user with what is using space and how to free it.
- [P2] **Corrupt-data quarantine:** records that fail validation are moved to a quarantine store and listed in Settings → Storage.

## 1.3 Virtual File System (VFS)
- [P1] Hierarchical file system in IndexedDB: folders and files, paths (`/home/<user>/Documents/...`), mime types, size, created/modified dates, tags, metadata. Blobs stored separately from metadata.
- [P1] Default folders per profile: `Desktop`, `Documents`, `Downloads`, `Pictures`, `Music`, `Videos`, `Projects`, `.config`, plus `/system` (read-only) and a Trash.
- [P1] Operations: create, read, write (text and binary), rename, move, copy (recursive), delete to trash, restore, empty trash, stat, list, exists, search by name/tag/content (text files).
- [P1] Watchers: apps subscribe to changes on a path.
- [P1] Import from the real OS (file picker + drag & drop, folders where supported) and export (download a file, or a folder as zip if fflate is approved).
- [P1] Path utilities (normalize, join, dirname, basename, extname, relative), safe against `..` escapes.
- [P2] File versions: keep the last N versions of text files, restore from history.
- [P3] "Mount" a real folder via the File System Access API (Chromium only, honest fallback elsewhere).

## 1.4 Profiles
- [P1] Multiple local profiles, each with its own database: name, avatar (generated identicon or uploaded image), accent color.
- [P1] Optional PIN or password per profile (hashed with PBKDF2; this is a privacy lock, not real security, and the UI says so).
- [P2] Guest profile that wipes itself on logout.

## 1.5 Settings service
- [P1] Typed settings schema (string, number, boolean, enum, color, shortcut, file path), defaults, validation, migration.
- [P1] System settings + per-app settings from manifests; change events so changes apply live without reload.
- [P1] Reset one setting, one app, or everything.

## 1.6 Theme engine
- [P1] Loads token sets, applies them as CSS custom properties on `:root`, live switching with a smooth transition.
- [P1] The 8 themes from master brief §6, accent color override, font scale, transparency/blur level, animation level (full, reduced, off).
- [P1] Follows system light/dark preference if the user picks "Auto".
- [P2] Automatic contrast check of accent color against backgrounds; warns or adjusts if below WCAG AA.
- [P2] Time-based theme switching (e.g. light during the day, dark at night).

## 1.7 i18n
- [P1] JSON message files per language and app, lazy-loaded with the app; fallback to English; missing keys logged in dev.
- [P1] Interpolation, plurals (`Intl.PluralRules`), dates/times/numbers/currencies/relative time via `Intl`.
- [P1] Language switch at runtime without reload.
- [P2] A dev script that lists missing/unused keys per language; runs in CI.

## 1.8 Commands and shortcuts
- [P1] Command registry: id, title, icon, category, `when` condition (e.g. only when an app is focused), run function, optional arguments.
- [P1] Shortcut manager: global and app-scoped shortcuts, `Mod` = Ctrl/Cmd, conflict detection, user rebinding, a reset option, ignoring shortcuts inside text inputs where appropriate.
- [P2] Chord shortcuts (e.g. `Ctrl+K Ctrl+T`).

## 1.9 Notifications
- [P1] Toasts with title, body, icon, app source, actions (buttons), progress, timeout or sticky.
- [P1] History stored for the notification center (phase 2 UI).
- [P1] Do-not-disturb (manual and during Focus sessions), per-app mute.
- [P1] Optional browser notifications (system-level) when Nexus is in the background, after asking permission.

## 1.10 Scheduler
- [P1] Persistent scheduled jobs (reminders, alarms, recurring tasks): stored in IndexedDB, fired while Nexus is open, and **missed jobs are shown on next start** ("While you were away: 2 reminders").
- [P1] Honest about limits: a closed browser tab cannot fire reminders. Say so in Settings and in the Calendar/Clock help.
- [P1] Recurrence rules (daily, weekly on days, monthly, yearly, every N, until/count), with unit tests including DST changes.

## 1.11 Search service
- [P1] Index in a Web Worker: apps, commands, settings, files (names + text content), and app-provided providers.
- [P1] Fuzzy matching with ranking (exact > prefix > word start > fuzzy; recent and frequent items boosted), highlights of matched characters.
- [P1] Incremental updates when files/data change.

## 1.12 Other services
- [P1] **Sound service:** synthesized UI sounds (master brief §6), categories (UI, notifications, games, media), master volume, mute, respects reduced-motion/quiet mode.
- [P1] **Clipboard service:** wraps the async Clipboard API with fallbacks; keeps a history of copies made inside Nexus (used by the Clipboard app in phase 5).
- [P1] **Achievements & XP service:** register achievements per app, unlock with a notification, progress achievements (e.g. 0/100), secret achievements, global XP and levels (formula documented), stats per app.
- [P1] **Backup service:** export the whole profile (all stores + VFS blobs + settings) as one `.nexus-backup` file (zip or JSON), optional password encryption; import with preview (what's inside, which version), merge or replace; restore runs migrations. Round-trip test: backup → wipe → restore → identical data.
- [P2] **AI service stub:** just the interface `ctx.ai` that phase 12 fills in. `ctx.ai.isAvailable()` returns false until configured, so apps can hide AI buttons honestly.

## 1.13 Debug screen
- [P1] A temporary developer page (only in dev mode) that shows registered apps, services, storage contents, the event log, and buttons to trigger notifications/crashes. This proves the kernel works before the shell exists.

## Done when
All services work and are covered by unit tests; a test app can be registered, launched in a bare container, crash safely, store data, read/write VFS files, be found by search, and survive a backup → wipe → restore cycle.
