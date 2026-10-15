# Phase 0 — Foundation

Goal: a clean, deployed, tested skeleton. Nothing user-visible beyond a minimal desktop placeholder screen, but every pipeline (build, Lite build, offline, CI, deploy) works from the start, so it never has to be retrofitted.

## 0.1 Project setup
- [P1] `git init`, Vite project (vanilla JS), Node LTS pinned in `.nvmrc` and `package.json` `engines`.
- [P1] Scripts: `dev`, `build` (website + Lite), `build:web`, `build:lite`, `preview`, `test` (Vitest), `test:e2e` (Playwright), `lint`, `format`, `typecheck`.
- [P1] ESLint + Prettier config, `.editorconfig`, `jsconfig.json` with `checkJs` for `src/kernel` and `src/services`.
- [P1] Folder structure from the master brief §5.1, with an `index.js` per folder where it makes sense.
- [P1] `CLAUDE.md`, `PROGRESS.md` (with **every** item from **all** spec files as a checklist, grouped by phase), `CHANGELOG.md`, `README.md`, `LICENSE` (MIT), `docs/architecture.md`.

## 0.2 PWA and offline
- [P1] Web app manifest: name, short name, description, start URL, display `standalone`, theme/background colors, icons (192, 512, maskable, SVG). Generate PNG icons from one SVG source with a dev script (ask before adding a tool for it).
- [P1] Service Worker (vite-plugin-pwa/Workbox or hand-written, decide and justify): precache shell + all chunks + fonts + icons; versioned; `skipWaiting` only after the user confirms the update toast.
- [P1] Offline indicator in the placeholder UI, and an "Update available — reload" toast.
- [P1] Request `navigator.storage.persist()` on first meaningful use (not on first page load).

## 0.3 Nexus Lite build
- [P1] `vite.lite.config.js` → `dist/nexus-lite.html`, fully self-contained.
- [P1] `src/lite.js` entry that sets a global `NEXUS_EDITION = 'lite'` flag; Service Worker registration is skipped there.
- [P1] Proof that a Web Worker can be started from an inline Blob URL in Lite (a tiny ping/pong worker, with a test).
- [P2] Build reports the size of the Lite file and fails if it exceeds a budget set in `CLAUDE.md` (start with 8 MB, adjust later with my OK).

## 0.4 Testing
- [P1] Vitest set up with jsdom + `fake-indexeddb` (ask) for service tests.
- [P1] Playwright set up; smoke tests: (a) website loads with no console errors, (b) load → go offline → reload → still loads, (c) `nexus-lite.html` loads from `file://`.
- [P1] A test helper to start the app with a clean profile and seed data.

## 0.5 CI and deployment
- [P1] GitHub Actions workflow per master brief §4.2, with npm and Playwright browser caching.
- [P1] Create the GitHub repo `nexus-arcade-os`, push, CI green.
- [P1] `render.yaml` per master brief §4.3. Tell me to connect it; after I confirm, verify the live site loads and works offline.
- [P2] README badge for CI status; live URL in README.

## 0.6 Placeholder screen
- [P1] A dark full-screen page with the Nexus logo (SVG), version number, build date, edition (web/lite), online/offline state, and "Phase 0 — foundation ready". This gets replaced in phase 2.

## Done when
`npm run build` produces the website and Lite; CI is green; the live Render site loads, works offline after one visit, and shows the update toast after a new deploy; Lite opens by double-click.
