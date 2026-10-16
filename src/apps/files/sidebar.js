// @ts-check
// Sidebar: favorites (the default home folders), recent files, trash, tags and a storage bar.
// Places are drop targets (drop on Trash = move to trash).
import { h, icon } from '../../ui/dom.js';
import { formatSize, TRASH } from './model.js';

export const FAVORITES = /** @type {const} */ ([
  ['Desktop', 'monitor'],
  ['Documents', 'file-text'],
  ['Downloads', 'download'],
  ['Pictures', 'image'],
  ['Music', 'music'],
  ['Videos', 'file-video'],
  ['Projects', 'code'],
]);

/** Location keys: a folder path, or 'recent:' / 'tag:<name>'. */

/**
 * @param {import('../../kernel/types').AppContext} ctx
 * @param {{ go: (location: string) => void, dropTarget: (el: HTMLElement, location: string) => void }} actions
 */
export function createSidebar(ctx, { go, dropTarget }) {
  const { t } = ctx.i18n;
  const home = /** @type {string} */ (ctx.fs.home);
  const el = h('nav', { class: 'nx-files-sidebar', 'aria-label': t('places.label') });
  /** @type {string} */
  let current = '';

  /** @param {string} location @param {string} iconName @param {string} label @param {string} [extra] */
  function place(location, iconName, label, extra) {
    const btn = h(
      'button',
      {
        type: 'button',
        class: `nx-files-place${location === current ? ' is-current' : ''}`,
        'aria-current': location === current ? 'location' : undefined,
        dataset: { location, testid: 'files-place' },
        onclick: () => go(location),
      },
      icon(iconName, { size: 16 }),
      h('span', { text: label }),
      extra ? h('span', { class: 'nx-files-place-count', text: extra }) : null,
    );
    if (!location.includes(':')) dropTarget(btn, location);
    return h('li', {}, btn);
  }

  async function render() {
    const tags = /** @type {{ tag: string, count: number }[]} */ (await ctx.fs.tags().catch(() => []));
    const usage = await storageBar();
    el.replaceChildren(
      h('h3', { text: t('places.favorites') }),
      h(
        'ul',
        {},
        place(home, 'home', t('places.home')),
        ...FAVORITES.map(([name, iconName]) => place(`${home}/${name}`, iconName, t(`places.${name}`))),
        place('recent:', 'clock', t('places.recent')),
        place(TRASH, 'trash', t('places.trash')),
        place('/', 'hard-drive', t('places.root')),
      ),
      h('h3', { text: t('places.tags') }),
      tags.length
        ? h('ul', {}, ...tags.map(({ tag, count }) => place(`tag:${tag}`, 'tag', tag, String(count))))
        : h('p', { class: 'nx-files-sidebar-hint', text: t('places.noTags') }),
      usage,
    );
  }

  async function storageBar() {
    const { i18n } = ctx;
    const size = (/** @type {number} */ n) => formatSize(n, (v, o) => i18n.number(v, o));
    const [estimate, usage] = await Promise.all([
      navigator.storage?.estimate?.().catch(() => null) ?? Promise.resolve(null),
      /** @type {Promise<{ files: number, bytes: number }>} */ (ctx.fs.usage()).catch(() => null),
    ]);
    const used = estimate?.usage ?? usage?.bytes ?? 0;
    const total = estimate?.quota ?? 0;
    const ratio = total ? Math.min(1, used / total) : 0;
    return h(
      'div',
      { class: 'nx-files-storage', dataset: { testid: 'files-storage' } },
      h('h3', { text: t('storage.label') }),
      total
        ? h(
            'div',
            {
              class: 'nx-files-storage-bar',
              role: 'meter',
              'aria-valuemin': '0',
              'aria-valuemax': '100',
              'aria-valuenow': String(Math.round(ratio * 100)),
              'aria-label': t('storage.label'),
            },
            h('span', { style: { width: `${Math.max(2, ratio * 100)}%` } }),
          )
        : null,
      h('p', {
        text: total
          ? t('storage.used', { used: size(used), total: size(total) })
          : t('storage.usedNoQuota', { used: size(used) }),
      }),
      usage ? h('p', { text: t('storage.files', { count: i18n.number(usage.files) }) }) : null,
    );
  }

  return {
    el,
    render,
    /** @param {string} location */
    setCurrent(location) {
      current = location;
      for (const btn of el.querySelectorAll('.nx-files-place')) {
        const on = /** @type {HTMLElement} */ (btn).dataset.location === location;
        btn.classList.toggle('is-current', on);
        if (on) btn.setAttribute('aria-current', 'location');
        else btn.removeAttribute('aria-current');
      }
    },
  };
}
