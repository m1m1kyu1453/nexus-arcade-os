// @ts-check
// Overview: thumbnails of the current workspace's windows, a strip of workspaces (click to
// switch, drop windows onto them, add, rename), and type-to-search apps. Opens with
// Mod+Shift+Space (or Mod+Tab where the browser passes it) and from the top-left hot corner.
import { h, icon, replace } from '../../ui/dom.js';
import { closeMenus } from '../../ui/menu.js';
import { openModal, trapFocus } from '../../ui/overlay.js';
import { appIcon } from '../app-icon.js';
import { appName, registerCommand } from '../util.js';
import './overview.css';
import { windowThumb } from './thumb.js';

/** @param {import('../shell.js').ShellContext} shell */
export function createOverview(shell) {
  const sys = shell.system();
  const { t, wm } = shell;
  const strip = h('div', { class: 'nx-ov-strip', role: 'list' });
  const search = h('input', { class: 'nx-input nx-ov-search', type: 'search', autocomplete: 'off' });
  const grid = h('div', { class: 'nx-ov-grid', role: 'list' });
  const apps = h('div', { class: 'nx-ov-apps', role: 'list' });
  const root = h(
    'div',
    { class: 'nx-overview', role: 'dialog', 'aria-modal': 'true', hidden: true },
    strip,
    search,
    grid,
    apps,
  );
  document.body.append(root);
  trapFocus(root);
  /** @type {HTMLElement | null} */
  let previousFocus = null;
  /** @type {string | null} */
  let dragging = null;

  const isOpen = () => !root.hidden;

  function open() {
    if (isOpen()) return;
    closeMenus();
    shell.ui.launcher?.close();
    previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    root.hidden = false;
    root.setAttribute('aria-label', t('overview.title'));
    search.placeholder = t('overview.search');
    search.setAttribute('aria-label', t('overview.search'));
    search.value = '';
    grid.hidden = false;
    render();
    /** @type {HTMLElement | null} */ (grid.querySelector('button') ?? search).focus();
  }
  function close() {
    if (!isOpen()) return;
    root.hidden = true;
    previousFocus?.focus?.({ preventScroll: true });
  }

  function render() {
    renderStrip();
    renderWindows();
    replace(apps);
  }

  function renderStrip() {
    replace(
      strip,
      ...wm.workspaces.map((ws) => {
        const card = h(
          'button',
          {
            class: `nx-ov-ws${ws.current ? ' is-current' : ''}`,
            type: 'button',
            role: 'listitem',
            'aria-current': ws.current ? 'true' : undefined,
            onclick: () => {
              wm.switchWorkspace(ws.index, { animate: false });
              render();
            },
            ondblclick: () => void renameWorkspace(ws.index),
          },
          h('span', { class: 'nx-ov-ws-name', text: ws.name || t('overview.workspace', { n: ws.index + 1 }) }),
          h('small', { text: t('overview.windows', { count: ws.windows }) }),
        );
        card.addEventListener('dragover', (e) => {
          if (dragging) {
            e.preventDefault();
            card.classList.add('is-drop');
          }
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-drop'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('is-drop');
          if (dragging) wm.moveToWorkspace(dragging, ws.index);
          dragging = null;
          render();
        });
        card.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          void renameWorkspace(ws.index);
        });
        return card;
      }),
      h(
        'button',
        {
          class: 'nx-ov-ws nx-ov-add',
          type: 'button',
          'aria-label': t('shell.cmd.workspaceAdd'),
          'data-tooltip': t('shell.cmd.workspaceAdd'),
          onclick: () => {
            wm.setWorkspaces(
              wm.workspaces.length + 1,
              wm.workspaces.map((w) => w.name),
            );
            render();
          },
        },
        icon('plus', { size: 20 }),
      ),
    );
  }

  /** @param {number} index */
  async function renameWorkspace(index) {
    const input = h('input', {
      class: 'nx-input',
      type: 'text',
      maxlength: '40',
      'aria-label': t('overview.renameLabel'),
    });
    input.value = wm.workspaces[index]?.name ?? '';
    const ok = await openModal({
      title: t('overview.rename', { n: index + 1 }),
      body: input,
      actions: [
        { label: t('dialog.cancel'), value: false },
        { label: t('dialog.ok'), value: true, variant: 'primary' },
      ],
      dismissValue: false,
      onOpen: (done) => input.addEventListener('keydown', (e) => e.key === 'Enter' && done(true)),
    });
    if (ok) wm.renameWorkspace(index, input.value);
    if (isOpen()) renderStrip();
  }

  function renderWindows() {
    const wins = wm.list().filter((w) => w.workspace === wm.current);
    if (!wins.length) {
      replace(grid, h('p', { class: 'nx-empty', text: t('overview.empty') }));
      return;
    }
    replace(
      grid,
      ...wins.map((w) => {
        const card = h(
          'button',
          {
            class: 'nx-ov-win',
            type: 'button',
            role: 'listitem',
            draggable: 'true',
            onclick: () => {
              close();
              wm.focus(w.id);
            },
          },
          windowThumb(w, 320, 200),
          h('span', { class: 'nx-ov-win-title' }, appIcon(w.manifest, 20), h('span', { text: w.title })),
        );
        card.addEventListener('dragstart', (e) => {
          dragging = w.id;
          e.dataTransfer?.setData('text/plain', w.id);
        });
        card.addEventListener('dragend', () => (dragging = null));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Delete') void sys.lifecycle.close(w.id).then(() => isOpen() && render());
        });
        return card;
      }),
    );
  }

  let searchTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      const q = search.value.trim();
      if (!q) {
        replace(apps);
        grid.hidden = false;
        return;
      }
      const results = await sys.search.query(q, { types: ['app'], limit: 12 });
      grid.hidden = true;
      replace(
        apps,
        ...results.map((r) =>
          h(
            'button',
            {
              class: 'nx-launcher-tile',
              type: 'button',
              role: 'listitem',
              onclick: () => (close(), void shell.launch(r.data.appId)),
            },
            appIcon(/** @type {any} */ (sys.registry.get(r.data.appId)), 44),
            h('span', { text: appName(sys, r.data.appId) }),
          ),
        ),
      );
      if (!results.length) apps.append(h('p', { class: 'nx-empty', text: t('launcher.noResults') }));
    }, 80);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') /** @type {HTMLElement | null} */ (apps.querySelector('button'))?.click();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    const cards = /** @type {HTMLElement[]} */ ([...grid.querySelectorAll('.nx-ov-win')]);
    const i = cards.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i === -1) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      cards[(i + 1) % cards.length].focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      cards[(i - 1 + cards.length) % cards.length].focus();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      search.focus();
    }
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.target === root || e.target === grid) close();
  });

  // Hot corner: rest the mouse in the top-left corner.
  let cornerTimer = 0;
  addEventListener('pointermove', (e) => {
    if (e.clientX <= 1 && e.clientY <= 1 && e.pointerType === 'mouse') {
      if (!cornerTimer) cornerTimer = window.setTimeout(() => (isOpen() ? close() : open()), 180);
    } else {
      clearTimeout(cornerTimer);
      cornerTimer = 0;
    }
  });

  const toggle = () => (isOpen() ? close() : open());
  registerCommand(sys, {
    id: 'shell.overview',
    title: 'overview.title',
    icon: 'overview',
    shortcut: 'Mod+Shift+Space',
    run: toggle,
  });
  registerCommand(sys, {
    id: 'shell.overview.native',
    title: 'overview.title',
    shortcut: 'Mod+Tab',
    hidden: true,
    run: toggle,
  });
  sys.bus.on('window:closed', () => isOpen() && render());
  return { open, close, toggle, isOpen };
}
