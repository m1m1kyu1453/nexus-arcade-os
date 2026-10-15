# ⚡ Nexus Arcade OS — Master Brief

> For Claude Code. This is the master document. Each phase has its own detailed spec in `specs/`. Read this file fully once, then read only the spec of the phase you are working on.

---

## 1. Vision

**Nexus Arcade OS** is a futuristic desktop operating system that runs in the browser. It is a real website, hosted on Render, and an installable Progressive Web App. After the first visit, everything works **offline**.

It should feel like a real OS, not a webpage: windows, a dock, workspaces, a file system, a terminal, dozens of apps and games that share data with each other, consistent design, sound, and polish. It is built like a commercial-quality open-source project.

Target users are people who want a personal all-in-one workspace in the browser. There is a special focus on **students** (study tools, CS learning lab), **developers** (dev toolkit), and **gamers** (arcade).

There is no backend and no accounts. All data stays in the user's browser unless the user exports it or configures an AI server themselves.

---

## 2. How you work on this project

You are working in a git repository with shell access. The project is far too large for one session, so you work **piece by piece**.

### 2.1 Files that carry state between sessions

| File | Purpose |
|---|---|
| `NEXUS_BRIEF.md` | This master brief. Don't edit it except to fix contradictions, and tell me when you do. |
| `specs/NN-*.md` | Detailed phase specs. Same rule. |
| `CLAUDE.md` | Your working conventions: commands, folder layout, code style, library list with reasons, gotchas you discovered. Keep it short and current. |
| `PROGRESS.md` | Checklist of every feature in every spec, ticked as done, plus current phase, next step, decisions made, cuts made (with reason), known bugs. **Update it before every commit.** |
| `CHANGELOG.md` | User-facing changes per version (Keep a Changelog format). |

### 2.2 Session loop

At the **start** of every session:
1. Read `CLAUDE.md`, `PROGRESS.md`, and the spec of the current phase.
2. Run `npm install` if needed, then `npm test`, to confirm the project is green before you change anything.

**During** the session:
- Work through the current phase **in priority order** (see 2.3).
- Make small, focused commits (`feat(notes): wiki links with backlinks`, `fix(wm): snap preview flicker`).
- Push regularly. Every push to `main` deploys to Render.

At the **end** of a phase:
1. All `[P1]` items done, tests green, build green, no console errors.
2. Run the smoke tests and click through the new features in the dev server yourself.
3. Update `PROGRESS.md`, `CHANGELOG.md`, `README.md` and the in-app Help docs for new apps.
4. Commit, push, and check that the Render deploy succeeded and the site works live, including offline.
5. Bump the version (`0.N.0` for phase N), tag it, and push the tag.
6. Give me a short summary: what's new, what to try, what was cut and why, open questions.

If your context is getting full in the middle of a phase, update `PROGRESS.md` with the exact next step, commit, and tell me. A fresh session must be able to continue from the files alone.

### 2.3 Priorities

Every feature in the specs is tagged:
- **[P1] Must**: the phase isn't done without it.
- **[P2] Should**: do after all P1s of the phase.
- **[P3] Nice**: only if it's cheap, or if I ask for it later.

Unfinished P2/P3 items stay in `PROGRESS.md` as open items. Never delete them silently.

### 2.4 When to stop and ask me

- Before adding **any** npm dependency (runtime or dev). Say what it is, its gzipped size, its license, and why it's better than writing it ourselves.
- Before changing the architecture in §5 or a public API used by more than one app.
- When something in a spec is impossible, contradictory, or would need a backend. Propose an alternative instead.
- Before anything destructive to git history or to the GitHub/Render setup.

Otherwise, make reasonable decisions yourself and record them in `PROGRESS.md` → Decisions.

---

## 3. Technical foundation

### 3.1 Stack
- HTML5, CSS3 (custom properties, container queries, `:has()`, nesting), modern JavaScript (ES2022+, modules), Canvas 2D, WebGL where it really helps (shader wallpapers, some games), Web Audio API, IndexedDB, Web Workers, Service Worker, Web Components for shared UI.
- **No UI framework** (no React, Vue or Svelte). Vanilla JS with a small, clean component layer.
- **Vite** for dev server, bundling and code splitting. **Vitest** for unit tests. **Playwright** for end-to-end/smoke tests. ESLint + Prettier.
- JSDoc types on all public APIs. `// @ts-check` in core files, with type checking via `tsc --noEmit` in CI and no TypeScript compile step.

### 3.2 Libraries
Allowed when they clearly beat writing it ourselves, and only after asking (§2.4). They are always **bundled via npm, never loaded from a CDN at runtime**, so offline always works. Likely candidates (each still needs approval):
- CodeMirror 6: all code editors
- a Markdown parser + DOMPurify: Notes, Help, AI chat
- KaTeX: math in Notes/Flashcards
- vite-plugin-pwa (Workbox): service worker precaching
- fflate: zip import/export
- sql.js (WASM): SQL playground, lazy-loaded
- a QR code encoder

Everything else (window manager, VFS, games, visualizers, synth, spreadsheet formulas, and so on) is our own code.

### 3.3 The website (main product)
- Multi-file Vite build in `dist/`, served by Render as a static site.
- **Code splitting:** the shell loads first; every app is its own chunk, loaded when first opened. Performance budget: initial JS ≤ 200 KB gzipped, desktop interactive in < 2 s on a mid-range laptop.
- **PWA:** web app manifest (name, icons incl. maskable, theme color, shortcuts, file handlers), installable on desktop and mobile.
- **Offline:** the Service Worker precaches the shell **and all app chunks and assets**, so every app works offline after the first visit. Large optional assets (e.g. sql.js WASM, Pyodide) are cached on first use and marked as such in the UI. Versioned caches; when a new version is deployed, show an "Update available — reload" toast with the changelog.
- Only features that genuinely need a network (AI server, HTTP client) may need a connection, and they must say clearly when offline.

### 3.4 Nexus Lite (secondary build)
- `npm run build` also produces `dist/nexus-lite.html`: **one self-contained file** (all JS/CSS/assets inlined) that works when double-clicked from disk (`file://`).
- Same source code, different entry/config (`vite.lite.config.js`, e.g. with `vite-plugin-singlefile`).
- Contains **as many apps as practical**. Excluded apps are listed in the README with the reason (usually size or `file://` limits).
- On `file://`: no Service Worker, no PWA install; Workers created from inline Blob URLs; everything else degrades gracefully with an honest message.
- Downloadable from the live site (Settings → About) and attached to each GitHub release.

### 3.5 Browser support
Latest Chrome, Edge, Firefox and Safari (desktop + iOS/Android). Use feature detection, not user-agent sniffing. Features that only exist in some browsers (File System Access API, Battery API, Web Serial, …) are progressive enhancements with an honest fallback.

---

## 4. Repository, CI and deployment

### 4.1 GitHub
- This is its **own repo**: `nexus-arcade-os`. Create it with `gh repo create nexus-arcade-os --public --source=. --remote=origin --push`. If `gh` isn't available or logged in, tell me exactly what to run. Ask me whether it should be public or private if you're unsure.
- `main` is the deployed branch. Use a feature branch only for risky refactors.
- `.gitignore`: `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, OS files.
- License: MIT (unless I say otherwise). Add `README.md` with screenshots, a live link, a feature list, an architecture overview, how to run, how to write an app/plugin, and a link to Nexus Lite.

### 4.2 GitHub Actions CI
`.github/workflows/ci.yml` on push and pull request: `npm ci` → lint → type check → unit tests → build → Playwright smoke tests (Chromium) against `vite preview` and against `nexus-lite.html`. CI must be green before a phase counts as done.

### 4.3 Render (static site)
`render.yaml` in the repo root:

```yaml
services:
  - type: web
    name: nexus-arcade-os
    runtime: static
    buildCommand: npm ci && npm run build
    staticPublishPath: ./dist
    envVars:
      - key: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
        value: "1"
    headers:
      - path: /sw.js
        name: Cache-Control
        value: no-cache
      - path: /index.html
        name: Cache-Control
        value: no-cache
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
```

- The Service Worker must be served from the root (`/sw.js`) and never cached by the CDN, otherwise updates never arrive.
- I connect the repo to Render once myself (New → Blueprint). Tell me when the repo is ready. After that every push to `main` auto-deploys.
- Add the live URL to `README.md` and to Settings → About.

---

## 5. Architecture

### 5.1 Folder layout (document changes in `CLAUDE.md`)
```
src/
  main.js              website entry
  lite.js              Nexus Lite entry
  kernel/              event bus, app registry, lifecycle, intents, error boundary, logger
  services/            storage, vfs, profiles, settings, theme, i18n, commands, shortcuts,
                       notifications, sound, search, clipboard, scheduler, achievements,
                       backup, permissions, ai
  shell/               boot, lock screen, desktop, window manager, dock, top bar,
                       launcher, command palette, notification center, quick settings,
                       context menu, overview, widgets host
  ui/                  shared web components + design tokens
  apps/<app-id>/       manifest.js, index.js, styles.css, i18n/{en,de}.json, help.md
  games/engine/        shared game engine
  games/<game-id>/     same structure as apps
  workers/             worker entry files
  styles/              tokens, base, themes
public/                icons, manifest assets, static files
docs/                  developer docs (app API, plugin SDK, architecture)
tests/unit/            Vitest
tests/e2e/             Playwright
```

### 5.2 App manifest
Every app, game, tool and plugin uses the same format:

```js
/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.notes',
  name: { en: 'Nexus Notes', de: 'Nexus Notizen' },
  version: '1.0.0',
  icon: 'notes',                    // id in the shared SVG icon set
  category: 'productivity',         // productivity | study | office | dev | cslab | games | media | ai | system
  description: { en: '…', de: '…' },
  keywords: ['markdown', 'notes', 'wiki'],
  window: { width: 960, height: 640, minWidth: 360, minHeight: 300, resizable: true, singleInstance: false },
  permissions: ['vfs', 'notifications'],          // shown in App Center; enforced for plugins
  handles: [{ action: 'open', types: ['text/markdown', '.md'] }],   // intents
  commands: [{ id: 'notes.new', title: { en: 'New note', de: 'Neue Notiz' }, shortcut: 'Mod+Alt+N', run: (ctx) => {} }],
  settings: [{ key: 'autosaveMs', type: 'number', default: 800, min: 200, max: 5000, label: { en: 'Autosave delay (ms)', de: 'Autosave-Verzögerung (ms)' } }],
  widgets: [/* optional desktop widgets */],
  searchProvider: async (query, ctx) => [/* { title, subtitle, icon, run } */],
  achievements: [/* { id, title, description, icon, secret? } */],
  load: () => import('./index.js'),               // lazy code chunk
};
```

The loaded module exports `mount(container, ctx, launchArgs)` and `unmount()`.

### 5.3 The `ctx` API (what apps are allowed to use)
`ctx.storage` (scoped key-value + collections), `ctx.fs` (VFS), `ctx.settings`, `ctx.window` (title, badge, menu bar, close, focus, resize, fullscreen), `ctx.dialog` (alert, confirm, prompt, open-file, save-file, color, pick-app), `ctx.notify`, `ctx.commands`, `ctx.shortcuts`, `ctx.events`, `ctx.intents` (open with / share to), `ctx.clipboard`, `ctx.sound`, `ctx.i18n`, `ctx.theme`, `ctx.achievements`, `ctx.scheduler`, `ctx.ai`, `ctx.log`.

Apps must never touch another app's storage or DOM. Cross-app features go through intents and events. This is what keeps 80+ apps maintainable.

### 5.4 Data
- **One IndexedDB database per user profile.** Object stores per service; apps get namespaced collections.
- **Schema versions + migrations** for every store and every app. Data saved in phase 2 must load in phase 13. Add migration tests.
- All writes validated; corrupt records are quarantined (logged and shown in Settings → Storage), never crash the app.
- Full backup/restore of everything as one file (§ specs/01).

### 5.5 Robustness
- **Error boundary per window:** a crashing app shows "This app stopped working" with details, "Copy report", and "Restart". The OS never goes down.
- Global handlers for `error` / `unhandledrejection` write to the system log.
- Heavy work (search indexing, chess AI, image filters, sorting large data, embeddings math) runs in **Web Workers**.
- Loops (`requestAnimationFrame`, timers) pause when a window is minimized, on another workspace, or the tab is hidden.
- Respect `prefers-reduced-motion`; add a battery-saver mode that disables particles, blur and shader wallpapers.

---

## 6. Design system

**Style:** cyberpunk sci-fi desktop. Glassmorphism, neon accents, dark by default, smooth physics-like motion, particle/shader backgrounds, and dynamic lighting (a soft glow following the cursor on the focused window's border, subtle reflections on glass). Inspiration: Windows 11, macOS, KDE/GNOME, VS Code, sci-fi HUDs, modern SaaS dashboards. It should feel premium, not noisy. Neon is an accent, not everywhere.

- **Tokens** as CSS custom properties: color roles (bg, surface 1–3, glass, border, text 1–3, accent, accent-contrast, success, warning, danger, info), radii, blur, elevation/shadows, spacing scale, type scale, font stacks, motion durations and easings, z-index layers.
- **Themes** only swap tokens: *Neon Night* (default), *Synthwave*, *Matrix*, *Blade* (amber/red), *Deep Ocean*, *Arctic Light* (light), *Paper* (light, low glow), *High Contrast*. Any accent color; a custom theme editor comes in phase 13.
- **Typography:** a bundled variable sans font + a monospace font (self-hosted woff2, OFL-licensed). Font size scale is user-adjustable.
- **Icons:** one consistent hand-made inline SVG icon set (≥ 120 icons), stroke-based, `currentColor`.
- **Shared components** (Web Components, in `src/ui/`): button, icon-button, input, textarea, select, combobox, checkbox, radio, toggle, slider, color input, date/time picker, tabs, list, virtual list (for 10k+ items), tree, table (sortable, resizable columns), card, toolbar, menu bar, split pane, toast, modal, sheet, popover, tooltip, context menu, progress (bar + ring), badge, avatar, empty state, skeleton loader, chart (line/bar/pie/heatmap, our own canvas/SVG).
- **Sound design:** synthesized UI sounds with Web Audio (open, close, minimize, notification, error, click, achievement), subtle, mutable, with volume per category. No audio files needed.
- **Responsive:** on phones, windows become full-screen sheets, the dock becomes a bottom bar, and swipe gestures switch apps. Everything must work with touch.

---

## 7. Global rules

- **No fake features.** Every button works. No placeholders, no "coming soon", no lorem ipsum in shipped UI. If you can't finish something, cut it and record it in `PROGRESS.md`.
- **Honesty:** if a feature can't work right now (offline, missing browser API, no AI server configured), show a clear, helpful state explaining why and what to do.
- **i18n:** English and German from day one. All user-visible strings go through `ctx.i18n`. Dates, numbers and currencies use `Intl`. Default language follows the browser.
- **Accessibility:** full keyboard operation, visible focus, ARIA roles (windows = dialogs/regions, menus, tabs, trees), focus trapping in modals, screen-reader labels on icon buttons, WCAG AA contrast in every theme.
- **Security:** escape or sanitize all user content rendered as HTML (DOMPurify for Markdown). User code runs only in sandboxed iframes (`sandbox="allow-scripts"`, no same-origin) or Workers. No `eval` in OS code. Plugins run sandboxed (phase 13). A strict Content Security Policy via meta tag where compatible.
- **Privacy:** no analytics, no tracking, no external requests except ones the user explicitly configures (AI server, HTTP client).
- **Encryption** (notes, journal, vault, backups): Web Crypto AES-GCM with PBKDF2 (≥ 310,000 iterations) or better, random salt/IV per item, with a clear warning that a lost password means lost data.
- **Code quality:** small modules, no duplicated logic (shared code goes to `services/` or `ui/`), comments where intent isn't obvious, consistent naming, no dead code.

---

## 8. Testing and Definition of Done

- **Unit tests (Vitest)** for all pure logic: services, VFS, migrations, parsers (Markdown, formulas, cron, regex helpers), game rules, algorithm implementations, color math, scheduling (SM-2/FSRS), encryption round-trips.
- **E2E tests (Playwright)**: boot; open/close/drag/snap windows; the main flow of every app (at least one test per app); offline reload; backup → reset → restore; Nexus Lite loads from `file://`.
- **Mobile check:** run the e2e suite once with a phone viewport per phase.

A **feature** is done when: it works, has tests for its logic, has EN + DE strings, is keyboard-accessible, works offline (if it can), and is documented in the app's `help.md`.

A **phase** is done when: all `[P1]` features are done, CI is green, the Render deploy works, and `PROGRESS.md` / `CHANGELOG.md` / `README.md` are updated.

---

## 9. Phase overview

| # | Spec | Content |
|---|---|---|
| 0 | `specs/00-foundation.md` | Repo, Vite, PWA, Lite build, CI, Render, test setup |
| 1 | `specs/01-kernel-services.md` | Event bus, storage, VFS, profiles, settings, theme, i18n, commands, notifications, search, scheduler, backup … |
| 2 | `specs/02-shell.md` | Boot, lock screen, desktop, wallpapers, widgets, window manager, workspaces, dock, launcher, command palette … |
| 3 | `specs/03-system-apps.md` | File Explorer, Terminal, Text Editor, Settings, System Monitor, App Center, Help |
| 4 | `specs/04-productivity.md` | Notes, Tasks, Calendar, Focus |
| 5 | `specs/05-study-and-life.md` | Timetable, grade tracker, flashcards, exam planner, habits, journal, budget, calculator, converter, clock, password vault, bookmarks |
| 6 | `specs/06-office-and-creative.md` | Sheets, Write, Whiteboard, Mind Map, Paint, Pixel Art, Slides |
| 7 | `specs/07-dev-tools.md` | Code Playground, Nexus Code, JSON, encoding, regex, diff, color lab, generators, HTTP client … |
| 8 | `specs/08-cs-lab.md` | Algorithm visualizer, graphs, data structures, automata, Turing machine, logic circuits, Boolean algebra, number formats, SQL, toy CPU |
| 9 | `specs/09-game-engine-and-arcade.md` | Game engine, Arcade hub, Snake, Breakout, Memory, 2048, Reaction |
| 10 | `specs/10-more-games.md` | 20+ more games in priority tiers |
| 11 | `specs/11-media.md` | Music, video, images, recorder, camera, Beat Lab, Synth |
| 12 | `specs/12-ai-workspace.md` | Providers, chat, RAG over notes, tool calling, AI in other apps |
| 13 | `specs/13-ecosystem-and-release.md` | Plugin SDK, theme editor, sync, onboarding, audits, v1.0 release |

Phases 0–3 must be done in order. After that, phases 4–12 depend only on 0–3 and can be done in any order I ask for. Phase 13 comes last.

---

## 10. Start

1. Read `specs/00-foundation.md`.
2. Before writing code, show me in a short message: the folder structure, the `AppManifest` + `ctx` types, the list of dependencies you want for phases 0–1 (with size, license, reason), and anything in this brief you think is wrong or risky.
3. After my OK, build phase 0.
