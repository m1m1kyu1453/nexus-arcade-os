// Settings: every system setting and every app's settings, grouped in pages, with search and
// deep links (from the command palette's @ mode, from apps and notifications). Nothing runs at
// import time.
import { h, icon } from '../../ui/dom.js';
import { rowId, settingRow } from './form.js';
import { apps, privacy, storage } from './pages/data.js';
import { accessibility, desktop, language, notifications, personalization, windows } from './pages/general.js';
import { profiles } from './pages/profiles.js';
import { shortcuts } from './pages/shortcuts.js';
import { about, backup, updates } from './pages/system.js';
import './styles.css';

/** @typedef {import('./pages/types.js').Page} Page */

/** In the order of the spec: Personalization … About. */
const PAGES = [
  personalization,
  desktop,
  windows,
  notifications,
  shortcuts,
  language,
  profiles,
  storage,
  apps,
  privacy,
  accessibility,
  backup,
  updates,
  about,
];
const byId = new Map(PAGES.map((p) => [p.id, p]));

/** Page that shows a system setting (the first page listing it). @param {string} key */
const pageOfKey = (key) => PAGES.find((p) => p.keys?.includes(key))?.id ?? null;

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  // The link travels as an intent, so an open Settings window (single instance) follows it too.
  'settings.open': (ctx, args) =>
    ctx.commands.execute('shell.launchApp', {
      appId: 'nexus.settings',
      args: { intent: { action: 'open', type: 'application/x-nexus-settings', data: args ?? {} } },
    }),
};

/** @type {import('../../kernel/types').AppModule['mount']} */
export function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const system = /** @type {NonNullable<typeof ctx.system>} */ (ctx.system);
  const local = (/** @type {import('../../kernel/types').L10n | string} */ text) =>
    typeof text === 'string' ? text : (text[ctx.i18n.locale] ?? text.en);
  const saved = /** @type {{ page?: string } | undefined} */ (args.restoredState);
  /** @type {Record<string, unknown>} */
  const link = /** @type {any} */ (args.intent?.data ?? args);
  let current = byId.has(String(link.page)) ? String(link.page) : (saved?.page ?? 'personalization');
  let renderToken = 0;

  const search = h('input', {
    class: 'nx-input nx-set-search',
    type: 'search',
    placeholder: t('search'),
    'aria-label': t('search'),
    dataset: { testid: 'settings-search' },
  });
  const nav = h('nav', { class: 'nx-set-nav', 'aria-label': t('title') });
  const results = h('div', {
    class: 'nx-set-results',
    role: 'listbox',
    'aria-label': t('searchResults'),
    hidden: true,
  });
  const heading = h('h2', { class: 'nx-set-heading', tabindex: '-1' });
  const body = h('div', { class: 'nx-set-body' });
  const content = h('main', { class: 'nx-set-content' }, heading, body);
  const live = h('div', { class: 'nx-visually-hidden', role: 'status', 'aria-live': 'polite' });
  const backLabel = h('span', { text: t('back') });
  // Narrow windows show either the page list or a page; this goes back to the list.
  const back = h(
    'button',
    { type: 'button', class: 'nx-btn is-ghost nx-set-back', onclick: () => root.classList.remove('is-page') },
    icon('arrow-left', { size: 16 }),
    backLabel,
  );
  const root = h(
    'div',
    { class: 'nx-set', dataset: { testid: 'settings' } },
    h('aside', { class: 'nx-set-side' }, search, results, nav),
    h('div', { class: 'nx-set-main' }, back, content),
    live,
  );
  container.replaceChildren(root);

  const fc = { ctx, local, t };
  /** @type {import('./pages/types.js').PageContext} */
  const pc = {
    ctx,
    system,
    t,
    local,
    row(key, scope = 'system') {
      const decl = system.settings.describe(scope).find((d) => d.key === key);
      return decl ? settingRow(fc, /** @type {any} */ (decl), { scope, onSaved: () => refreshSoon() }) : null;
    },
    value: (key, scope = 'system') => system.settings.get(key, scope),
    set: async (key, value, scope = 'system') => {
      await system.settings.set(key, value, scope);
      refreshSoon();
    },
    async command(id, a) {
      try {
        return await ctx.commands.execute(id, a);
      } catch (error) {
        toast(String(/** @type {Error} */ (error).message));
        return undefined;
      }
    },
    toast,
    refresh: () => void show(current),
    navigate: (page, highlight) => void show(page, highlight),
    confirm: (message, options) => /** @type {any} */ (ctx.dialog).confirm(message, options),
  };

  /** @param {string} message */
  function toast(message) {
    ctx.notify({ title: message, timeoutMs: 2500, transient: true });
    live.textContent = message;
  }

  function renderNav() {
    nav.replaceChildren(
      h(
        'ul',
        {},
        ...PAGES.map((p) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                class: `nx-set-nav-item${p.id === current ? ' is-current' : ''}`,
                'aria-current': p.id === current ? 'page' : undefined,
                dataset: { page: p.id, testid: 'settings-nav' },
                onclick: () => void show(p.id),
              },
              icon(p.icon, { size: 18 }),
              h('span', { text: t(`pages.${p.id}.title`) }),
            ),
          ),
        ),
      ),
    );
  }

  /**
   * Shows a page; `highlight` (scope/key) scrolls to a setting and flashes it.
   * @param {string} id
   * @param {string} [highlight]
   */
  async function show(id, highlight) {
    const page = byId.get(id) ?? personalization;
    const changedPage = page.id !== current;
    current = page.id;
    const mine = ++renderToken;
    const scrollTop = changedPage ? 0 : content.scrollTop;
    renderNav();
    heading.textContent = t(`pages.${page.id}.title`);
    ctx.window?.setTitle(`${t(`pages.${page.id}.title`)} — ${t('title')}`);
    let nodes;
    try {
      nodes = await page.render(pc);
    } catch (error) {
      nodes = [h('p', { class: 'nx-set-error', role: 'alert', text: String(/** @type {Error} */ (error).message) })];
    }
    if (mine !== renderToken) return;
    // Keep keyboard focus on the same control when a page re-renders after a change.
    const focusedSetting = /** @type {HTMLElement | null} */ (document.activeElement?.closest?.('[data-setting]'));
    body.replaceChildren(
      h('p', { class: 'nx-set-intro', text: t(`pages.${page.id}.intro`) }),
      ...nodes.filter(Boolean).map((n) => /** @type {Node} */ (n)),
    );
    root.classList.add('is-page');
    if (changedPage) content.scrollTop = 0;
    else content.scrollTop = scrollTop;
    if (focusedSetting && !changedPage) {
      const again = body.querySelector(`[data-setting="${focusedSetting.dataset.setting}"]`);
      /** @type {HTMLElement | null} */ (again?.querySelector('input, select, button'))?.focus({ preventScroll: true });
    }
    if (highlight) {
      const [scope, key] = highlight.split('/');
      const target = document.getElementById(rowId(/** @type {string} */ (scope), /** @type {string} */ (key)));
      if (target) {
        target.scrollIntoView({ block: 'center' });
        target.classList.add('is-highlighted');
        setTimeout(() => target.classList.remove('is-highlighted'), 2000);
        /** @type {HTMLElement | null} */ (target.querySelector('input, select, button'))?.focus({
          preventScroll: true,
        });
      }
    } else if (changedPage) heading.focus({ preventScroll: true });
    ctx.window?.stateChanged();
  }

  let refreshTimer = 0;
  const refreshSoon = () => {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => void show(current), 60);
  };

  /** Deep link: a page, or a setting (scope + key). @param {Record<string, unknown>} a */
  function openLink(a) {
    const scope = typeof a.scope === 'string' ? a.scope : 'system';
    const key = typeof a.key === 'string' ? a.key : '';
    if (key) {
      const page = scope === 'system' ? pageOfKey(key) : 'apps';
      if (page) return void show(page, `${scope}/${key}`);
    }
    if (typeof a.page === 'string' && byId.has(a.page)) void show(a.page);
  }

  // ─── Search: individual settings, their options, and pages ───────────────
  /** @returns {{ title: string, subtitle: string, page: string, highlight?: string, words: string }[]} */
  function searchIndex() {
    const entries = [];
    for (const decl of system.settings.describe('system')) {
      const page = pageOfKey(decl.key);
      if (!page) continue;
      const options = decl.type === 'enum' ? decl.options.map((o) => local(o.label)).join(' ') : '';
      entries.push({
        title: local(decl.label),
        subtitle: t(`pages.${page}.title`),
        page,
        highlight: `system/${decl.key}`,
        words: `${local(decl.label)} ${decl.description ? local(decl.description) : ''} ${options} ${decl.key}`,
      });
    }
    for (const app of system.apps.list()) {
      for (const decl of system.settings.describe(app.id)) {
        entries.push({
          title: local(decl.label),
          subtitle: local(app.name),
          page: 'apps',
          highlight: `${app.id}/${decl.key}`,
          words: `${local(decl.label)} ${local(app.name)}`,
        });
      }
    }
    for (const p of PAGES)
      entries.push({
        title: t(`pages.${p.id}.title`),
        subtitle: t('pageLabel'),
        page: p.id,
        words: `${t(`pages.${p.id}.title`)} ${t(`pages.${p.id}.keywords`)}`,
      });
    return entries;
  }

  function runSearch() {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      nav.hidden = false;
      return;
    }
    const words = q.split(/\s+/);
    const hits = searchIndex()
      .filter((e) => words.every((w) => e.words.toLowerCase().includes(w)))
      .slice(0, 30);
    nav.hidden = true;
    results.hidden = false;
    results.replaceChildren(
      ...(hits.length
        ? hits.map((e, i) =>
            h(
              'button',
              {
                type: 'button',
                role: 'option',
                class: 'nx-set-result',
                'aria-selected': String(i === 0),
                dataset: { testid: 'settings-result' },
                onclick: () => {
                  search.value = '';
                  runSearch();
                  void show(e.page, e.highlight);
                },
              },
              h('span', { class: 'nx-set-result-title', text: e.title }),
              h('span', { class: 'nx-set-result-sub', text: e.subtitle }),
            ),
          )
        : [h('p', { class: 'nx-empty', text: t('noResults') })]),
    );
  }
  search.addEventListener('input', runSearch);
  search.addEventListener('keydown', (e) => {
    const items = /** @type {HTMLElement[]} */ ([...results.querySelectorAll('.nx-set-result')]);
    if (e.key === 'Enter' && items[0]) {
      e.preventDefault();
      items[0].click();
    } else if (e.key === 'ArrowDown' && items[0]) {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'Escape' && search.value) {
      e.preventDefault();
      search.value = '';
      runSearch();
    }
  });
  results.addEventListener('keydown', (e) => {
    const items = /** @type {HTMLElement[]} */ ([...results.querySelectorAll('.nx-set-result')]);
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.key === 'ArrowUp' && i <= 0) return search.focus();
      items[Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))]?.focus();
    }
  });

  // Keyboard: Mod+F focuses the search; ↑/↓ move through the page list.
  ctx.shortcuts.register('Mod+F', () => search.focus(), { allowInInputs: true });
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = /** @type {HTMLElement[]} */ ([...nav.querySelectorAll('.nx-set-nav-item')]);
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });

  // Changes from anywhere (the palette, other windows) show up here.
  system.settings.onChange('*', () => {
    if (!body.contains(document.activeElement) || document.activeElement?.matches('input[type=range]')) refreshSoon();
  });
  ctx.i18n.onChange(() => {
    search.placeholder = t('search');
    backLabel.textContent = t('back');
    void show(current);
  });

  renderNav();
  void show(current).then(() => openLink(link));

  return {
    saveState: () => ({ page: current }),
    onIntent: (intent) => openLink(/** @type {Record<string, unknown>} */ (intent.data ?? {})),
    unmount: () => clearTimeout(refreshTimer),
  };
}
