// Help: general guides (EN/DE) and every app's help page, with search and a table of contents.
// F1 anywhere opens the page of the focused app. Links like `help:nexus.files` or
// `help:general/backups` jump between pages. Nothing runs at import time.
import { h, icon } from '../../ui/dom.js';
import { highlight } from '../../ui/highlight.js';
import { renderMarkdownInto } from '../../ui/markdown.js';
import './styles.css';

const GENERAL = ['getting-started', 'shortcuts', 'offline', 'backups', 'privacy', 'faq'];
/** Lazy raw Markdown of the general guides: './docs/<locale>/<id>.md'. */
const DOCS = import.meta.glob('./docs/*/*.md', { query: '?raw', import: 'default' });

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'help.open': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.help' }),
  /** F1: help for the app in the focused window (or the start page). */
  'help.forApp': (ctx) => {
    const focused = ctx.system?.windows.list().find((w) => w.focused);
    const page = focused && focused.appId !== 'nexus.help' ? `app/${focused.appId}` : 'general/getting-started';
    return ctx.commands.execute('shell.launchApp', {
      appId: 'nexus.help',
      args: { intent: { action: 'open', type: 'application/x-nexus-help', data: { page } } },
    });
  },
};

/** @type {import('../../kernel/types').AppModule['mount']} */
export function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const system = /** @type {NonNullable<typeof ctx.system>} */ (ctx.system);
  const local = (/** @type {import('../../kernel/types').L10n} */ text) => text[ctx.i18n.locale] ?? text.en;
  const saved = /** @type {{ page?: string } | undefined} */ (args.restoredState);
  const requested = /** @type {any} */ (args.intent?.data)?.page;
  let page = typeof requested === 'string' ? requested : (saved?.page ?? 'general/getting-started');
  let token = 0;
  /** @type {Map<string, string>} page id → Markdown, for search */
  const cache = new Map();

  const search = h('input', {
    class: 'nx-input',
    type: 'search',
    placeholder: t('search'),
    'aria-label': t('search'),
    dataset: { testid: 'help-search' },
  });
  const nav = h('nav', { class: 'nx-help-nav', 'aria-label': t('pages') });
  const results = h('div', { class: 'nx-help-results', hidden: true, role: 'listbox', 'aria-label': t('results') });
  const article = h('article', {
    class: 'nx-help-article nx-markdown',
    tabindex: '-1',
    dataset: { testid: 'help-article' },
  });
  const toc = h('nav', { class: 'nx-help-toc', 'aria-label': t('toc') });
  const notice = h('p', { class: 'nx-help-notice', hidden: true });
  const root = h(
    'div',
    { class: 'nx-help', dataset: { testid: 'help' } },
    h('aside', { class: 'nx-help-side' }, search, results, nav),
    h('main', { class: 'nx-help-main' }, notice, article),
    toc,
  );
  container.replaceChildren(root);

  const appPages = () =>
    system.apps
      .list()
      .filter((a) => a.hasHelp)
      .sort((a, b) => local(a.name).localeCompare(local(b.name), ctx.i18n.locale));
  const titleOf = (/** @type {string} */ id) => {
    if (id.startsWith('general/')) return t(`general.${id.slice(8)}`);
    const app = system.apps.get(id.slice(4));
    return app ? local(app.name) : id;
  };

  /** Markdown of a page in the current language (English as fallback). @param {string} id */
  async function source(id) {
    const key = `${ctx.i18n.locale}:${id}`;
    const hit = cache.get(key);
    if (hit !== undefined) return { md: hit, english: false };
    if (id.startsWith('general/')) {
      const name = id.slice(8);
      const load = DOCS[`./docs/${ctx.i18n.locale}/${name}.md`] ?? DOCS[`./docs/en/${name}.md`];
      if (!load) return null;
      const md = /** @type {string} */ (await load());
      cache.set(key, md);
      return { md, english: false };
    }
    const md = await system.apps.help(id.slice(4));
    if (md === null) return null;
    cache.set(key, md);
    // App pages are written in English so far.
    return { md, english: ctx.i18n.locale !== 'en' };
  }

  function renderNav() {
    const item = (/** @type {string} */ id, /** @type {string} */ iconName) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `nx-help-link${id === page ? ' is-current' : ''}`,
            'aria-current': id === page ? 'page' : undefined,
            dataset: { page: id, testid: 'help-page' },
            onclick: () => void show(id),
          },
          icon(iconName, { size: 16 }),
          h('span', { text: titleOf(id) }),
        ),
      );
    nav.replaceChildren(
      h('h3', { text: t('nexus') }),
      h('ul', {}, ...GENERAL.map((g) => item(`general/${g}`, GENERAL_ICONS[g] ?? 'book'))),
      h('h3', { text: t('apps') }),
      h('ul', {}, ...appPages().map((a) => item(`app/${a.id}`, a.icon))),
    );
  }

  /**
   * @param {string} id
   * @param {string} [find] text to scroll to
   */
  async function show(id, find) {
    const mine = ++token;
    page = id;
    renderNav();
    const doc = await source(id);
    if (mine !== token) return;
    if (!doc) {
      article.replaceChildren(h('p', { class: 'nx-empty', text: t('missing') }));
      toc.replaceChildren();
      return;
    }
    notice.hidden = !doc.english;
    notice.textContent = t('english');
    await renderMarkdownInto(article, doc.md);
    if (mine !== token) return;
    decorate();
    ctx.window?.setTitle(`${titleOf(id)} — ${t('title')}`);
    ctx.window?.stateChanged();
    article.scrollTop = 0;
    if (find) scrollToText(find);
    else article.focus({ preventScroll: true });
  }

  /** Heading ids, table of contents, code highlighting, help: links. */
  function decorate() {
    const headings = /** @type {HTMLElement[]} */ ([...article.querySelectorAll('h2, h3')]);
    headings.forEach((el, i) => (el.id = `nx-help-h-${i}`));
    toc.replaceChildren(
      ...(headings.length
        ? [
            h('h3', { text: t('toc') }),
            h(
              'ul',
              {},
              ...headings.map((el) =>
                h(
                  'li',
                  { class: el.tagName === 'H3' ? 'is-sub' : '' },
                  h('button', {
                    type: 'button',
                    class: 'nx-help-toc-link',
                    text: el.textContent ?? '',
                    onclick: () => el.scrollIntoView({ block: 'start' }),
                  }),
                ),
              ),
            ),
          ]
        : []),
    );
    for (const code of article.querySelectorAll('pre > code')) {
      const lang = /language-(\w+)/.exec(code.className)?.[1];
      if (!lang) continue;
      void highlight(code.textContent ?? '', `x.${EXT[lang] ?? lang}`).then(({ fragment }) =>
        code.replaceChildren(fragment),
      );
    }
  }

  /** @param {string} text */
  function scrollToText(text) {
    const needle = text.toLowerCase();
    const block = /** @type {HTMLElement | undefined} */ (
      [...article.querySelectorAll('h1, h2, h3, p, li, td, pre')].find((el) =>
        el.textContent?.toLowerCase().includes(needle),
      )
    );
    if (!block) return;
    block.scrollIntoView({ block: 'center' });
    block.classList.add('is-found');
    setTimeout(() => block.classList.remove('is-found'), 2000);
  }

  // Links between pages; web links open in a new tab (set by ui/markdown.js).
  article.addEventListener('click', (e) => {
    const a = /** @type {HTMLAnchorElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('a'));
    const href = a?.getAttribute('href') ?? '';
    if (!href.startsWith('help:')) return;
    e.preventDefault();
    const target = href.slice(5);
    void show(target.startsWith('general/') ? target : `app/${target}`);
  });

  // ─── Search over every page ────────────────────────────────────────────
  async function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      nav.hidden = false;
      return;
    }
    const ids = [...GENERAL.map((g) => `general/${g}`), ...appPages().map((a) => `app/${a.id}`)];
    const docs = await Promise.all(ids.map(async (id) => ({ id, doc: await source(id) })));
    if (search.value.trim().toLowerCase() !== q) return;
    /** @type {{ id: string, snippet: string, score: number }[]} */
    const hits = [];
    for (const { id, doc } of docs) {
      if (!doc) continue;
      const title = titleOf(id).toLowerCase();
      const lines = doc.md.split('\n').map((l) => l.replace(/[#*`|<>[\]]|\(help:[^)]*\)|kbd|\/kbd/g, '').trim());
      const line = lines.find((l) => l.toLowerCase().includes(q));
      if (!title.includes(q) && !line) continue;
      hits.push({ id, snippet: line ?? '', score: (title.includes(q) ? 2 : 0) + (line ? 1 : 0) });
    }
    hits.sort((a, b) => b.score - a.score);
    nav.hidden = true;
    results.hidden = false;
    results.replaceChildren(
      ...(hits.length
        ? hits.map((hit) =>
            h(
              'button',
              {
                type: 'button',
                role: 'option',
                class: 'nx-help-result',
                dataset: { testid: 'help-result' },
                onclick: () => {
                  const find = hit.snippet ? q : undefined;
                  search.value = '';
                  void runSearch();
                  void show(hit.id, find);
                },
              },
              h('strong', { text: titleOf(hit.id) }),
              hit.snippet
                ? h('span', { text: hit.snippet.length > 110 ? `${hit.snippet.slice(0, 110)}…` : hit.snippet })
                : null,
            ),
          )
        : [h('p', { class: 'nx-empty', text: t('noResults') })]),
    );
  }
  search.addEventListener('input', () => void runSearch());
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') /** @type {HTMLElement | null} */ (results.querySelector('.nx-help-result'))?.click();
    if (e.key === 'ArrowDown') /** @type {HTMLElement | null} */ (results.querySelector('.nx-help-result'))?.focus();
  });

  ctx.shortcuts.register('Mod+F', () => search.focus(), { allowInInputs: true });
  ctx.i18n.onChange(() => {
    search.placeholder = t('search');
    void show(page);
  });
  ctx.events.on('app:enabled-changed', () => renderNav());

  void show(page);
  return {
    saveState: () => ({ page }),
    onIntent(intent) {
      const next = /** @type {any} */ (intent.data)?.page;
      if (typeof next === 'string') void show(next);
    },
  };
}

/** @type {Record<string, string>} */
const GENERAL_ICONS = {
  'getting-started': 'sparkles',
  shortcuts: 'keyboard',
  offline: 'offline',
  backups: 'archive',
  privacy: 'shield',
  faq: 'help',
};

/** Code block language → file extension for the highlighter. */
const EXT = /** @type {Record<string, string>} */ ({
  sh: 'sh',
  bash: 'sh',
  js: 'js',
  javascript: 'js',
  json: 'json',
  css: 'css',
  html: 'html',
  py: 'py',
  python: 'py',
  md: 'md',
});
