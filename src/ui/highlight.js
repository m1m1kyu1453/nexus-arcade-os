// @ts-check
// Read-only syntax highlighting for previews (Explorer, Help code blocks). Uses CodeMirror's
// parsers (loaded on first use, per language) and emits spans with `tok-*` classes that
// ui/content.css colours from theme tokens. Unknown languages fall back to plain text.
import './content.css';

/** @type {Promise<typeof import('./highlight-impl.js')> | null} */
let impl = null;

/**
 * Highlights `code` for a file name (the language is picked from the extension).
 * @param {string} code
 * @param {string} filename
 * @returns {Promise<{ fragment: DocumentFragment, language: string | null }>}
 */
export async function highlight(code, filename) {
  impl ??= import('./highlight-impl.js');
  return (await impl).highlight(code, filename);
}

/** Language name for a file name (e.g. "JavaScript"), or null. @param {string} filename */
export async function languageName(filename) {
  impl ??= import('./highlight-impl.js');
  return (await impl).languageFor(filename)?.name ?? null;
}
