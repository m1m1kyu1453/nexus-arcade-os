# CLAUDE.md — working conventions

Read with `NEXUS_BRIEF.md`, `PROGRESS.md` and the current phase's spec in `specs/`.

## Commands

| Command                   | What                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run dev`             | Vite dev server (website edition, no Service Worker, no CSP)                               |
| `npm run build`           | Website → `dist/`, then Lite → `dist/nexus-lite.html` (order matters: web empties `dist/`) |
| `npm run preview`         | Serve `dist/` (SW works on localhost)                                                      |
| `npm test`                | Vitest unit tests                                                                          |
| `npm run test:e2e`        | Playwright against the **built** app — run `npm run build` first                           |
| `npm run test:live [url]` | Website e2e projects against the deployed site (default: Render URL)                       |
| `npm run lint` / `format` | ESLint + Prettier check / Prettier write                                                   |
| `npm run typecheck`       | `tsc -p jsconfig.json` (checks `src/kernel`, `src/services`, `src/env.js`)                 |
| `npm run icons`           | Re-render `public/icons/*` from `src/ui/brand/logo.svg`; commit the output                 |

## Layout

As in NEXUS_BRIEF.md §5.1, plus:

- `index.html` / `lite.html` — HTML entries; `lite.html` is renamed to `nexus-lite.html` at build.
- `src/env.js` — edition, version, build date (from Vite `define`, see `scripts/vite-shared.js`).
- `src/sw.js` — our Service Worker; vite-plugin-pwa injects the precache list.
- `src/kernel/types.d.ts` — `AppManifest`, `AppModule`, `AppInstance`, `ctx` types.
- `src/shell/pwa.js` — SW registration + update toast (website only; Lite never imports it).
- `scripts/` — build helpers (shared Vite settings, icon renderer).
- `tests/helpers/` — `setup-unit.js` (fresh fake IndexedDB per test), `nexus.js` (Playwright: `startNexus` clean profile + seed, `collectErrors`, `liteUrl`).
- Empty folders carry a short `README.md` instead of an empty `index.js` (no dead code).

## Code style

- Vanilla ES2022 modules, no UI framework. Prettier: single quotes, width 120.
- `// @ts-check` + JSDoc on public APIs in kernel/services. Types shared across apps go in `src/kernel/types.d.ts`.
- Apps/games: import only own files, `ui/`, `styles/` (games: also `games/engine/`). ESLint enforces it.
- App modules do nothing at import time — Lite evaluates every module on load.
- All user-visible strings in EN + DE. Phase 0 strings: `src/shell/strings.js` (moves to i18n service in phase 1).
- Mark testable elements with `data-testid`; expose state with `data-state`.
- Workers: `import W from './x.worker.js?worker'` — the Lite build inlines these automatically.

## Budgets

- Initial JS ≤ 200 KB gzipped (brief §3.3).
- **Lite: 8 MB** (`LITE_BUDGET_BYTES` in `vite.lite.config.js`; build fails above it). Change only with the owner's OK.

## Libraries (all approved 2026-10-15)

| Package                                                      | Why                                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| vite                                                         | dev server, bundling, code splitting                                                      |
| vite-plugin-pwa + workbox-build/-window/-precaching/-routing | precache manifest with hashed names, update prompt; injectManifest keeps `src/sw.js` ours |
| vite-plugin-singlefile                                       | inlines everything into `nexus-lite.html`                                                 |
| vitest, jsdom, fake-indexeddb                                | unit tests (Node env by default; jsdom per file)                                          |
| @playwright/test                                             | e2e + renders PNG icons                                                                   |
| eslint, @eslint/js, globals, prettier                        | lint/format                                                                               |
| typescript                                                   | `tsc --noEmit` only (TypeScript 7, the Go compiler; JSDoc checking works)                 |
| fflate _(approved, add in phase 1)_                          | zip for backups/folder export, lazy chunk                                                 |

Ask before adding anything else (brief §2.4).

## Gotchas

- Live site: https://nexus-arcade-os.onrender.com (Render static site, deploys after CI passes).
- Playwright persistent profiles on Windows need a **short path** (e.g. `%TEMP%
xp`): under the long scratchpad path Cache Storage fails with "Unexpected internal error" (MAX_PATH), so the SW never installs.

- Vite 8 uses Rolldown; vite-plugin-pwa prints an `inlineDynamicImports` deprecation warning while building the SW. Harmless.
- ESLint `no-restricted-imports` glob negations can't re-include paths under an excluded parent (`../*` swallows `../..`), hence regex patterns.
- The Lite favicon is injected as a data URI by `vite.lite.config.js` (a `<link rel=icon>` to a file would be emitted separately, not inlined).
- The Service Worker navigation fallback must deny `/nexus-lite.html`, or downloading Lite returns the app shell.
- CSP is build-only; check new libraries for inline `<style>` injection (would need `style-src 'unsafe-inline'`).
- `context.setOffline(true)` tests need `navigator.serviceWorker.ready` first; the reload is then SW-controlled.
