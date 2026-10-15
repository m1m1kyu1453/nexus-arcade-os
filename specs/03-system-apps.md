# Phase 3 — System apps

Goal: the apps every OS has. They also prove that the app framework from phase 1 works for real apps.

## 3.1 File Explorer
- [P1] Sidebar: favorites (Desktop, Documents, Downloads, Pictures, Music, Videos, Projects), Trash, tags, recent files; storage usage bar.
- [P1] Views: icons (with thumbnails for images), list, details (sortable columns: name, size, type, modified), and column view.
- [P1] Breadcrumb path bar (click to navigate, click empty space to type a path), back/forward/up, search within the current folder and below.
- [P1] Operations: new folder/file, rename (F2), copy/cut/paste, drag & drop (within Explorer, to the desktop, to other apps, from the real OS), delete to trash, restore, permanent delete with confirm, properties dialog (size, dates, type, tags, default app).
- [P1] Multi-select (Ctrl/Shift, box select), keyboard navigation (type-ahead), undo for the last operation.
- [P1] "Open with…", "Set default app", "Download", "Copy path", "Open terminal here".
- [P1] Preview pane: images, text/code (highlighted), Markdown (rendered), audio/video players, PDF (browser's built-in viewer if available).
- [P2] Tabs and split view (two folders side by side).
- [P2] Zip: compress selection, extract archive (if fflate is approved).
- [P2] Tags with colors, filter by tag.
- [P3] Batch rename with a pattern and preview.

## 3.2 Terminal
- [P1] Proper terminal UI: monospace, ANSI colors, prompt with user@nexus and current path, scrollback, selection and copy, paste, `Ctrl+C` to cancel, `Ctrl+L` clear, tabs (multiple sessions).
- [P1] History (up/down, `history`, `!n`, search with `Ctrl+R`), tab completion for commands, paths and app ids.
- [P1] Shell features: quoting, escaping, pipes `|`, redirection `>`, `>>`, `<`, `&&`, `||`, `;`, environment variables (`$HOME`, `export`), aliases, `~` expansion, glob `*` in paths.
- [P1] Built-in commands: `help`, `man <cmd>`, `ls` (`-la`), `cd`, `pwd`, `cat`, `less`, `head`, `tail`, `touch`, `mkdir -p`, `rm -r`, `mv`, `cp -r`, `find`, `grep` (regex, `-i -n -r`), `wc`, `sort`, `uniq`, `tree`, `echo`, `date`, `cal`, `clear`, `whoami`, `uptime`, `du`, `df`, `env`, `alias`, `history`, `open <app|file>`, `apps`, `kill <window>`, `theme <name>`, `wallpaper <file>`, `notify <text>`, `calc <expr>`, `nexusfetch` (system info with ASCII logo).
- [P1] Apps can register their own commands (e.g. `notes new "Title"`, `task add "Buy milk" --due tomorrow`, `play snake`).
- [P2] Scripts: run `.nsh` files from the VFS (line-by-line with variables, `if`, `for`), and `~/.nexusrc` on start.
- [P2] A small text editor inside the terminal (`edit file.txt`, nano-like).
- [P3] `cowsay`, `fortune`, `sl`, `matrix`, and similar fun commands.

## 3.3 Nexus Edit (text editor)
- [P1] Tabs, open/save from VFS, new file, "Save as", unsaved-changes indicator and protection on close.
- [P1] Syntax highlighting for common languages (via CodeMirror 6 if approved), line numbers, word wrap toggle, find/replace (regex), go to line, font size zoom.
- [P1] Status bar: line/column, encoding, language, line ending.
- [P2] Markdown preview side by side; minimap; multiple cursors.

## 3.4 Settings
- [P1] Sections: Personalization (theme, accent, wallpaper, fonts, transparency, animations, sounds), Desktop & Dock, Windows (snapping, tiling, animations), Notifications, Shortcuts (view/rebind all), Language & Region, Profiles & Lock, Storage, Apps (per-app settings rendered from manifests, default apps for file types), Privacy (what is stored, clear history), Accessibility, Backup & Restore, Updates, About.
- [P1] Settings search (finds individual settings, deep-links to them; also available from the command palette with `@`).
- [P1] **Storage page:** usage per app and per VFS folder, clear app data (with confirm), clear caches, quarantine list, persistent-storage status and request button.
- [P1] **Backup page:** export full backup (optional password), import with preview, automatic backup reminder (every N days).
- [P1] **About page:** version, edition (web/Lite), build date, changelog, licenses of all bundled libraries and fonts, live URL, download link for Nexus Lite, link to GitHub.
- [P1] **Accessibility page:** reduced motion, high contrast, font size, focus ring style, screen-reader hints, larger hit targets, disable sounds.

## 3.5 System Monitor
- [P1] Tabs: Processes (open windows/apps with memory estimate where possible, CPU-ish frame time, "End task"), Performance (FPS graph, frame time, JS heap where supported, number of DOM nodes, active animation loops and workers), Storage (per app), Log (system log with filters and export), Network (online/offline, request log of user-initiated requests like AI/HTTP client).

## 3.6 App Center
- [P1] Lists all built-in apps by category with icon, description, version, size estimate and permissions.
- [P1] "Uninstall" built-in apps = hide them everywhere (launcher, dock, search) and optionally delete their data; "Install" = show again.
- [P1] Per-app page: screenshots (taken by you during development and bundled), changelog, settings shortcut, "Clear data".
- [P2] Plugin section (filled in phase 13).

## 3.7 Help
- [P1] Help app that renders every app's `help.md` plus general docs (getting started, keyboard shortcuts, offline, backups, privacy, FAQ), with search and a table of contents.
- [P1] `F1` in any app opens Help for that app.

## 3.8 Trash and recovery
- [P1] Trash in Explorer with original paths, restore, empty, auto-empty after N days (setting).

## Done when
A user can manage files like on a real OS, use the terminal to do real work across apps, edit text files, change every system setting, see what Nexus is doing in the monitor, hide apps they don't need, and find help for everything.
