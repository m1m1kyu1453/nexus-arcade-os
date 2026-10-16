# Nexus Edit

A text and code editor for your Nexus files, with syntax colors for many languages (JavaScript,
TypeScript, Python, HTML, CSS, JSON, Markdown, SQL, Rust, Go, C, Java, YAML and more).

## Files

- **Open** files from the toolbar (<kbd>Ctrl</kbd>+<kbd>O</kbd>), with "Open with…" in the File
  Explorer, by double-clicking a text file, or by dragging files from the File Explorer (or from
  your computer) into the editor.
- **New file:** <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>. **Save:** <kbd>Ctrl</kbd>+<kbd>S</kbd>,
  **Save as:** <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>.
- Each file opens in its own tab. A dot on a tab means unsaved changes. Close a tab with
  <kbd>Ctrl</kbd>+<kbd>W</kbd> or a middle click.
- Closing asks before anything unsaved is lost. If the page reloads, unsaved text comes back.
- If a file changes somewhere else (for example in the Terminal) while it's open, an unchanged
  tab reloads by itself; with your own changes you choose which version to keep.

## Editing

| Action                 | Keys                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Find / replace         | <kbd>Ctrl</kbd>+<kbd>F</kbd> (regular expressions, match case, whole word)               |
| Go to line             | <kbd>Ctrl</kbd>+<kbd>G</kbd>                                                             |
| Select next occurrence | <kbd>Ctrl</kbd>+<kbd>D</kbd> (several cursors)                                           |
| More cursors           | <kbd>Alt</kbd>+click; <kbd>Alt</kbd>+drag for a rectangle                                |
| Indent / outdent       | <kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd>                                         |
| Comment line           | <kbd>Ctrl</kbd>+<kbd>/</kbd>                                                             |
| Undo / redo            | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd>                              |
| Word wrap              | <kbd>Alt</kbd>+<kbd>Z</kbd>                                                              |
| Text size              | <kbd>Ctrl</kbd>+<kbd>=</kbd>, <kbd>Ctrl</kbd>+<kbd>-</kbd>, <kbd>Ctrl</kbd>+<kbd>0</kbd> |
| Markdown preview       | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd> (side by side, for .md files)                |

Press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to move focus out of the editor with the keyboard.

## Status bar

Shows the cursor line and column, the language, the encoding (always UTF-8) and the line endings.
Click the line endings (LF, CRLF, CR) to change them for the next save, and the size to reset
the zoom.
