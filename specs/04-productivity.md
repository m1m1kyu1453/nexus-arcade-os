# Phase 4 — Productivity core

Goal: four flagship apps good enough that someone would use them every day instead of separate tools. They are deeply connected: tasks show on the calendar, notes link to tasks, focus sessions log to tasks.

## 4.1 Nexus Notes
**Editor**
- [P1] Markdown editor (CodeMirror 6 if approved) with live preview; modes: edit, preview, split; synchronized scrolling.
- [P1] Formatting toolbar and shortcuts (bold, italic, headings, lists, checklists, code, quote, link, table, horizontal rule).
- [P1] Rendering: GitHub-flavored Markdown (tables, task lists, strikethrough, footnotes), syntax-highlighted code blocks, **math via KaTeX** (`$…$`, `$$…$$`), **Mermaid-like diagrams** only if a small library is approved, otherwise skip.
- [P1] Images: paste or drop images → stored in the VFS next to the note and embedded.
- [P1] Autosave with a configurable delay, "saved" indicator, conflict-safe if the note is open twice.

**Organization**
- [P1] Notes are `.md` files in `Documents/Notes` (so Explorer, Terminal and other apps can use them), with front-matter for tags, favorite, created/updated.
- [P1] Sidebar: folders (nested), tags, favorites, recent, trash; drag notes between folders.
- [P1] Full-text search with highlighted results and filters (tag, folder, date).
- [P1] Sort by title, created, updated; pin notes.
- [P1] **Wiki links** `[[Note title]]` with autocomplete, backlinks panel, and creating a note from a missing link.
- [P2] **Graph view** of note links (force-directed, on canvas), click to open.
- [P2] Daily notes (one note per day, template), note templates (meeting, lecture, project).
- [P2] Outline panel (headings), word/character count, reading time.
- [P2] Turn a checklist item into a task in Tasks (via intent), and show linked tasks.
- [P3] Focus/typewriter mode, version history view (from VFS versions).

**Security and exchange**
- [P1] Optional encryption per note (master brief §7 rules): locked notes show a lock screen, content never stored unencrypted, auto-lock after N minutes.
- [P1] Import: `.md`, `.txt`, a folder of Markdown files. Export: single note as `.md`/`.html`/print-to-PDF, all notes as zip (if fflate approved) or a JSON bundle.

## 4.2 Tasks
- [P1] Projects (with color and icon), sections inside projects, an Inbox for unsorted tasks.
- [P1] Tasks: title, description (Markdown), subtasks (nested, with their own progress), priority (4 levels), due date and time, start date, tags, estimate, attachments (VFS files), links to notes.
- [P1] **Quick add** with natural language parsing in EN and DE: `Prepare presentation tomorrow 14:00 #uni !high` / `Präsentation vorbereiten morgen 14 Uhr #uni !hoch`. Show what was parsed before saving.
- [P1] Recurring tasks (using the scheduler's recurrence rules), reminders.
- [P1] Views: list (grouped by date/project/priority), **Kanban** (custom columns per project, drag & drop, WIP limits), **Today**, **Upcoming** (next 7 days), **Overdue**, and a calendar view.
- [P1] Filters and saved filters (e.g. "#uni and due this week and not done").
- [P1] Progress per project, completion animation and sound, undo complete.
- [P1] **Statistics:** completed per day/week (chart), streak, average completion time, overdue rate, time tracked per project.
- [P2] Time tracking per task (start/stop timer, linked with Focus sessions).
- [P2] Eisenhower matrix view (urgent/important).
- [P2] Dependencies (task B blocked by task A), shown on Kanban.
- [P3] Gantt/timeline view per project.

## 4.3 Calendar
- [P1] Views: day, week, month, year, agenda; mini-month navigator; "today" button; week start setting (Monday by default in DE).
- [P1] Events: title, location, description, all-day or timed, start/end with time zone, color/calendar, recurrence (full rules incl. exceptions: "edit this / this and following / all"), reminders (multiple per event).
- [P1] Multiple calendars (Personal, Uni, Work …) with colors and visibility toggles.
- [P1] Drag to create, drag to move, drag edges to resize events; keyboard creation.
- [P1] Tasks with due dates and timetable entries (phase 5) appear as overlays that can be toggled.
- [P1] **`.ics` import/export** (RFC 5545 subset: VEVENT, RRULE, EXDATE, VALARM), with unit tests.
- [P1] Public holidays for Germany (by state, including Hesse) computed locally (Easter-based holidays included), toggleable; other countries optional.
- [P2] Natural-language quick add ("Lunch with Max Friday 12:30").
- [P2] Search events; print/export week as PDF via print styles.
- [P3] Show week numbers, moon phases, and sunrise/sunset (computed locally from a configured location, no network).

## 4.4 Focus
- [P1] Pomodoro timer with configurable work/short break/long break lengths and rounds; big, beautiful timer UI (ring) and a compact mini-window/widget mode.
- [P1] Link a session to a task; time is logged on the task.
- [P1] Notifications and sounds at transitions (synthesized), optional auto-start of the next phase.
- [P1] **Distraction blocking:** user picks "distracting" apps (default: all games); during a work session they can't be opened (a blocking overlay with remaining time and an "I really need it" override that is logged).
- [P1] Do-not-disturb automatically during work sessions.
- [P1] **Ambient sounds generated with Web Audio:** rain, thunderstorm, white/pink/brown noise, café murmur, fireplace crackle, ocean waves, forest/birds (procedural), binaural tones; mix several with individual volumes; save mixes.
- [P1] Statistics: focus time per day/week (charts), sessions completed, longest streak, best time of day, per task/project.
- [P2] Goals (e.g. 4 hours/day) with progress on the widget.
- [P2] "Flow mode": a count-up timer instead of fixed Pomodoros.
- [P3] Session journaling: a short note after each session ("What did you get done?").

## Done when
Notes, Tasks, Calendar and Focus each work fully on their own, and the integrations work: checklist → task, tasks on the calendar, focus time on tasks, reminders through the scheduler, everything searchable from the command palette, and everything works offline and in German.
