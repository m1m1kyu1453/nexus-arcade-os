# Phase 6 — Office & Creative

Goal: lightweight but real office and creative apps. Each one saves to the VFS in an open format, so files can be opened with other apps or exported.

## 6.1 Nexus Sheets (spreadsheet)
- [P1] Grid with virtual scrolling (handles 10,000 × 100 cells smoothly), column/row headers, resize columns/rows, freeze rows/columns, multiple sheets (tabs).
- [P1] Selection (cells, ranges, whole rows/columns, keyboard extension with Shift+arrows), copy/paste (also to/from real spreadsheets as TSV), fill handle (drag to fill series and formulas).
- [P1] **Formula engine written by us:** cell references (A1, $A$1, ranges, cross-sheet refs), operators, dependency graph with incremental recalculation, circular reference detection, error values (`#DIV/0!`, `#REF!`, `#NAME?`, `#VALUE!`).
- [P1] Functions (at least): SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTIF, SUMIF, IF, IFS, AND, OR, NOT, ROUND, ABS, SQRT, POWER, MOD, CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TODAY, NOW, DATE, YEAR, MONTH, DAY, VLOOKUP, XLOOKUP, INDEX, MATCH, AVERAGEIF, STDEV, MEDIAN, RAND, RANDBETWEEN. Each one unit-tested.
- [P1] Formatting: number formats (number, currency, percent, date, custom decimals), bold/italic, text and fill color, alignment, borders, wrap.
- [P1] Sort and filter ranges; find & replace.
- [P1] File format: `.nsheet` (JSON) in the VFS; import/export CSV and TSV.
- [P2] Charts from a selected range (line, bar, pie, scatter) placed on the sheet.
- [P2] Conditional formatting (color scales, rules), data validation (dropdown lists).
- [P2] Undo/redo history with at least 100 steps.
- [P3] `.xlsx` import/export (only with an approved library).

## 6.2 Nexus Write (documents)
- [P1] Rich text editor: headings, bold/italic/underline/strike, lists, checklists, quotes, code blocks, links, tables, images, horizontal rules, text color and highlight.
- [P1] Page view with margins and paper sizes (A4/Letter), print styles so "Print → Save as PDF" gives a clean document.
- [P1] Document outline, word/character count, reading time.
- [P1] Save as `.ndoc` (structured JSON) in the VFS; export HTML, Markdown and plain text; import Markdown and HTML.
- [P2] Find & replace, spell check via the browser's built-in spell checker, footnotes, table of contents generation.
- [P2] Document templates (letter in DIN 5008 layout, CV, report, lab report).
- [P3] Comments and suggestion mode.

## 6.3 Whiteboard
- [P1] Infinite canvas with smooth pan/zoom (mouse, trackpad, pinch).
- [P1] Tools: select/move, pen (pressure-sensitive on supported devices), highlighter, eraser, rectangle, ellipse, line, arrow (with connectors that stay attached to shapes), text, sticky notes, image.
- [P1] Styling: stroke color/width, fill, opacity, font size; group/ungroup; layering (bring to front/back); alignment and distribution guides; snap to grid.
- [P1] Undo/redo, copy/paste, duplicate, keyboard shortcuts for tools.
- [P1] Save as `.nboard` in VFS; export PNG and SVG (selection or everything).
- [P2] Hand-drawn style option (sketchy rendering), templates (flowchart, retro, SWOT, Kanban).
- [P2] Presentation mode: frames as slides.
- [P3] Shape recognition (rough circle → perfect circle).

## 6.4 Mind Map
- [P1] Central topic, child nodes, keyboard-first editing (Tab = child, Enter = sibling, Delete, arrows to navigate), drag to rearrange, collapse/expand.
- [P1] Automatic layouts (radial, right-tree, org chart), node colors, icons, notes per node.
- [P1] Save to VFS; export PNG/SVG and as Markdown outline; import from Markdown outline.
- [P2] Turn a branch into tasks or into a note.

## 6.5 Paint
- [P1] Canvas with layers (add, delete, reorder, hide, opacity, blend modes), brushes (round, soft, pencil, spray), eraser, fill bucket (tolerance), shapes, text, eyedropper, selection (rectangle, lasso) with move/copy.
- [P1] Color picker with recent colors, palettes from Color Lab.
- [P1] Image adjustments: brightness/contrast, hue/saturation, invert, grayscale, blur (in a worker for large images).
- [P1] Undo/redo, zoom/pan, canvas resize/crop, open images from VFS, save as PNG/JPEG/WebP and as `.npaint` (layers kept).
- [P2] Pressure sensitivity, symmetry mode, custom brushes.

## 6.6 Pixel Art Studio
- [P1] Grid editor with configurable size (8×8 to 256×256), pencil, eraser, fill, line, rectangle, circle, mirror drawing, color palettes (preset retro palettes + custom).
- [P1] **Animation frames** with onion skinning, frame duration, playback preview.
- [P1] Export PNG (scaled), sprite sheet, and **animated GIF** (write a small GIF encoder or ask for a library).
- [P2] Use sprites in the Code Playground or as a custom cursor/wallpaper/avatar via intents.

## 6.7 Nexus Present (slides)
- [P2] Slides written in Markdown (`---` separates slides), themes matching the OS themes, code highlighting, math, images.
- [P2] Presenter mode in a second window (notes, timer, next slide), full-screen presentation, keyboard/clicker navigation.
- [P2] Export to a standalone HTML file and to PDF via print.

## 6.8 Document scanner / PDF tools
- [P3] Combine images to a PDF, view PDFs (browser viewer), only if a small approved library makes it feasible. Otherwise skip and record the cut.

## Done when
A user can make a real budget spreadsheet with formulas and a chart, write and print a formatted document, sketch ideas on a whiteboard and mind map, and draw/animate pixel art, with all files living in the VFS and opening from Explorer.
