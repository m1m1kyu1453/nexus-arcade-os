# Changelog

All notable changes to Nexus Arcade OS are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (`0.N.0` = phase N).

## [Unreleased]

## [0.2.0] — 2026-10-16 — Shell

### Added

- A real desktop: boot screen with live progress, lock and login screens (PIN, switch profile,
  guest profile that wipes itself on log out), desktop icons from your Desktop folder, 6 live
  wallpapers plus gradients, your own pictures and slideshows.
- Windows you can drag, resize, snap to halves/thirds/quarters (also from a layouts menu on the
  maximize button), minimize into the dock, spread over workspaces, and find again in the
  overview or with the Alt+` switcher. Everything comes back after a reload.
- Dock with running dots, badges, previews and magnification; top bar with clock, volume,
  notifications and profile menu; launcher (`Ctrl+Space`); command palette (`Ctrl+K`) with
  commands, files, settings, a calculator and live theme preview.
- Notification center with quick settings (Do not disturb, theme, battery saver, volume, Focus,
  screenshot, lock).
- Desktop widgets: clock (digital, analog, world), calendar, system status, quick note (saved as
  a file), Pomodoro, countdown and an app launcher. Apps can add their own.
- System dialogs for apps: open and save files in Nexus, pick colors, choose an app ("Open with…").
- Hold `Ctrl+/` to see every keyboard shortcut available right now.
- On phones: full-screen windows, an app bar (Apps, Home, Switcher), swipe up for the switcher
  and down for notifications, long-press for context menus.
- A Welcome window with a short tour on first start.

## [0.1.0] — 2026-10-15 — Kernel & services

### Added

- The engine every app will run on: app registry and lifecycle, crash protection per window
  ("This app stopped working" with Restart and Copy report), intents ("Open with…").
- Your data stays in the browser in a real file system (folders, trash, tags, search, import and
  export as zip), with automatic upgrades of saved data between versions.
- Local profiles with an optional PIN, 8 themes (Neon Night, Synthwave, Matrix, Blade, Deep Ocean,
  Arctic Light, Paper, High Contrast) with accent color, text size, transparency and animation
  settings, and English/German that switch without reloading.
- Notifications with Do-not-disturb, reminders that survive restarts ("While you were away"),
  fast fuzzy search over apps, commands, settings and files, synthesized UI sounds, clipboard
  history, achievements and XP levels.
- Full backup and restore of a profile as one `.nexus-backup` file, optionally password-encrypted.
- If IndexedDB is blocked, Nexus says so and falls back to limited storage instead of failing.

## [0.0.0] — 2026-10-15 — Foundation

### Added

- Installable Progressive Web App: works offline after the first visit and shows an
  "Update available — reload" notice when a new version is deployed.
- **Nexus Lite:** the whole OS as one `nexus-lite.html` file that runs by double-click, without a server.
- Start screen showing version, build date, edition, online/offline state, background-worker status
  and whether the browser keeps your data persistently. English and German.
