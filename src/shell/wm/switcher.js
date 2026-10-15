// @ts-check
// Window switcher: Alt+` (and Alt+Tab where the browser passes it). Hold Alt, press ` or Tab
// to move (Shift = back), release Alt to switch. Arrow keys and clicks work too.
import { h, replace } from '../../ui/dom.js';
import { appIcon } from '../app-icon.js';
import { registerCommand } from '../util.js';
import './overview.css';
import { windowThumb } from './thumb.js';

/** @param {import('../shell.js').ShellContext} shell */
export function createSwitcher(shell) {
  const sys = shell.system();
  const { t, wm } = shell;
  const list = h('div', { class: 'nx-sw-list', role: 'listbox' });
  const title = h('p', { class: 'nx-sw-title' });
  const root = h(
    'div',
    { class: 'nx-switcher nx-glass', role: 'dialog', 'aria-modal': 'true', hidden: true },
    list,
    title,
  );
  const backdrop = h('div', { class: 'nx-switcher-backdrop', hidden: true }, root);
  document.body.append(backdrop);
  /** @type {string[]} */
  let order = [];
  let index = 0;
  /** The key press that opened the switcher reaches our own handler too: skip it once. */
  let skipNext = false;

  const isOpen = () => !backdrop.hidden;

  /** @param {number} dir */
  function open(dir = 1) {
    // While open, the switcher's own key handler moves the selection.
    if (isOpen()) return;
    order = wm.list().map((w) => w.id);
    if (!order.length) return;
    backdrop.hidden = false;
    root.hidden = false;
    root.setAttribute('aria-label', t('switcher.title'));
    index = order.length > 1 ? (dir > 0 ? 1 : order.length - 1) : 0;
    skipNext = true;
    setTimeout(() => (skipNext = false));
    render();
  }

  function render() {
    replace(
      list,
      ...order.map((id, i) => {
        const w = /** @type {import('./window-manager.js').Win} */ (wm.get(id));
        return h(
          'button',
          {
            class: `nx-sw-item${i === index ? ' is-active' : ''}`,
            type: 'button',
            role: 'option',
            'aria-selected': String(i === index),
            onclick: () => commit(i),
          },
          w.workspace === wm.current && !w.minimized
            ? windowThumb(w, 180, 110)
            : h('div', { class: 'nx-sw-placeholder' }, appIcon(w.manifest, 40)),
          h('span', { class: 'nx-ov-win-title' }, appIcon(w.manifest, 18), h('span', { text: w.title })),
        );
      }),
    );
    const w = wm.get(order[index]);
    title.textContent = w
      ? w.workspace === wm.current
        ? w.title
        : t('switcher.onWorkspace', { title: w.title, n: w.workspace + 1 })
      : '';
    /** @type {HTMLElement | undefined} */ (list.children[index])?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  /** @param {number} dir */
  function move(dir) {
    index = (index + dir + order.length) % order.length;
    render();
  }

  /** @param {number} [i] */
  function commit(i = index) {
    const id = order[i];
    cancel();
    if (id) wm.focus(id);
  }
  function cancel() {
    backdrop.hidden = true;
    root.hidden = true;
  }

  addEventListener(
    'keydown',
    (e) => {
      if (!isOpen()) return;
      if (skipNext) {
        skipNext = false;
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === '`' || e.key === 'Tab' || e.code === 'Backquote') {
        e.preventDefault();
        e.stopPropagation();
        move(e.shiftKey ? -1 : 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        move(e.key === 'ArrowRight' ? 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
    },
    true,
  );
  addEventListener(
    'keyup',
    (e) => {
      if (isOpen() && e.key === 'Alt') commit();
    },
    true,
  );
  backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && cancel());

  registerCommand(sys, {
    id: 'shell.switcher',
    title: 'switcher.title',
    icon: 'window',
    shortcut: 'Alt+`',
    run: () => open(1),
  });
  registerCommand(sys, {
    id: 'shell.switcher.native',
    title: 'switcher.title',
    shortcut: 'Alt+Tab',
    hidden: true,
    run: () => open(1),
  });
  return { open, isOpen };
}
