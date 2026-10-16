// @ts-check
// Markdown → sanitized HTML (GitHub-flavoured, via marked + DOMPurify, both loaded on first use).
// Use this for every piece of user or app Markdown: the output is safe to put into innerHTML.
// Links to other sites open in a new tab; nothing is fetched while rendering.
import './content.css';

/** @type {Promise<(markdown: string) => string> | null} */
let renderer = null;

function load() {
  renderer ??= Promise.all([import('marked'), import('dompurify')]).then(([{ Marked }, { default: DOMPurify }]) => {
    const marked = new Marked({ gfm: true, breaks: false, async: false });
    const purify = DOMPurify(window);
    purify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      // Remote images would be a network request (privacy): only data:/blob: URLs load.
      if (node.tagName === 'IMG' && !/^(data|blob):/i.test(node.getAttribute('src') ?? '')) {
        node.setAttribute('data-blocked-src', node.getAttribute('src') ?? '');
        node.removeAttribute('src');
      }
    });
    return (/** @type {string} */ markdown) =>
      purify.sanitize(/** @type {string} */ (marked.parse(markdown)), {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
        FORBID_ATTR: ['style'],
      });
  });
  return renderer;
}

/**
 * Renders Markdown to sanitized HTML.
 * @param {string} markdown
 * @returns {Promise<string>}
 */
export async function renderMarkdown(markdown) {
  return (await load())(markdown);
}

/**
 * Renders Markdown into an element (adds the `nx-markdown` content styles).
 * @param {HTMLElement} el
 * @param {string} markdown
 */
export async function renderMarkdownInto(el, markdown) {
  el.classList.add('nx-markdown');
  el.innerHTML = await renderMarkdown(markdown);
  return el;
}
