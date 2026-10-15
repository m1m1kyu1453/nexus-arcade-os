# Phase 13 — Ecosystem, polish & v1.0 release

Goal: make Nexus extensible, personal and polished, then ship v1.0. This phase is mostly about quality: audits, performance, accessibility, documentation.

## 13.1 Plugin SDK
- [P1] Plugins are apps loaded from a `.nexus-plugin` (zip or folder) or single `.js` file in the VFS, using the same manifest format.
- [P1] **Real isolation:** plugins run in a sandboxed iframe (`sandbox="allow-scripts"`, no same-origin) and talk to the OS through a `postMessage` RPC bridge that exposes a **permission-checked** subset of `ctx` (storage scoped to the plugin, VFS paths it was granted, notifications, commands, dialogs, intents).
- [P1] Permission prompts on first use; revoke in Settings → Apps; a plugin can never read another app's data.
- [P1] Install/uninstall/enable/disable in App Center; crash isolation like built-in apps.
- [P1] `docs/plugin-sdk.md` with a tutorial, API reference, and **two example plugins** in `examples/plugins/` (e.g. a Pomodoro stats widget and a Markdown word-cloud app).
- [P2] Plugin widgets on the desktop; plugin themes; plugin terminal commands.
- [P2] Plugin dev mode: reload a plugin from a VFS folder on change.

## 13.2 Theme editor & personalization
- [P1] Theme editor: edit every token with live preview across the OS (sample windows, controls, charts), contrast warnings, import/export themes as `.nexus-theme` JSON, create from a Color Lab palette or from the current wallpaper's dominant colors.
- [P1] Icon accent/style options (outline, filled), window corner radius, title bar style (Windows-like right buttons, macOS-like left traffic lights), font choice among bundled fonts.
- [P2] Custom CSS (advanced, with a warning and a "safe mode" escape hatch).
- [P2] Profile cards and sharing: export your desktop setup (theme, wallpaper, widget layout, dock) as a file, import someone else's.

## 13.3 Sync and data portability (no backend)
- [P1] Backup reminders and one-click backup (from phase 1) polished; restore wizard with merge conflicts shown.
- [P2] **Sync folder** via the File System Access API (Chromium): mirror the VFS to a real folder (e.g. inside Dropbox/OneDrive/Syncthing) with conflict detection; honest fallback on other browsers.
- [P2] Device-to-device transfer: export as a file + optional QR code containing a short pairing summary (the data itself goes via file).
- [P3] Peer-to-peer sync over WebRTC with manual copy-paste signaling (no server). Only if it can be done reliably; otherwise record the cut.

## 13.4 Onboarding & discoverability
- [P1] First-run tour: a short, skippable, interactive walkthrough (open an app, snap windows, Ctrl+K, workspaces, backup).
- [P1] "Tips" notifications for features the user hasn't discovered (max one per day, can be turned off).
- [P1] Help app complete for every app; "What's new" after updates (from `CHANGELOG.md`).
- [P2] Demo profile with rich sample data to explore everything instantly (clearly marked, removable).

## 13.5 OS-wide gamification
- [P1] Achievements across all apps (e.g. "Wrote 100 notes", "7-day focus streak", "Opened every app", "Solved a Sudoku in under 5 minutes") in a central Achievements page.
- [P2] Profile page: level, XP sources, stats from every app (focus hours, tasks done, cards reviewed, games played), yearly "Nexus Wrapped" summary.
- [P3] Secret easter eggs (document them only in a hidden spoiler section of the docs).

## 13.6 Quality audits (all [P1])
- **Performance:** Lighthouse scores ≥ 90 for Performance, Accessibility, Best Practices, and PWA checks on the live site; initial JS within budget; no long tasks > 100 ms during normal use; 60 fps with 8 open windows on a mid-range laptop. Profile and fix the worst offenders.
- **Accessibility:** automated checks with axe-core (dev dependency, ask) in the e2e suite for every app; manual keyboard-only pass through every app; screen-reader spot checks (NVDA or VoiceOver) of the shell and three core apps.
- **i18n:** CI check shows 0 missing keys in EN and DE; review German texts for natural phrasing (no literal translations); date/number formats correct.
- **Offline:** every app opened and used with the network disabled after a fresh install; results recorded in `docs/offline-audit.md`.
- **Nexus Lite:** final list of included/excluded apps, size, and a test pass from `file://` in Chrome, Firefox and Safari.
- **Security review:** sanitization everywhere user content is rendered, sandbox attributes, CSP, crypto parameters, no secrets in logs/backups by default; record findings in `docs/security.md`.
- **Data safety:** migration tests from every earlier version's data format (fixtures saved in each phase) to v1.0.
- **Cross-browser:** full e2e suite on Chromium, Firefox and WebKit in CI.

## 13.7 Documentation
- [P1] `README.md`: hero screenshot/GIF, live link, feature overview with screenshots per category, Nexus Lite download, privacy statement, how to build, how to contribute, license.
- [P1] `docs/`: architecture, app API (`ctx`, manifests, intents, events), plugin SDK, design system (tokens, components with examples), testing guide, release process.
- [P1] `CONTRIBUTING.md`, issue templates (bug, feature), `CODE_OF_CONDUCT.md`.

## 13.8 Release v1.0
- [P1] Version `1.0.0`, final changelog, git tag, **GitHub Release** with release notes and `nexus-lite.html` attached (via `gh release create`).
- [P1] Verify the live Render site after deploy: fresh visit, install as PWA, offline use, update flow from the previous version.
- [P2] A short demo video/GIF of the main features for the README.

## Done when
Nexus v1.0 is released: extensible via sandboxed plugins, fully themeable, documented, audited for performance/accessibility/offline/security, and live on Render with Nexus Lite attached to the GitHub release.
