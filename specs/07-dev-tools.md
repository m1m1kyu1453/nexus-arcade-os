# Phase 7 — Developer Toolkit

Goal: a toolbox a developer would actually keep open. Tools are small and fast, but each one is complete. All of them work offline except the HTTP client.

Create a shared "tool" layout (input pane, options bar, output pane, copy/download/clear buttons, history of recent inputs) so the many small tools stay consistent and don't duplicate code.

## 7.1 Code Playground
- [P1] HTML, CSS and JavaScript editors (CodeMirror 6 if approved) with highlighting, autocomplete, bracket matching, Emmet-style HTML abbreviations if cheap, formatting (Prettier only if approved; otherwise a basic formatter).
- [P1] Live preview in a **sandboxed iframe** (`sandbox="allow-scripts"`, no same-origin), auto-refresh with debounce or manual run (`Mod+Enter`).
- [P1] Console panel that captures `console.log/warn/error/table`, uncaught errors with line numbers, and lets the user run expressions in the preview context.
- [P1] Layouts: side-by-side, stacked, preview-only, editor-only; resizable panes.
- [P1] Projects saved in the VFS (`Projects/<name>/index.html, style.css, script.js`); a project list with thumbnails.
- [P1] Templates: blank, canvas game loop, CSS animation, fetch + JSON demo, Web Component, p5-like drawing helper (our own tiny one).
- [P1] Export a project as a single HTML file; import a single HTML file (splitting into the three editors).
- [P2] Additional library selection from **bundled** libraries only (no CDN), clearly listed.
- [P2] Share as a URL (project compressed into the URL hash) — works offline for opening.

## 7.2 Nexus Code (multi-file editor)
- [P1] A VS Code-like layout: file tree of a VFS folder, tabs, editor, status bar, command palette integration.
- [P1] Search across files (with regex), go to file (`Mod+P`), go to line, multi-cursor, split editors.
- [P1] Run web projects: an `index.html` in the folder is previewed in a sandboxed iframe with the other files served from the VFS (using a Service Worker route or blob URLs; document the approach).
- [P2] Markdown preview, image preview, a built-in terminal panel (the Nexus Terminal) docked at the bottom.
- [P2] Git-like local history: snapshots of the project folder with diff view (using the Diff Viewer component).
- [P3] Run JavaScript files in a Worker with captured console ("node-lite").

## 7.3 JSON Toolkit
- [P1] Format (indent options), minify, validate with exact error position and message, sort keys, escape/unescape.
- [P1] Tree view with collapse/expand, path copy (`data.items[3].name`), search.
- [P1] Convert: JSON ↔ CSV, JSON ↔ YAML (with an approved library or our own simple YAML subset — document limits), JSON → TypeScript types / JSDoc typedefs.
- [P2] JSONPath queries; JSON Schema validation (with an approved library).
- [P2] JSON diff (structural, using the Diff Viewer).

## 7.4 Encoding & Crypto tools
- [P1] Base64 (text and file, URL-safe variant), Base32, hex, binary, URL encode/decode (component and full), HTML entities, Unicode escapes (`ä`), punycode.
- [P1] Hashes: MD5 (own implementation, tested), SHA-1, SHA-256, SHA-384, SHA-512 (SubtleCrypto), CRC32; for text and files; compare against an expected hash.
- [P1] HMAC (SHA-256/512) with key.
- [P2] AES-GCM encrypt/decrypt text with a password (educational, using the same crypto helpers as the OS).
- [P2] RSA/ECDSA key pair generation and export (PEM/JWK) via SubtleCrypto.

## 7.5 Regex Tester
- [P1] Pattern input with flags (g, i, m, s, u, y, d), test text with live **match highlighting**, groups (numbered and named) in a table, match count, error messages.
- [P1] Replace mode with live preview, including `$1`/`$<name>` references.
- [P1] Cheat sheet panel and a library of common patterns (email, URL, IPv4/6, dates, German postal codes, IBAN format).
- [P1] Runs matching in a Worker with a timeout, so catastrophic backtracking can't freeze the OS.
- [P2] Regex explanation in plain English/German (token-by-token breakdown).
- [P2] Unit test mode: list of strings that should / should not match.

## 7.6 Diff Viewer
- [P1] Text diff side-by-side and inline, line and word level, ignore whitespace/case options, jump between changes.
- [P1] Compare two VFS files, or pasted text.
- [P2] Three-way view; export as unified diff (`.patch`).

## 7.7 Color Laboratory
- [P1] Conversion between HEX, RGB(A), HSL(A), HSV, CMYK, **OKLCH** and CSS named colors; picker with color wheel and sliders; EyeDropper API where supported.
- [P1] Palette generator: complementary, analogous, triadic, tetradic, monochromatic, shades/tints; random harmonious palettes; lock colors and regenerate others.
- [P1] **Contrast checker** (WCAG 2.x AA/AAA for normal and large text; APCA as P2).
- [P1] Save palettes; export as CSS variables, JSON, SCSS; "Use as OS accent" and "Create theme from palette" (feeds phase 13 theme editor).
- [P2] Color blindness simulation; gradient generator (linear, radial, conic) with CSS output.
- [P2] Extract a palette from an image in the VFS (k-means in a worker).

## 7.8 Small dev tools
Each [P1] unless marked:
- **JWT decoder:** header/payload pretty-printed, expiry shown as a date with "expired" badge, signature verification for HS256 with a secret (P2: RS256 with a public key).
- **UUID / ULID / nanoid generator:** bulk generation, versions v4 and v7, copy all.
- **Timestamp converter:** Unix seconds/milliseconds ↔ ISO 8601 ↔ local time ↔ relative time, time zones.
- **Number base converter:** any base 2–36, two's complement view, byte order.
- **Cron expression tool:** explain an expression in plain EN/DE, show the next 10 run times, builder UI.
- **Text tools:** case conversion (camel, snake, kebab, title …), slugify, sort/dedupe/reverse lines, count characters/words/lines/bytes, trim, find & replace, lorem ipsum generator (for user use only).
- **Markdown table generator:** editable grid → Markdown/HTML/CSV.
- **CSS generators:** box-shadow, border-radius, gradient, clip-path, cubic-bezier easing editor with preview, flexbox and grid playgrounds.
- **SVG viewer & optimizer:** preview, basic optimization (remove metadata/comments, round numbers), convert to data URI and PNG.
- **QR code generator** (approved library or own implementation) and reader via camera (P2, BarcodeDetector API where supported).
- **Fake data generator** (P2): names (EN/DE), emails, addresses, dates, numbers → JSON/CSV with a schema.
- **HTTP status code / MIME type / keyboard key code reference** (P2).

## 7.9 HTTP Client
- [P1] Request builder: method, URL, query params table, headers table, body (JSON, form, raw text), auth helpers (Bearer, Basic).
- [P1] Response viewer: status, time, size, headers, body pretty-printed (JSON tree, HTML preview, image preview).
- [P1] Collections of saved requests, environments with variables (`{{baseUrl}}`), request history.
- [P1] Clear explanation when a request fails because of CORS or being offline (not a fake error).
- [P2] Import/export collections as JSON; generate code snippets (fetch, curl).

## 7.10 Snippet Manager
- [P1] Snippets with title, language, tags, description, code (highlighted); folders; search; favorites.
- [P1] Copy with one click, insert into Code Playground / Nexus Code via intents, available in the command palette.
- [P2] Import/export as JSON or a folder of files.

## Done when
Every tool above works completely, the shared tool layout keeps them consistent, everything is searchable from the command palette ("base64", "uuid", "regex"), and heavy operations run in workers.
