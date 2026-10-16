// @ts-check
// The one context menu system used everywhere: keyboard navigation (arrows, Home/End,
// typeahead, Enter/Space, Escape, ←/→ for submenus), icons, shortcuts, disabled and checkable
// items, separators, submenus, and positioning inside the viewport. Touch: long-press opens it.
import { formatShortcut } from '../services/commands/keys.js';
import { focusedElement, h, icon } from './dom.js';
import './menu.css';

/**
 * @typedef {object} MenuItem
 * @property {string} label
 * @property {string} [icon]
 * @property {string} [shortcut]        shown right-aligned ('Mod+C')
 * @property {boolean} [disabled]
 * @property {boolean} [checked]        makes it a checkable item
 * @property {boolean} [danger]
 * @property {MenuEntry[]} [submenu]
 * @property {() => void} [run]
 */
/** @typedef {MenuItem | 'separator'} MenuEntry */

/** @type {(() => void) | null} */
let closeOpenMenu = null;

/**
 * Opens a menu at a point or under an anchor element. Returns a function that closes it.
 * @param {MenuEntry[]} entries
 * @param {{ x?: number, y?: number, anchor?: Element, onClose?: () => void, label?: string }} position
 */
export function openMenu(entries, { x = 0, y = 0, anchor, onClose, label }) {
  closeOpenMenu?.();
  const previousFocus = focusedElement();
  /** @type {HTMLElement[]} */
  const stack = [];

  const close = () => {
    for (const el of stack) el.remove();
    stack.length = 0;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
    if (closeOpenMenu === close) closeOpenMenu = null;
    previousFocus?.focus?.({ preventScroll: true });
    onClose?.();
  };

  /** @param {PointerEvent} e */
  function onOutside(e) {
    if (!stack.some((m) => m.contains(/** @type {Node} */ (e.target)))) close();
  }

  /**
   * @param {MenuEntry[]} items
   * @param {{ x: number, y: number, flipX?: number }} at  flipX: x to use if it doesn't fit on the right
   * @param {number} level
   */
  function render(items, at, level) {
    while (stack.length > level) stack.pop()?.remove();
    const menu = h('div', {
      class: 'nx-menu nx-glass',
      role: 'menu',
      'aria-label': level === 0 ? label : undefined,
      tabindex: '-1',
    });
    /** @type {HTMLElement[]} */
    const rows = [];
    for (const entry of items) {
      if (entry === 'separator') {
        menu.append(h('div', { class: 'nx-menu-sep', role: 'separator' }));
        continue;
      }
      const checkable = entry.checked !== undefined;
      const row = h(
        'div',
        {
          class: `nx-menu-item${entry.danger ? ' is-danger' : ''}`,
          role: checkable ? 'menuitemcheckbox' : 'menuitem',
          'aria-checked': checkable ? String(!!entry.checked) : undefined,
          'aria-disabled': entry.disabled ? 'true' : undefined,
          'aria-haspopup': entry.submenu ? 'menu' : undefined,
          tabindex: '-1',
        },
        h(
          'span',
          { class: 'nx-menu-icon' },
          checkable
            ? entry.checked
              ? icon('check', { size: 16 })
              : ''
            : entry.icon
              ? icon(entry.icon, { size: 16 })
              : '',
        ),
        h('span', { class: 'nx-menu-label', text: entry.label }),
        entry.shortcut ? h('span', { class: 'nx-menu-shortcut', text: formatShortcut(entry.shortcut) }) : null,
        entry.submenu ? icon('chevron-right', { size: 14 }) : null,
      );
      const activate = () => {
        if (entry.disabled) return;
        if (entry.submenu) return openSub();
        close();
        entry.run?.();
      };
      const openSub = () => {
        if (!entry.submenu || entry.disabled) return;
        const r = row.getBoundingClientRect();
        const sub = render(entry.submenu, { x: r.right - 4, y: r.top - 4, flipX: r.left + 4 }, level + 1);
        focusRow(sub, 0);
      };
      row.addEventListener('click', activate);
      row.addEventListener('pointerenter', () => {
        row.focus({ preventScroll: true });
        if (entry.submenu) openSub();
        else while (stack.length > level + 1) stack.pop()?.remove();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        } else if (e.key === 'ArrowRight' && entry.submenu) {
          e.preventDefault();
          openSub();
        }
      });
      menu.append(row);
      rows.push(row);
    }
    menu.addEventListener('keydown', (e) => onKey(e, menu, rows, level));
    menu.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.append(menu);
    stack.push(menu);
    // Position inside the viewport.
    const { width, height } = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = at.x;
    if (left + width > vw - 4) left = at.flipX !== undefined ? at.flipX - width : vw - width - 4;
    let top = at.y;
    if (top + height > vh - 4) top = Math.max(4, vh - height - 4);
    menu.style.left = `${Math.max(4, left)}px`;
    menu.style.top = `${top}px`;
    return menu;
  }

  /** @param {HTMLElement} menu @param {number} index */
  function focusRow(menu, index) {
    const rows = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.nx-menu-item')]);
    rows[(index + rows.length) % rows.length]?.focus({ preventScroll: true });
  }

  /**
   * @param {KeyboardEvent} e
   * @param {HTMLElement} menu
   * @param {HTMLElement[]} rows
   * @param {number} level
   */
  function onKey(e, menu, rows, level) {
    const current = rows.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const enabled = (/** @type {number} */ i) => rows[i] && rows[i].getAttribute('aria-disabled') !== 'true';
    const move = (/** @type {number} */ dir) => {
      for (let step = 1; step <= rows.length; step++) {
        const i = (current + dir * step + rows.length * 2) % rows.length;
        if (enabled(i)) return rows[i].focus({ preventScroll: true });
      }
    };
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        focusRow(menu, 0);
        break;
      case 'End':
        e.preventDefault();
        focusRow(menu, rows.length - 1);
        break;
      case 'Escape':
      case 'ArrowLeft':
        e.preventDefault();
        e.stopPropagation();
        if (level === 0 && e.key === 'Escape') close();
        else if (level > 0) {
          menu.remove();
          stack.pop();
          /** @type {HTMLElement | undefined} */ (
            stack.at(-1)?.querySelector('.nx-menu-item[aria-haspopup]:focus-within, .nx-menu-item')
          )?.focus();
        }
        break;
      case 'Tab':
        e.preventDefault();
        close();
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const k = e.key.toLowerCase();
          const start = current + 1;
          for (let i = 0; i < rows.length; i++) {
            const row = rows[(start + i) % rows.length];
            if (row.textContent?.trim().toLowerCase().startsWith(k)) {
              row.focus();
              break;
            }
          }
        }
    }
  }

  let at = { x, y };
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    at = { x: r.left, y: r.bottom + 4 };
  }
  const menu = render(entries, at, 0);
  menu.focus({ preventScroll: true });
  // Opened by keyboard: focus the first item.
  if (!(x || y) || anchor) focusRow(menu, 0);
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
  });
  closeOpenMenu = close;
  return close;
}

/**
 * Wires right-click, the context-menu key / Shift+F10 and touch long-press to a menu.
 * @param {HTMLElement} el
 * @param {(event: { x: number, y: number, target: EventTarget | null }) => MenuEntry[] | null} getEntries
 * @param {{ label?: string }} [options]
 */
export function attachContextMenu(el, getEntries, { label } = {}) {
  const show = (/** @type {number} */ x, /** @type {number} */ y, /** @type {EventTarget | null} */ target) => {
    const entries = getEntries({ x, y, target });
    if (entries?.length) openMenu(entries, { x, y, label });
  };
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    // Keyboard-triggered contextmenu events have no pointer position.
    if (e.clientX === 0 && e.clientY === 0) {
      const r = /** @type {HTMLElement} */ (e.target).getBoundingClientRect?.() ?? el.getBoundingClientRect();
      show(r.left + 8, r.top + 8, e.target);
    } else show(e.clientX, e.clientY, e.target);
  });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let start = { x: 0, y: 0 };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    start = { x: e.clientX, y: e.clientY };
    timer = setTimeout(() => show(start.x, start.y, e.target), 550);
  });
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
  });
}

/** Closes any open menu (e.g. before opening an overlay). */
export function closeMenus() {
  closeOpenMenu?.();
}
