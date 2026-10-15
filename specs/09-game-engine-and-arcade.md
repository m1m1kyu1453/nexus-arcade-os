# Phase 9 — Game engine & Arcade

Goal: a shared engine that makes games fast to build and consistent to play, the Arcade hub, and the first five polished games. Quality over quantity: each game should feel juicy (screen shake, particles, sound, smooth animation) and fair.

## 9.1 Game engine (`src/games/engine/`)
- [P1] **Loop:** fixed-timestep update (e.g. 60 Hz) with interpolated rendering, pause/resume, time scaling (slow motion), automatic pause when the window loses focus, is minimized, or the tab is hidden.
- [P1] **Rendering:** Canvas 2D with high-DPI scaling, letterboxing for fixed-resolution games, a camera (position, zoom, shake), sprite drawing from generated or bundled sprites, text rendering with the OS fonts.
- [P1] **Input:** keyboard, mouse, **touch** (virtual joystick/buttons, swipe gestures), **Gamepad API** (standard mapping, rumble where supported), rebindable controls stored per game; an input abstraction ("actions" like `left`, `jump`, `fire`).
- [P1] **Scenes/states:** title, playing, paused, game over, with transitions.
- [P1] **Helpers:** vector math, collision (AABB, circle, SAT for polygons), tweening/easing, timers, object pools, particle system, seeded random (for daily challenges and replays).
- [P1] **Audio:** synthesized sound effects (jsfxr-like generator written by us: jump, coin, explosion, hit, power-up), chiptune music player for simple pattern-based songs, volume per channel.
- [P1] **Common UI:** pause menu (resume, restart, settings, controls, quit), game-over screen with score and new-record celebration, settings (sound, music, difficulty, controls, colorblind palette).
- [P1] **Services:** high scores (local leaderboard per mode/difficulty, top 10 with name and date), statistics per game, achievements (via the OS achievement service), XP awarded after each game.
- [P2] **Replays:** record inputs + seed, play back deterministic replays, share as a file.
- [P2] **Daily challenge:** a seed based on the date gives everyone the same level/board each day; separate leaderboard and streak.

## 9.2 Arcade hub
- [P1] Library of all games with cover art (generated in-game screenshots or vector art), genre, best score, play time, achievements progress.
- [P1] Player profile: level and XP bar, total play time, achievements gallery (locked/unlocked/secret), recent games.
- [P1] Filters (genre, multiplayer, controller support), favorites, "continue" for games with saved state.
- [P1] Gamepad navigation of the entire hub.
- [P2] Daily challenges page with streaks.
- [P2] "Arcade cabinet" mode: full-screen hub for TV/gamepad use.

## 9.3 Snake Evolution
- [P1] Smooth interpolated movement (not tile-jumping), responsive input buffering (queue turns so fast inputs aren't lost).
- [P1] Maps: classic open, walls, maze, portals, moving obstacles, wrap-around (at least 6).
- [P1] Difficulties (speed curves), modes: classic, time attack, survival, zen (no death).
- [P1] Power-ups: speed boost, slow-mo, ghost (pass through self), shrink, magnet, double points, shield.
- [P1] Achievements (e.g. length 50, no power-ups run, all maps), high scores per map/mode.
- [P2] Local 2-player (same keyboard or two gamepads); AI snakes in a battle mode.

## 9.4 Breakout
- [P1] Ball physics with angle control depending on where the ball hits the paddle, speed increase, no tunneling at high speed (continuous collision).
- [P1] Block types: normal, multi-hit (shows damage), unbreakable, explosive (chain reactions), moving, power-up carriers.
- [P1] Power-ups: wide/narrow paddle, multi-ball, laser, sticky paddle, slow ball, extra life, fireball.
- [P1] At least 30 handcrafted levels in level packs, progression, lives, score multipliers.
- [P1] **Level editor**: place blocks on the grid, test play, save to VFS, share as a file.
- [P2] Boss levels; endless random level mode.

## 9.5 Memory Master
- [P1] Grid sizes (4×4 up to 8×8), themes for card faces (icons from the OS icon set, colors, numbers, emoji, CS terms), flip animation.
- [P1] Timer, move counter, score with combo bonus, star rating.
- [P1] Statistics: best times per size, average moves, games played.
- [P2] Modes: classic, time attack, "triple" (match three), local 2-player alternating turns.

## 9.6 2048
- [P1] Correct merge rules (unit-tested: each tile merges once per move, direction order), smooth slide/merge/spawn animations, swipe and keyboard controls.
- [P1] Undo (configurable number of steps), board sizes 3×3 to 8×8, continue after 2048.
- [P1] High scores per board size, best tile statistics.
- [P2] Variants: Fibonacci tiles, 3-in-a-row merges; a hint/AI solver (expectimax in a worker) that can suggest moves.

## 9.7 Reaction Trainer
- [P1] Classic test: wait for green, click; detect false starts; average of 5 with min/max.
- [P1] More tests: aim trainer (targets of varying size), sequence memory, number memory, visual memory grid, typing reaction, choice reaction (press the correct key for the color).
- [P1] History graphs per test, personal records, percentile against bundled typical-human reference data.

## Done when
The engine powers all five games with consistent menus, input (keyboard, touch, gamepad), sound, high scores and achievements; the Arcade hub shows profile/level/achievements; games pause correctly; and each game is genuinely fun to play for more than 5 minutes.
