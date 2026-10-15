# Phase 10 — More games

Goal: a big, varied arcade. All games use the phase 9 engine and get the same baseline: pause menu, settings, keyboard + touch + gamepad where it makes sense, high scores, statistics, achievements, XP, EN/DE text, and colorblind-friendly visuals.

**Originality rule:** use original names and original art. Games may be inspired by classic genres, but must not copy trademarked names, logos, characters, level layouts or music of existing commercial games.

Build in tier order. Finish a game completely before starting the next one.

## Tier 1 [P1]
- **Blockfall** (falling-blocks puzzle): 7 standard piece shapes, rotation system with wall kicks, hold piece, next queue (5), ghost piece, hard/soft drop, lock delay, line-clear animations, levels and speed curve, T-spin-style bonus moves, modes: marathon, sprint (40 lines), ultra (2 minutes), zen.
- **Minesweeper:** beginner/intermediate/expert/custom, first click always safe (and opens an area), chording, flags and question marks, timer, no-guess board generator option (P2).
- **Void Drifter** (asteroids-style): vector graphics with glow, inertia flight, splitting asteroids, UFO enemies, waves, hyperspace with risk, power-ups (shield, triple shot, rapid fire), particles and screen shake.
- **Sudoku:** generator with unique solutions at 5 difficulty levels (rated by required techniques), pencil marks, auto-notes, highlight same numbers, mistakes check (optional), hints that explain the technique (naked single, hidden single, pairs …), timer, daily puzzle.
- **Typing Trainer:** WPM/accuracy/consistency, lessons for touch typing (QWERTY and QWERTZ layouts with an on-screen keyboard and finger hints), modes: words, quotes (bundled, public-domain or own), **code typing** (snippets in JS/Python/Java/C), German text mode with umlauts, error heatmap per key, progress graphs.
- **Neon Pong:** vs AI (3 difficulties), local 2-player, ball spin, power-ups mode, first to 11.

## Tier 2 [P2]
- **Solitaire collection:** Klondike (draw 1/3), Spider (1/2/4 suits), FreeCell; drag & drop and click-to-move, auto-complete, undo, solvable-deal option, statistics.
- **Nexus Chess:** full rules (castling, en passant, promotion, draw by repetition/50 moves/stalemate/insufficient material), legal move highlighting, AI in a Web Worker (alpha-beta with iterative deepening, piece-square tables, several strength levels), local 2-player, PGN import/export, move list with navigation, board flip, puzzle mode with bundled puzzles (generated or public domain), analysis arrows.
- **Connect Four:** vs AI (minimax, difficulty levels), local 2-player, win highlighting.
- **Grid Invaders** (fixed-shooter): waves, shields, diving enemies, boss waves, power-ups.
- **Neon Glide** (one-button flyer): procedurally generated obstacles, ghost of your best run.
- **Nonogram:** puzzles from bundled packs (5×5 to 25×25) and generated ones, line-check helper, X marks.
- **Block Pusher** (sokoban-style): 60+ levels (generated with a solver to verify they're solvable, or self-made), undo, move counter, level editor.
- **Hexword** (word-guessing game): 5-letter words in EN and DE with **self-curated, license-clean word lists**, hard mode, statistics, share result as emoji grid (copy to clipboard), daily word by seed.
- **Checkers / Dame:** international rules choice, AI, forced captures.
- **Battleships:** vs AI with probability-based targeting, ship placement editor.

## Tier 3 [P3]
- **Grid Defense** (tower defense): 10+ maps, 6 tower types with upgrades, enemy types, waves, speed controls.
- **Pixel Runner** (platformer): tight controls (coyote time, jump buffering, variable jump height), 20+ levels, collectibles, **level editor** using Pixel Art Studio sprites, share levels as files.
- **Neon Racer** (top-down racing): tracks, AI opponents, lap times, ghost cars.
- **Ultimate Tic-Tac-Toe:** vs AI (MCTS in a worker) and 2-player.
- **Mahjong Solitaire:** layouts, shuffle, hint, only solvable deals.
- **Match-3 puzzle:** combos, special tiles, level goals.
- **Bubble shooter:** aim with bank shots, color matching, levels.
- **Game of Life & cellular automata sandbox:** draw patterns, step/run, pattern library (glider, gun …), other rules (HighLife, Seeds, Brian's Brain).
- **Quiz arena:** quiz packs (CS basics, general knowledge EN/DE, written by us), user-made quiz packs, timer, streaks.

## Arcade-wide additions
- [P2] Local multiplayer lobby screen for games that support it (assign gamepads/keyboard sides).
- [P2] Seasonal/rotating "featured game" on the Arcade home and a "random game" button.
- [P3] Online multiplayer is **out of scope** (no backend). Don't fake it.

## Done when
All Tier 1 games are complete and polished; Tier 2 progress is recorded in `PROGRESS.md`; every game passes its rule unit tests (e.g. chess move generation perft tests, Sudoku uniqueness, Minesweeper first-click safety, Blockfall rotation/kick tables).
