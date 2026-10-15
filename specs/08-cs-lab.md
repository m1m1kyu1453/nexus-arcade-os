# Phase 8 — CS Lab (computer science learning tools)

Goal: interactive visual tools for the topics of a computer science (Informatik) degree: algorithms and data structures, theoretical CS, digital logic, computer architecture, databases. Every tool must be **correct** (unit-tested against known results) and **step-by-step** explainable.

## 8.0 Shared visualizer engine
- [P1] One reusable "step engine": algorithms are written as generators that `yield` steps (compare, swap, visit, highlight …); the UI provides play/pause, step forward/back, speed slider, restart, and shows counters (comparisons, swaps, visited nodes).
- [P1] A pseudocode panel that highlights the current line, in English and German.
- [P1] Every tool can save/load its state to the VFS and export the current view as PNG/SVG.

## 8.1 Sorting visualizer
- [P1] Algorithms: bubble, selection, insertion, shell, merge, quick (Lomuto and Hoare, pivot choices), heap, counting, radix (LSD), bucket.
- [P1] Inputs: random, sorted, reversed, nearly sorted, few unique values, custom list; size 5–500.
- [P1] Views: bars, dots, color wheel; synthesized sound per comparison (toggleable).
- [P1] Side-by-side race of 2–4 algorithms on the same input.
- [P2] Complexity panel: best/average/worst time, space, stable or not, in-place or not.

## 8.2 Pathfinding and maze lab
- [P1] Grid editor: walls, weights (e.g. mud = 5), start/goal, diagonal on/off.
- [P1] Algorithms: BFS, DFS, Dijkstra, A* (Manhattan/Euclidean/Chebyshev heuristics), Greedy best-first, bidirectional BFS.
- [P1] Maze generators: recursive backtracker, Prim, Kruskal, recursive division.
- [P1] Stats: nodes visited, path length, path cost, time.

## 8.3 Graph editor & algorithms
- [P1] Draw graphs: add/move/delete nodes and edges, directed/undirected, weighted, labels; auto-layout (force-directed, circular, grid).
- [P1] Algorithms with step mode: BFS, DFS (with discovery/finish times), Dijkstra, Bellman-Ford (with negative-cycle detection), Floyd-Warshall (distance matrix), Prim, Kruskal (with union-find shown), topological sort, strongly connected components (Tarjan/Kosaraju), bipartite check, cycle detection.
- [P2] Max flow (Edmonds-Karp) with residual graph; Euler path; graph coloring (greedy).
- [P1] Import/export as adjacency list/matrix, edge list, and DOT; preset example graphs.

## 8.4 Data structures visualizer
- [P1] Array/dynamic array (with resizing), stack, queue, circular buffer, singly/doubly linked list, binary search tree, **AVL tree** (rotations animated), **binary heap** (array + tree view), hash table (chaining and open addressing with linear/quadratic probing, load factor and rehash), trie.
- [P1] Operations via buttons and a mini command line (`insert 5`, `delete 3`, `search 7`), each animated with explanations.
- [P2] Red-black tree, B-tree (order configurable), skip list, union-find, segment tree.

## 8.5 Automata lab
- [P1] Editor for **DFA and NFA (with ε)**: states, start, accepting, transitions; validation (e.g. DFA completeness).
- [P1] Simulate a word step by step (with all active states for NFAs), batch test many words.
- [P1] Conversions: NFA → DFA (subset construction, step-by-step), DFA minimization (table-filling or Hopcroft), regex → ε-NFA (Thompson), DFA → regex (state elimination, P2).
- [P1] Set operations: complement, union, intersection, product construction.
- [P2] Pushdown automata simulator; context-free grammar tools (CYK algorithm, first/follow sets, remove left recursion).
- [P2] Equivalence check of two automata with a counterexample word.

## 8.6 Turing machine simulator
- [P1] Single-tape TM editor (state table and diagram views), tape visualization with head movement, step/run/speed, step counter, halting detection with a step limit.
- [P1] Example machines: binary increment, palindrome check, unary addition, copy, busy beaver (2–4 states).
- [P2] Multi-tape machines.

## 8.7 Logic circuit simulator
- [P1] Canvas editor: inputs (switches, clock), outputs (LEDs, 7-segment display), gates (AND, OR, NOT, NAND, NOR, XOR, XNOR, buffer), wires with routing and junctions.
- [P1] Real-time simulation with signal colors; truth table generation for the whole circuit.
- [P1] Presets: half adder, full adder, 4-bit ripple-carry adder, multiplexer, decoder, SR latch, D flip-flop.
- [P2] Custom components (save a circuit as a reusable block with pins); JK/T flip-flops, counters, registers.
- [P2] Timing diagram view.

## 8.8 Boolean algebra tool
- [P1] Parse expressions (`(A ∧ B) ∨ ¬C`, also `A&B|!C` and `AB + C'`), generate truth tables, check equivalence of two expressions, tautology/contradiction check.
- [P1] **KV maps (Karnaugh)** for 2–4 variables (P2: 5–6) with interactive grouping and suggested optimal groups.
- [P1] Minimization with Quine-McCluskey (prime implicant table shown), output as DNF and CNF.
- [P2] Convert expressions to NAND-only/NOR-only and open the result in the circuit simulator.

## 8.9 Number representation lab
- [P1] Integer formats: unsigned, sign-magnitude, one's complement, **two's complement**, with bit width 4–64; overflow demonstration in addition/subtraction.
- [P1] **IEEE 754 inspector** (half, single, double): sign/exponent/mantissa bits clickable, special values (±0, ±∞, NaN, subnormals), decimal ↔ float with rounding error shown, "why is 0.1 + 0.2 ≠ 0.3".
- [P1] Base conversions with the step-by-step division/multiplication method shown (exam style).
- [P2] Fixed-point formats, BCD, Gray code, Hamming code (encode, flip a bit, detect/correct), parity, CRC step-by-step.
- [P2] Character encodings: ASCII table, UTF-8/UTF-16 byte breakdown of any text.

## 8.10 SQL playground
- [P1] SQLite in the browser via **sql.js (WASM, lazy-loaded and cached for offline; needs approval)**.
- [P1] Editor with highlighting and autocomplete of table/column names, run query (`Mod+Enter`), results table, error messages, query history.
- [P1] Schema browser; sample databases (university: students, courses, enrollments, professors; shop; movies) created from bundled SQL scripts.
- [P1] Databases saved in the VFS (`.sqlite`), import/export `.sqlite` and `.sql`.
- [P2] ER diagram generated from the schema; query plan (`EXPLAIN QUERY PLAN`) view.
- [P2] Relational algebra → SQL translator for simple expressions (σ, π, ⋈, ∪, −).

## 8.11 Toy CPU / assembly simulator
- [P2] "Nexus-8": a small 8-bit CPU with a documented instruction set (load/store, ALU ops, jumps, stack, I/O), an assembler with error messages, memory and register view, step execution, breakpoints, a memory-mapped pixel display and keyboard input.
- [P2] Example programs (counter, Fibonacci, bubble sort, a tiny Snake).
- [P3] A MIPS or RISC-V subset mode for university courses.

## 8.12 Other CS tools
- [P2] **Big-O playground:** plot growth functions (1, log n, n, n log n, n², 2ⁿ, n!) and compare with measured run times of real JS implementations run in a worker.
- [P2] **Scheduling simulator (OS course):** FCFS, SJF, SRTF, Round Robin, priority; Gantt chart, waiting/turnaround times.
- [P2] **Page replacement simulator:** FIFO, LRU, Optimal, Clock; page fault count.
- [P3] **Python playground** via Pyodide (large: lazy-loaded, cached on first use, with a size warning; needs approval).
- [P3] **Network lab:** subnet calculator (IPv4/IPv6, CIDR), packet encapsulation visualizer.

## Done when
A CS student can learn and verify exam-style exercises: run any listed algorithm step by step, build and convert automata, design and simulate logic circuits, minimize Boolean functions, inspect number formats, and practice SQL — all offline, all correct according to unit tests.
