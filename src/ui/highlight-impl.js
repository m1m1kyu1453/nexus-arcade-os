// @ts-check
// Lazy part of ui/highlight.js (pulls in the CodeMirror language data and the Lezer highlighter).
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { classHighlighter, highlightCode } from '@lezer/highlight';

/** Files above this size are shown as plain text (parsing them would block the UI). */
const MAX_HIGHLIGHT = 200_000;

/** @param {string} filename */
export function languageFor(filename) {
  return LanguageDescription.matchFilename(languages, filename);
}

/**
 * @param {string} code
 * @param {string} filename
 */
export async function highlight(code, filename) {
  const fragment = document.createDocumentFragment();
  const description = languageFor(filename);
  if (!description || code.length > MAX_HIGHLIGHT) {
    fragment.append(code);
    return { fragment, language: description?.name ?? null };
  }
  const support = await description.load();
  const tree = support.language.parser.parse(code);
  highlightCode(
    code,
    tree,
    classHighlighter,
    (text, classes) => {
      if (!classes) fragment.append(text);
      else {
        const span = document.createElement('span');
        span.className = classes;
        span.textContent = text;
        fragment.append(span);
      }
    },
    () => fragment.append('\n'),
  );
  return { fragment, language: description.name };
}
