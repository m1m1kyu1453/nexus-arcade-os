// @ts-check
// CodeMirror 6 for Nexus Edit: one EditorView per tab, with compartments for the language,
// word wrap and font size. Colours come from theme tokens and the shared `tok-*` classes
// (ui/content.css), so every Nexus theme styles the editor.
//
// Each view lives in a shadow root: CodeMirror then adds its styles as constructed style
// sheets, which the strict Content Security Policy allows (it blocks injected <style> tags).
// Theme tokens (CSS variables) inherit into the shadow root; content.css is adopted there too.
import { startCompletion } from '@codemirror/autocomplete';
import { indentWithTab, toggleComment } from '@codemirror/commands';
import { LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { gotoLine, openSearchPanel } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { classHighlighter } from '@lezer/highlight';
import { basicSetup, EditorView } from 'codemirror';
import contentCss from '../../ui/content.css?inline';

/** content.css (token colours) as one sheet shared by every editor's shadow root. */
let tokenSheet = /** @type {CSSStyleSheet | null} */ (null);
const tokenStyles = () => {
  if (!tokenSheet) {
    tokenSheet = new CSSStyleSheet();
    tokenSheet.replaceSync(contentCss);
  }
  return tokenSheet;
};

/** Search/go-to-line panel texts in German (English is CodeMirror's default). */
const PHRASES_DE = {
  Find: 'Suchen',
  Replace: 'Ersetzen',
  next: 'Weiter',
  previous: 'Zurück',
  all: 'Alle',
  'match case': 'Groß/klein',
  regexp: 'Regulärer Ausdruck',
  'by word': 'Ganzes Wort',
  replace: 'Ersetzen',
  'replace all': 'Alle ersetzen',
  close: 'Schließen',
  'current match': 'aktueller Treffer',
  'replaced $ matches': '$ Treffer ersetzt',
  'replaced match on line $': 'Treffer in Zeile $ ersetzt',
  'on line': 'in Zeile',
  'Go to line': 'Gehe zu Zeile',
  go: 'Los',
  'Folded lines': 'Eingeklappte Zeilen',
  'Unfolded lines': 'Ausgeklappte Zeilen',
  to: 'bis',
  'folded code': 'eingeklappter Code',
  unfold: 'ausklappen',
  'Fold line': 'Zeile einklappen',
  'Unfold line': 'Zeile ausklappen',
  'Control character': 'Steuerzeichen',
};

const theme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text-1)', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--accent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent) !important',
  },
  '.cm-gutters': {
    backgroundColor: 'color-mix(in srgb, var(--surface-1) 70%, transparent)',
    color: 'var(--text-3)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--surface-2) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--surface-2)', color: 'var(--text-1)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)', outline: 'none' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--accent-2) 18%, transparent)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--warning) 55%, transparent)' },
  '.cm-panels': { backgroundColor: 'var(--surface-1)', color: 'var(--text-1)', borderColor: 'var(--border)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '.cm-panel input, .cm-panel button': { font: 'inherit' },
  '.cm-textfield': {
    backgroundColor: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-1)',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--surface-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-1)',
  },
  '.cm-tooltip': { backgroundColor: 'var(--surface-2)', color: 'var(--text-1)', border: '1px solid var(--border)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-contrast)',
  },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--surface-3)', border: 'none', color: 'var(--text-2)' },
});

/** CodeMirror language for a file name (or null for plain text). @param {string} name */
export function languageFor(name) {
  return LanguageDescription.matchFilename(languages, name);
}

/**
 * @typedef {object} EditorOptions
 * @property {string} text
 * @property {string} name          file name (picks the language)
 * @property {'en' | 'de'} locale
 * @property {boolean} wrap
 * @property {number} fontSize
 * @property {boolean} readOnly
 * @property {(update: { docChanged: boolean, line: number, column: number, selected: number }) => void} onUpdate
 */

/** @param {EditorOptions} options */
export function createEditor({ text, name, locale, wrap, fontSize, readOnly, onUpdate }) {
  const language = new Compartment();
  const wrapping = new Compartment();
  const sizing = new Compartment();
  const editable = new Compartment();
  const phrases = new Compartment();
  const fontTheme = (/** @type {number} */ px) => EditorView.theme({ '&': { fontSize: `${px}px` } });

  const host = document.createElement('div');
  host.className = 'nx-edit-host';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = [tokenStyles()];

  const view = new EditorView({
    root: shadow,
    parent: shadow,
    state: EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        syntaxHighlighting(classHighlighter),
        theme,
        language.of([]),
        wrapping.of(wrap ? EditorView.lineWrapping : []),
        sizing.of(fontTheme(fontSize)),
        editable.of(EditorState.readOnly.of(readOnly)),
        phrases.of(locale === 'de' ? EditorState.phrases.of(PHRASES_DE) : []),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged && !u.selectionSet && !u.focusChanged) return;
          const head = u.state.selection.main.head;
          const lineInfo = u.state.doc.lineAt(head);
          const selected = u.state.selection.ranges.reduce((n, r) => n + (r.to - r.from), 0);
          onUpdate({ docChanged: u.docChanged, line: lineInfo.number, column: head - lineInfo.from + 1, selected });
        }),
        EditorView.contentAttributes.of({ 'aria-label': name }),
      ],
    }),
  });

  let languageName = /** @type {string | null} */ (null);
  /** Loads and applies the language for a file name. @param {string} fileName */
  async function setLanguage(fileName) {
    const description = languageFor(fileName);
    languageName = description?.name ?? null;
    const support = description ? await description.load() : null;
    view.dispatch({ effects: language.reconfigure(support ?? []) });
    return languageName;
  }
  void setLanguage(name);

  return {
    view,
    /** The element to put on the page (hosts the shadow root with the editor). */
    dom: host,
    get language() {
      return languageName;
    },
    setLanguage,
    get text() {
      return view.state.doc.toString();
    },
    /** Replaces the whole text (reload from disk), keeping the cursor where possible. @param {string} next */
    setText(next) {
      const head = Math.min(view.state.selection.main.head, next.length);
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, selection: { anchor: head } });
    },
    /** @param {boolean} on */
    setWrap: (on) => view.dispatch({ effects: wrapping.reconfigure(on ? EditorView.lineWrapping : []) }),
    /** @param {number} px */
    setFontSize: (px) => view.dispatch({ effects: sizing.reconfigure(fontTheme(px)) }),
    /** @param {boolean} on */
    setReadOnly: (on) => view.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(on)) }),
    /** @param {'en' | 'de'} next */
    setLocale: (next) =>
      view.dispatch({ effects: phrases.reconfigure(next === 'de' ? EditorState.phrases.of(PHRASES_DE) : []) }),
    find: () => openSearchPanel(view),
    gotoLine: () => gotoLine(view),
    toggleComment: () => toggleComment(view),
    complete: () => startCompletion(view),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}

/** @typedef {ReturnType<typeof createEditor>} Editor */
