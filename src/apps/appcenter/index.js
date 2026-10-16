// App Center: every built-in app by category, with size and permissions. "Uninstall" hides an
// app everywhere (launcher, dock, search, palette), optionally with its data; "Install" shows
// it again. Each app has a page with screenshots, changelog, settings and "Clear data".
// Nothing runs at import time.
import { h, icon } from '../../ui/dom.js';
import { renderMarkdownInto } from '../../ui/markdown.js';
import { openModal } from '../../ui/overlay.js';
import './styles.css';

const CATEGORIES = /** @type {const} */ ([
  'productivity',
  'study',
  'office',
  'dev',
  'cslab',
  'games',
  'media',
  'ai',
  'system',
]);
/** The App Center can't hide itself: nothing could bring it back. */
const PROTECTED = new Set(['nexus.appcenter']);

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'appcenter.open': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.appcenter' }),
};

/** @type {import('../../kernel/types').AppModule['mount']} */
export function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const system = /** @type {NonNullable<typeof ctx.system>} */ (ctx.system);
  const local = (/** @type {import('../../kernel/types').L10n} */ text) => text[ctx.i18n.locale] ?? text.en;
  const saved = /** @type {{ category?: string, app?: string } | undefined} */ (args.restoredState);
  let category = saved?.category ?? 'all';
  /** @type {string | null} */
  let detail = saved?.app ?? null;
  /** @type {Record<string, number>} */
  let codeSizes = {};
  /** @type {Map<string, number>} */
  let dataSizes = new Map();
  let token = 0;

  const search = h('input', {
    class: 'nx-input',
    type: 'search',
    placeholder: t('search'),
    'aria-label': t('search'),
    dataset: { testid: 'appcenter-search' },
  });
  const nav = h('nav', { class: 'nx-ac-nav', 'aria-label': t('categories') });
  const main = h('main', { class: 'nx-ac-main', tabindex: '-1' });
  const root = h(
    'div',
    { class: 'nx-ac', dataset: { testid: 'appcenter' } },
    h('aside', { class: 'nx-ac-side' }, search, nav),
    main,
  );
  container.replaceChildren(root);

  const apps = () =>
    system.apps
      .list({ includeDisabled: true })
      .sort((a, b) => local(a.name).localeCompare(local(b.name), ctx.i18n.locale));
  const size = (/** @type {number} */ n) => ctx.i18n.bytes(n);

  async function loadSizes() {
    const [code, usage] = await Promise.all([
      system.apps.codeSizes().catch(() => ({})),
      system.storage.usage().catch(() => null),
    ]);
    codeSizes = code;
    dataSizes = new Map((usage?.apps ?? []).map((a) => [a.id, a.bytes]));
  }

  function renderNav() {
    const list = apps();
    const counts = new Map(CATEGORIES.map((c) => [c, list.filter((a) => a.category === c).length]));
    const item = (/** @type {string} */ id, /** @type {string} */ label, /** @type {number} */ count) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `nx-ac-cat${id === category && !detail ? ' is-current' : ''}`,
            'aria-current': id === category && !detail ? 'page' : undefined,
            dataset: { category: id },
            onclick: () => {
              category = id;
              detail = null;
              render();
            },
          },
          h('span', { text: label }),
          h('span', { class: 'nx-ac-count', text: String(count) }),
        ),
      );
    nav.replaceChildren(
      h(
        'ul',
        {},
        item('all', t('all'), list.length),
        ...CATEGORIES.filter((c) => counts.get(c)).map((c) => item(c, t(`category.${c}`), counts.get(c) ?? 0)),
        item('hidden', t('hiddenApps'), list.filter((a) => !a.enabled).length),
      ),
      h('p', { class: 'nx-ac-plugins', text: t('plugins') }),
    );
  }

  function render() {
    renderNav();
    ctx.window?.stateChanged();
    if (detail) return void showDetail(detail);
    const q = search.value.trim().toLowerCase();
    const list = apps().filter(
      (a) =>
        (category === 'all' || (category === 'hidden' ? !a.enabled : a.category === category)) &&
        (!q || `${local(a.name)} ${local(a.description)} ${a.keywords.join(' ')}`.toLowerCase().includes(q)),
    );
    const title = category === 'all' ? t('all') : category === 'hidden' ? t('hiddenApps') : t(`category.${category}`);
    ctx.window?.setTitle(`${title} — ${t('title')}`);
    main.replaceChildren(
      h('h2', { class: 'nx-ac-heading', text: title }),
      list.length
        ? h('ul', { class: 'nx-ac-grid', dataset: { testid: 'appcenter-grid' } }, ...list.map(card))
        : h('p', { class: 'nx-empty', text: category === 'hidden' ? t('noneHidden') : t('noMatch') }),
    );
  }

  /** @param {ReturnType<typeof apps>[number]} a */
  function card(a) {
    return h(
      'li',
      { class: `nx-ac-card${a.enabled ? '' : ' is-hidden'}`, dataset: { app: a.id, testid: 'appcenter-card' } },
      h(
        'button',
        {
          type: 'button',
          class: 'nx-ac-card-main',
          onclick: () => open(a.id),
          'aria-label': t('details', { name: local(a.name) }),
        },
        h('span', { class: 'nx-ac-icon' }, icon(a.icon, { size: 28 })),
        h(
          'span',
          { class: 'nx-ac-card-text' },
          h('strong', { text: local(a.name) }),
          h('span', { class: 'nx-ac-desc', text: local(a.description) }),
          h('span', { class: 'nx-ac-meta', text: meta(a) }),
        ),
      ),
      a.enabled ? null : h('span', { class: 'nx-badge', text: t('hidden') }),
    );
  }

  /** "1.0.0 · 48 KB · 2 permissions". @param {ReturnType<typeof apps>[number]} a */
  function meta(a) {
    const parts = [a.version];
    if (codeSizes[a.id]) parts.push(t('codeSize', { size: size(codeSizes[a.id] ?? 0) }));
    if (a.permissions.length) parts.push(t('permissionCount', { count: a.permissions.length }));
    return parts.join(' · ');
  }

  /** @param {string} id */
  function open(id) {
    detail = id;
    render();
  }

  /** @param {string} id */
  async function showDetail(id) {
    const mine = ++token;
    const a = system.apps.get(id);
    if (!a) {
      detail = null;
      return render();
    }
    ctx.window?.setTitle(`${local(a.name)} — ${t('title')}`);
    const [shots, changelog] = await Promise.all([
      system.apps.screenshots(id).catch(() => []),
      system.apps.changelog(id).catch(() => null),
    ]);
    if (mine !== token) return;
    const notes = h('div', { class: 'nx-ac-changelog' });
    if (changelog) void renderMarkdownInto(notes, changelog);
    const data = dataSizes.get(id) ?? 0;

    const actions = h(
      'div',
      { class: 'nx-ac-actions' },
      a.enabled
        ? h('button', {
            type: 'button',
            class: 'nx-btn is-primary',
            text: t('open'),
            onclick: () => void system.windows.launch(id),
          })
        : null,
      a.enabled
        ? PROTECTED.has(id)
          ? null
          : h('button', {
              type: 'button',
              class: 'nx-btn',
              text: t('uninstall'),
              dataset: { testid: 'uninstall' },
              onclick: () => void uninstall(id),
            })
        : h('button', {
            type: 'button',
            class: 'nx-btn is-primary',
            text: t('install'),
            dataset: { testid: 'install' },
            onclick: async () => {
              await system.apps.setEnabled(id, true);
              render();
            },
          }),
      a.settings.length
        ? h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('settings'),
            onclick: () =>
              void ctx.commands.execute('settings.open', { scope: id, key: a.settings[0]?.key }).catch(() => {}),
          })
        : null,
      h('button', {
        type: 'button',
        class: 'nx-btn is-danger',
        text: t('clearData'),
        dataset: { testid: 'clear-data' },
        disabled: !a.collections.length && !a.settings.length && !data,
        onclick: () => void clearData(id),
      }),
    );

    main.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'nx-btn is-ghost nx-ac-back', onclick: () => ((detail = null), render()) },
        icon('arrow-left', { size: 16 }),
        t('back'),
      ),
      h(
        'header',
        { class: 'nx-ac-hero' },
        h('span', { class: 'nx-ac-icon is-large' }, icon(a.icon, { size: 44 })),
        h(
          'div',
          {},
          h('h2', { text: local(a.name), dataset: { testid: 'appcenter-name' } }),
          h('p', { text: local(a.description) }),
          h('p', {
            class: 'nx-ac-meta',
            text: `${t(`category.${a.category}`)} · ${t('version', { version: a.version })}${a.enabled ? '' : ` · ${t('hidden')}`}`,
          }),
        ),
      ),
      actions,
      shots.length
        ? h(
            'section',
            { class: 'nx-ac-section' },
            h('h3', { text: t('screenshots') }),
            h(
              'div',
              { class: 'nx-ac-shots' },
              ...shots.map((src, i) =>
                h('img', { src, alt: t('screenshotAlt', { name: local(a.name), n: i + 1 }), loading: 'lazy' }),
              ),
            ),
          )
        : null,
      h(
        'section',
        { class: 'nx-ac-section' },
        h('h3', { text: t('info') }),
        h(
          'dl',
          { class: 'nx-ac-facts' },
          h('dt', { text: t('codeLabel') }),
          h('dd', { text: codeSizes[id] ? size(codeSizes[id] ?? 0) : '—' }),
          h('dt', { text: t('dataLabel') }),
          h('dd', { text: data ? size(data) : t('noData') }),
          h('dt', { text: t('fileTypes') }),
          h('dd', {
            text:
              a.handles
                .filter((x) => x.action === 'open')
                .flatMap((x) => x.types)
                .join(', ') || '—',
          }),
          h('dt', { text: t('commandsLabel') }),
          h('dd', { text: a.commands.map((c) => local(c.title)).join(', ') || '—' }),
        ),
      ),
      h(
        'section',
        { class: 'nx-ac-section' },
        h('h3', { text: t('permissions') }),
        a.permissions.length
          ? h(
              'ul',
              { class: 'nx-ac-perms', dataset: { testid: 'permissions' } },
              ...a.permissions.map((p) =>
                h(
                  'li',
                  {},
                  icon(PERM_ICONS[p] ?? 'shield', { size: 16 }),
                  h('strong', { text: t(`perm.${p}.title`) }),
                  h('span', { text: t(`perm.${p}.body`) }),
                ),
              ),
            )
          : h('p', { class: 'nx-ac-meta', text: t('noPermissions') }),
        h('p', { class: 'nx-ac-meta', text: t('builtIn') }),
      ),
      changelog ? h('section', { class: 'nx-ac-section' }, h('h3', { text: t('changelog') }), notes) : null,
    );
    main.focus({ preventScroll: true });
  }

  /** @param {string} id */
  async function uninstall(id) {
    const a = /** @type {NonNullable<ReturnType<typeof system.apps.get>>} */ (system.apps.get(id));
    const wipe = h('input', { type: 'checkbox', dataset: { testid: 'uninstall-wipe' } });
    const ok = await openModal({
      title: t('uninstallTitle', { name: local(a.name) }),
      body: h(
        'div',
        { class: 'nx-ac-form' },
        h('p', { text: t('uninstallBody') }),
        h('label', { class: 'nx-ac-check' }, wipe, t('uninstallWipe')),
      ),
      actions: [
        { label: t('cancel'), value: false },
        { label: t('uninstall'), value: true, variant: 'danger' },
      ],
      dismissValue: false,
    });
    if (!ok) return;
    if (wipe.checked) await system.apps.clearData(id).catch((e) => ctx.notify({ title: String(e.message) }));
    await system.apps.setEnabled(id, false);
    await loadSizes();
    ctx.notify({ title: t('uninstalled', { name: local(a.name) }), timeoutMs: 3000 });
    render();
  }

  /** @param {string} id */
  async function clearData(id) {
    const a = /** @type {NonNullable<ReturnType<typeof system.apps.get>>} */ (system.apps.get(id));
    const ok = await /** @type {any} */ (ctx.dialog).confirm(t('clearConfirm', { name: local(a.name) }), {
      title: t('clearData'),
      okLabel: t('clearData'),
      danger: true,
    });
    if (!ok) return;
    try {
      await system.apps.clearData(id);
      ctx.notify({ title: t('cleared', { name: local(a.name) }), timeoutMs: 3000 });
    } catch (e) {
      ctx.notify({ title: String(/** @type {Error} */ (e).message) });
    }
    await loadSizes();
    render();
  }

  search.addEventListener('input', () => {
    detail = null;
    render();
  });
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = /** @type {HTMLElement[]} */ ([...nav.querySelectorAll('.nx-ac-cat')]);
    const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  });
  ctx.events.on('app:enabled-changed', () => render());
  ctx.i18n.onChange(() => {
    search.placeholder = t('search');
    render();
  });

  void loadSizes().then(render);
  render();
  return {
    saveState: () => ({ category, app: detail }),
    onIntent: (intent) => {
      const id = /** @type {any} */ (intent.data)?.app;
      if (typeof id === 'string') open(id);
    },
  };
}

/** @type {Record<string, string>} */
const PERM_ICONS = {
  vfs: 'folder',
  notifications: 'bell',
  clipboard: 'paste',
  network: 'globe',
  ai: 'sparkles',
  scheduler: 'alarm',
  intents: 'share',
  system: 'settings',
};
