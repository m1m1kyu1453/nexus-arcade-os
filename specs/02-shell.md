# Phase 2 — Shell (the desktop experience)

Goal: Nexus looks and feels like a real, beautiful operating system. This phase sets the visual quality bar for everything after it. Build the shared UI components (master brief §6) here as you need them.

## 2.1 Boot and login
- [P1] **Boot sequence:** animated Nexus logo, a progress bar tied to real init steps (storage, migrations, settings, theme, app registry, search index), a scrolling system log with real messages, and a smooth transition to the lock screen or desktop.
- [P1] Skippable with any key/click; "Fast boot" setting; much shorter on later visits.
- [P1] **Lock screen:** large clock and date, wallpaper with blur, profile picker, PIN/password field, "Switch profile", "Create profile". Lock with `Mod+L` and after an idle time (setting).
- [P2] First-boot setup: name, avatar, language, theme, accent. Done in under 30 seconds.
- [P3] A BIOS-style "boot menu" easter egg when holding a key during boot (safe mode = start without restoring windows).

## 2.2 Desktop
- [P1] **Desktop icons:** files and app shortcuts from the `Desktop` folder; drag with grid snap; multi-select (box select, Ctrl/Shift click); rename; delete; open; drag files in from the real OS.
- [P1] **Desktop context menu:** new folder, new text file, new note, paste, sort icons, change wallpaper, display settings, open terminal here — all functional.
- [P1] **Wallpapers:**
  - static gradient and image wallpapers (a set of generated ones built into the app, plus user images from the VFS),
  - **live wallpapers** on canvas/WebGL: particle network (reacts to cursor), aurora, synthwave grid, matrix rain, starfield, and a slow fluid gradient,
  - fit modes (fill, fit, center, tile), dimming and blur sliders, slideshow from a folder with an interval.
- [P1] Live wallpapers pause when windows are maximized or the tab is hidden, and fall back to static in battery-saver/reduced-motion.
- [P2] Time-of-day wallpaper (colors shift from morning to night).
- [P2] Desktop sticky notes (stored as notes, so they also appear in Nexus Notes).

## 2.3 Widgets
- [P1] Widget host: add from a widget gallery, drag to place, resize in grid steps, remove, per-widget settings, layout saved per workspace.
- [P1] Built-in widgets: clock (analog/digital/world), calendar month, system status (FPS, storage, online/offline, battery where supported), quick note, today's tasks, now playing, Pomodoro, countdown to a date, app launcher grid.
- [P2] Quote/tip of the day (from a bundled list), habit streaks, upcoming events, XP/level progress.
- [P1] Apps can provide widgets through their manifest (master brief §5.2).

## 2.4 Window manager
- [P1] Windows: title bar with icon, title, and min/max/close buttons; drag; resize from all edges and corners; minimum sizes; z-order; focus with a visual focused state (cursor-following glow on the border).
- [P1] Open/close/minimize/maximize/restore animations (with reduced-motion fallback), minimize animates into the dock icon.
- [P1] Double-click title bar to maximize; drag a maximized window to restore it.
- [P1] **Snapping:** drag to left/right edge (halves), corners (quarters), top (maximize), with a preview overlay. **Snap layouts** menu when hovering the maximize button (halves, thirds, quarters, 2/3 + 1/3). Resizing snapped neighbours together.
- [P1] Window state (position, size, snap, workspace, app state where the app supports it) restored after reload.
- [P1] Keyboard: `Mod+Arrows` to snap, `Mod+M` minimize, `Mod+W` close, `Alt+F4` style close where possible, `Mod+Shift+Arrows` move between workspaces.
- [P1] Multiple instances of the same app where the manifest allows it.
- [P1] Windows stay within the viewport on browser resize; nothing gets lost off-screen.
- [P2] **Tiling mode** toggle per workspace: windows auto-arrange in a master/stack layout, keyboard-driven (like a tiling WM).
- [P2] Always-on-top, window opacity, "roll up" (title bar only), pin to all workspaces.
- [P2] App menu bar inside windows (File, Edit, View …) provided by apps through `ctx.window.setMenu`.
- [P3] Shake a window to minimize all others.

## 2.5 Workspaces and overview
- [P1] At least 4 virtual workspaces (user can add/remove/rename), switch with `Ctrl+Alt+Arrows` or `Mod+1..9`, slide animation, move windows between them by drag or shortcut.
- [P1] **Overview** (`Mod+Tab` or hot corner): all windows of the current workspace as live-ish thumbnails, workspaces strip on top, drag windows between workspaces, type to search apps.
- [P1] **Alt+Tab switcher:** window list with icons and titles, cycling with Tab/Shift+Tab, release to switch.

## 2.6 Dock, top bar, launcher
- [P1] **Dock:** pinned apps, running indicators (dot per instance), badges (unread count), progress bars (e.g. downloads, exports), right-click menu (new window, pin/unpin, close all, app settings), drag to reorder, position bottom/left/right, auto-hide option.
- [P1] Hover magnification (macOS-like), configurable or off.
- [P1] Window previews on hover for running apps with multiple windows.
- [P1] **Top bar / system tray:** launcher button, active app name, workspace indicator, clock (click opens calendar popover), online/offline state, volume, notifications bell with count, profile menu (lock, switch profile, settings, log out).
- [P1] **Launcher / start menu:** search box, pinned apps, all apps by category, recent files, recent apps; fully keyboard-operable; opens with `Mod` key tap or `Mod+Space`.
- [P2] Dock folders/stacks (e.g. "Games").

## 2.7 Command palette (`Ctrl+K`)
- [P1] Fuzzy search across apps, commands, settings, files and app search providers (phase 1 search service), with icons, categories, highlighted matches, keyboard navigation, recent items on empty input.
- [P1] Prefix modes: `>` commands only, `/` files, `@` settings, `=` calculator (inline result, Enter copies), `?` help topics, `#` tags.
- [P1] Commands can ask for arguments in the palette (e.g. "Change theme → pick theme" with live preview).
- [P2] Unit and currency-free conversion inline (`= 5 km in miles`, `= 0xff in dec`).

## 2.8 Notification center and quick settings
- [P1] Slide-out panel: notifications grouped by app, clear one/all, actions on notifications, "While you were away" section from the scheduler.
- [P1] Quick settings tiles: Do not disturb, theme light/dark, battery saver, sound mute, volume slider, focus session start, screenshot, lock.
- [P2] Media controls tile when something is playing.

## 2.9 Context menus, dialogs, misc
- [P1] One context menu system used everywhere: keyboard navigation, submenus, icons, shortcuts shown, disabled states, separators, checkable items, positioned within the viewport.
- [P1] System dialogs via `ctx.dialog`: alert, confirm, prompt, file open/save (using the VFS with a mini file browser), color picker, app picker.
- [P1] **Keyboard shortcut overlay:** hold `Mod+/` to see all shortcuts available right now.
- [P2] **Screenshot tool:** capture the screen via `getDisplayMedia` (with permission), select a region, save PNG to `Pictures/Screenshots`, copy to clipboard.
- [P2] **Screensaver** after idle time: a few canvas screensavers (starfield, pipes-like, clock bounce), disabled during media playback.
- [P3] Konami code easter egg.

## 2.10 Mobile shell
- [P1] Below ~768 px: one window at a time as a full-screen sheet, bottom app bar instead of dock, swipe up for the app switcher, swipe down from the top for notifications/quick settings, launcher as a full-screen grid.
- [P1] Touch: long-press = context menu, large hit targets, no hover-only features.

## Done when
A new user can boot, log in, open many windows, snap and tile them, use workspaces, the dock, launcher and command palette entirely with the keyboard or entirely with touch, change wallpaper and theme, and everything is restored after a reload. It should look good enough for a screenshot in the README.
