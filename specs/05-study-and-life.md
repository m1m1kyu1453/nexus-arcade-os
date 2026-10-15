# Phase 5 — Study & Life tools

Goal: the tools a university student (and anyone organized) needs daily. German university conventions are first-class (grades 1.0–5.0, ECTS, semesters, lecture-free periods), but everything also works for other systems.

## 5.1 Timetable (Stundenplan)
- [P1] Weekly grid of courses: name, type (lecture/tutorial/lab/seminar), lecturer, room, color, weekdays and times, weekly or biweekly (A/B weeks), start/end date.
- [P1] Semesters: lecture period, lecture-free period, holidays; switch between semesters, archive old ones.
- [P1] "Now and next" view and a desktop widget ("Next: Algorithms & Data Structures, 10:15, Room C 213").
- [P1] Entries appear in the Calendar (as a read-only calendar layer).
- [P1] Each course links to a notes folder, a task project and a flashcard deck (created on demand).
- [P2] Attendance tracking per session; cancellation/room change marks.
- [P2] Import/export as `.ics` and as JSON to share with classmates.

## 5.2 Grade tracker (Notenrechner)
- [P1] Modules with ECTS/credit points, grade, attempt number, semester, status (planned, in progress, passed, failed), and whether the grade counts towards the final grade.
- [P1] German scale (1.0–5.0, with 0.3/0.7 steps; 4.0 = pass) with **ECTS-weighted average**, and alternative scales (percentages, US GPA, UK classes, Swiss 6–1, Austrian 1–5) selectable per profile.
- [P1] Dashboard: current weighted average, ECTS earned vs. required (e.g. 180 for a Bachelor), progress per semester (chart), best/worst modules.
- [P1] **What-if calculator:** "What average do I need in my remaining modules to reach 2.0?" and "What happens if I get a 1.7 in this module?"
- [P2] Exam attempts history and retake planning; final grade prediction range.
- [P2] Partial grades within a module (e.g. 40 % exam, 30 % project, 30 % homework) with automatic module grade.

## 5.3 Flashcards
- [P1] Decks and subdecks, cards with front/back in Markdown, **math (KaTeX)**, code blocks, images.
- [P1] Card types: basic, basic + reversed, **cloze deletion** (`{{c1::text}}`), type-the-answer.
- [P1] Spaced repetition with **FSRS** (or SM-2 as a first step; document which), daily new-card and review limits, learning steps, ease buttons, keyboard-only review (1–4, Space).
- [P1] Study session UI: progress, remaining counts, undo last answer, flip animation.
- [P1] Statistics: reviews per day, retention, forecast of upcoming reviews (chart), heatmap calendar, hardest cards.
- [P1] Import CSV/TSV (column mapping), export CSV and JSON.
- [P2] Create cards from a selected text in Notes (intent), and from AI in phase 12.
- [P2] Cram mode (review everything regardless of schedule) and custom study by tag.
- [P3] Anki `.apkg` import (sql.js needed; only if already approved for phase 8).

## 5.4 Exam planner
- [P1] Exams with date, module, room, type, and topics checklist; countdown cards ("12 days until Theoretical CS").
- [P1] Generate a study plan: distribute topics over the remaining days into Tasks, respecting other exams.
- [P2] Readiness score per exam from checklist progress + flashcard retention for the linked deck.

## 5.5 Habits
- [P1] Habits: daily, specific weekdays, or N times per week; yes/no or count (e.g. 8 glasses of water) or duration.
- [P1] Check-in from the app, from a widget, from the command palette, and from the terminal (`habit done reading`).
- [P1] Streaks, best streak, completion rate, a GitHub-style yearly heatmap per habit.
- [P2] Reminders via the scheduler; skip days without breaking streaks (rest days).

## 5.6 Journal
- [P1] One entry per day (more allowed), rich Markdown, mood (5-point scale with icons), tags, photos from VFS.
- [P1] Calendar view of entries and mood, "On this day" (entries from previous years), search.
- [P1] Optional encryption of the whole journal with its own password and auto-lock.
- [P2] Writing prompts (bundled list, EN/DE), mood chart over time, word count stats.

## 5.7 Budget
- [P1] Accounts (e.g. cash, bank), transactions (income/expense/transfer) with category, date, note, tags; recurring transactions (rent, subscriptions).
- [P1] Monthly budgets per category with progress bars and warnings.
- [P1] Reports: spending by category (donut), over time (bars), income vs. expenses, monthly balance.
- [P1] CSV import with column mapping (to import bank exports), CSV export.
- [P1] Currency formatting via `Intl` (EUR default for DE locale).
- [P2] Savings goals with progress; subscription overview (total per month/year).
- [P2] Split expenses with friends (simple "who owes whom" calculator).

## 5.8 Calculator
- [P1] **Standard** and **scientific** modes (trig in deg/rad, logs, powers, roots, factorial, constants, memory, parentheses, history tape).
- [P1] **Programmer mode:** bin/oct/dec/hex side by side, word size (8/16/32/64-bit), signed/unsigned, bitwise AND/OR/XOR/NOT/shifts/rotates, clickable bit grid.
- [P1] An expression parser written by us (no `eval`), with unit tests; shared with the command palette's `=` mode.
- [P2] **Graphing mode:** plot multiple functions, zoom/pan, trace values, find roots/intersections numerically.
- [P2] Equation solver (linear systems, quadratic), matrix mode (add, multiply, determinant, inverse, transpose).
- [P3] Statistics mode (mean, median, standard deviation, regression from a data list).

## 5.9 Unit converter
- [P1] Length, area, volume, mass, temperature, time, speed, pressure, energy, power, angle, **data size (SI and IEC: kB vs KiB)**, data rate, frequency, fuel economy, cooking units.
- [P1] Two-way live conversion, favorites, recent conversions.
- [P2] Number bases and Roman numerals; shoe/clothing sizes.

## 5.10 Clock
- [P1] World clock (cities with time zones from `Intl`), analog + digital.
- [P1] Alarms (via the scheduler, honest about closed tabs), timers (multiple at once, named), stopwatch with laps and export.
- [P2] Time-zone planner ("find a meeting time across these 3 cities").

## 5.11 Password generator and vault
- [P1] Generator: length, character sets, exclude similar characters, passphrases from a bundled word list (EN and DE), strength estimate (entropy), copy with auto-clear of the clipboard after 30 s.
- [P1] Vault: entries (title, username, password, URL, notes, TOTP secret), encrypted with a master password (master brief §7), auto-lock after inactivity, search, categories.
- [P1] **TOTP code generator** (RFC 6238) with countdown, unit-tested against RFC test vectors.
- [P1] Clear statement in the UI: this vault lives only in this browser; back it up.
- [P2] Password health check (reused, weak, old passwords) — fully local.
- [P2] Import/export CSV (with a strong warning about unencrypted exports).

## 5.12 Bookmarks and reading list
- [P1] Bookmark collections with title, URL, tags, notes, favicon fallback (letter avatar, no network fetch); open in a new browser tab.
- [P1] Import/export browser bookmarks HTML format.
- [P2] Reading list with read/unread state.

## 5.13 Clipboard manager
- [P1] History of everything copied inside Nexus (via the clipboard service), search, pin entries, paste with one click, clear history, exclude password fields/vault.
- [P2] Snippets with variables (date, clipboard) and a shortcut to insert them.

## Done when
A student can plan a semester (timetable, exams), track grades with correct ECTS math, study with flashcards using real spaced repetition, track habits/budget/journal, and all of it shows up in the right places (Calendar, widgets, command palette, terminal) in English and German.
