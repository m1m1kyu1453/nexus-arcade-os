// @ts-check
// Launcher / start menu: search, pinned apps, recent apps, recent files and all apps by
// category. Fully keyboard-operable (arrows move between tiles, typing searches). Opens with
// Mod+Space or by tapping the Mod key alone. On phones it fills the screen.
import { isEditable } from '../../services/commands/shortcuts.js';
import { focusedElement, h, icon, replace } from '../../ui/dom.js';
import { attachContextMenu, closeMenus } from '../../ui/menu.js';
import { trapFocus } from '../../ui/overlay.js';
import { appIcon } from '../app-icon.js';
import { appName, registerCommand } from '../util.js';
import './launcher.css';

const RECENT_FILES = 8;

/** @param {import('../shell.js').ShellContext} shell */
export function createLauncher(shell) {
  const sys = shell.system();
  const { t, session } = shell;
  /** @type {{ path: string, name: string }[]} */
  const recentFiles = session.data.recentFiles ?? (session.data.recentFiles = []);

  const search = h('input', {
    class: 'nx-input nx-launcher-search',
    type: 'search',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const body = h('div', { class: 'nx-launcher-body' });
  const panel = h(
    'div',
    { class: 'nx-launcher nx-glass', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'nx-launcher-top' }, icon('search', { size: 18 }), search),
    body,
  );
  const backdrop = h('div', { class: 'nx-launcher-backdrop', hidden: true }, panel);
  document.body.append(backdrop);
  trapFocus(panel);
  /** @type {HTMLElement | null} */
  let previousFocus = null;

  const isOpen = () => !backdrop.hidden;

  function open() {
    closeMenus();
    shell.ui.palette?.close();
    previousFocus = focusedElement();
    backdrop.hidden = false;
    backdrop.dataset.dock = String(sys.settings.get('system', 'dockPosition'));
    panel.setAttribute('aria-label', t('launcher.title'));
    search.placeholder = t('launcher.search');
    search.setAttribute('aria-label', t('launcher.search'));
    search.value = '';
    render();
    search.focus();
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    previousFocus?.focus?.({ preventScroll: true });
  }

  /** @param {import('../../kernel/types').AppManifest} m */
  const tile = (m) => {
    const el = h(
      'button',
      {
        class: 'nx-launcher-tile',
        type: 'button',
        dataset: { app: m.id },
        onclick: () => (close(), void shell.launch(m.id)),
      },
      appIcon(m, 44),
      h('span', { text: appName(sys, m.id) }),
    );
    attachContextMenu(el, () => {
      const pinned = session.data.pinned.includes(m.id);
      return [
        { label: t('shell.newWindow'), icon: 'plus', run: () => (close(), void shell.launch(m.id)) },
        pinned
          ? {
              label: t('shell.unpin'),
              icon: 'pin-off',
              run: () => session.setPinned(session.data.pinned.filter((id) => id !== m.id)),
            }
          : { label: t('shell.pin'), icon: 'pin', run: () => session.setPinned([...session.data.pinned, m.id]) },
        { label: t('launcher.addToDesktop'), icon: 'monitor', run: () => void shell.ui.desktop?.addShortcut(m.id) },
      ];
    });
    return el;
  };

  /** @param {string} title @param {Node[]} children @param {string} [className] */
  const section = (title, children, className = 'nx-launcher-grid') =>
    children.length ? h('section', {}, h('h2', { text: title }), h('div', { class: className }, ...children)) : null;

  async function render() {
    const query = search.value.trim();
    const apps = sys.registry.list();
    if (query) {
      const results = await sys.search.query(query, { types: ['app', 'file', 'folder'], limit: 24 });
      if (search.value.trim() !== query) return;
      const appTiles = results
        .filter((r) => r.type === 'app')
        .map((r) => sys.registry.get(r.data.appId))
        .filter((m) => !!m)
        .map((m) => tile(/** @type {any} */ (m)));
      const fileRows = results.filter((r) => r.type !== 'app').map((r) => fileRow(r.data.path, r.title));
      replace(
        body,
        ...[section(t('launcher.apps'), appTiles), section(t('launcher.files'), fileRows, 'nx-launcher-files')]
          .filter((x) => !!x)
          .map((x) => /** @type {HTMLElement} */ (x)),
      );
      if (!appTiles.length && !fileRows.length)
        body.append(h('p', { class: 'nx-empty', text: t('launcher.noResults') }));
      return;
    }
    const pinned = session.data.pinned
      .map((id) => sys.registry.get(id))
      .filter((m) => m && sys.registry.isEnabled(m.id));
    const recentApps = session.data.recentApps
      .map((id) => sys.registry.get(id))
      .filter((m) => m && sys.registry.isEnabled(m.id))
      .slice(0, 6);
    const groups = Object.entries(sys.registry.byCategory());
    replace(
      body,
      ...[
        section(
          t('launcher.pinned'),
          pinned.map((m) => tile(/** @type {any} */ (m))),
        ),
        section(
          t('launcher.recentApps'),
          recentApps.map((m) => tile(/** @type {any} */ (m))),
        ),
        section(
          t('launcher.recentFiles'),
          recentFiles.map((f) => fileRow(f.path, f.name)),
          'nx-launcher-files',
        ),
        ...groups.map(([category, list]) =>
          section(t(`launcher.category.${category}`), /** @type {any[]} */ (list).map(tile)),
        ),
      ]
        .filter((x) => !!x)
        .map((x) => /** @type {HTMLElement} */ (x)),
    );
    if (!apps.length) body.append(h('p', { class: 'nx-empty', text: t('launcher.noApps') }));
  }

  /** @param {string} path @param {string} name */
  function fileRow(path, name) {
    return h(
      'button',
      {
        class: 'nx-launcher-file',
        type: 'button',
        onclick: async () => {
          close();
          try {
            await sys.intents.open(path);
          } catch {
            await sys.notifications.notify({ title: t('palette.noApp'), body: path });
          }
        },
      },
      icon('file-text', { size: 18 }),
      h('span', { text: name }),
      h('small', { text: path }),
    );
  }

  // Arrow keys move between tiles (grid-aware), typing jumps to the search box.
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (search.value) {
        search.value = '';
        render();
        search.focus();
      } else close();
      return;
    }
    const focusables = /** @type {HTMLElement[]} */ ([...body.querySelectorAll('button')]);
    const current = /** @type {HTMLElement} */ (document.activeElement);
    if (current === search) {
      if (e.key === 'ArrowDown' || (e.key === 'Enter' && focusables.length)) {
        e.preventDefault();
        if (e.key === 'Enter') focusables[0].click();
        else focusables[0]?.focus();
      }
      return;
    }
    const index = focusables.indexOf(current);
    if (index === -1) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      search.focus();
      return;
    }
    const r = current.getBoundingClientRect();
    /** @param {(c: DOMRect) => boolean} filter @param {(c: DOMRect) => number} score */
    const pick = (filter, score) => {
      let best = null;
      let bestScore = Infinity;
      for (const el of focusables) {
        if (el === current) continue;
        const c = el.getBoundingClientRect();
        if (!filter(c)) continue;
        const s = score(c);
        if (s < bestScore) {
          best = el;
          bestScore = s;
        }
      }
      return best;
    };
    /** @type {HTMLElement | null} */
    let target = null;
    if (e.key === 'ArrowRight') target = focusables[index + 1] ?? null;
    if (e.key === 'ArrowLeft') target = index === 0 ? search : focusables[index - 1];
    if (e.key === 'ArrowDown')
      target = pick(
        (c) => c.top > r.top + 4,
        (c) => (c.top - r.top) * 10 + Math.abs(c.left - r.left),
      );
    if (e.key === 'ArrowUp')
      target =
        pick(
          (c) => c.top < r.top - 4,
          (c) => (r.top - c.top) * 10 + Math.abs(c.left - r.left),
        ) ?? search;
    if (e.key === 'Home') target = focusables[0];
    if (e.key === 'End') target = focusables.at(-1) ?? null;
    if (target) {
      e.preventDefault();
      target.focus();
      target.scrollIntoView({ block: 'nearest' });
    }
  });
  let timer = 0;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(render, 60);
  });
  backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());

  // Remember files opened through intents (for "Recent files").
  sys.bus.on('app:launched', ({ id }) => {
    const path = sys.lifecycle.get(id)?.args?.intent?.path;
    if (!path) return;
    const i = recentFiles.findIndex((f) => f.path === path);
    if (i !== -1) recentFiles.splice(i, 1);
    recentFiles.unshift({ path, name: path.split('/').pop() ?? path });
    recentFiles.length = Math.min(recentFiles.length, RECENT_FILES);
    session.schedule();
  });

  // Tapping Mod alone (press and release with no other key) toggles the launcher.
  /** @type {{ key: string, at: number } | null} */
  let modDown = null;
  const modKey = /mac|iphone|ipad/i.test(navigator.platform) ? 'Meta' : 'Control';
  addEventListener(
    'keydown',
    (e) => {
      modDown = e.key === modKey && !e.repeat && !e.shiftKey && !e.altKey ? { key: e.key, at: Date.now() } : null;
    },
    true,
  );
  addEventListener(
    'keyup',
    (e) => {
      if (modDown && e.key === modDown.key && Date.now() - modDown.at < 400 && !isEditable(document.activeElement)) {
        isOpen() ? close() : open();
      }
      modDown = null;
    },
    true,
  );
  addEventListener('pointerdown', () => (modDown = null), true);

  registerCommand(sys, {
    id: 'shell.launcher',
    title: 'launcher.title',
    icon: 'apps',
    shortcut: 'Mod+Space',
    run: () => (isOpen() ? close() : open()),
  });
  return { open, close, toggle: () => (isOpen() ? close() : open()), isOpen };
}
