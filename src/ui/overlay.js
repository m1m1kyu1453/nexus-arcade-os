// @ts-check
// Modal dialogs, anchored popovers and tooltips.
import { focusedElement, h } from './dom.js';
import './overlay.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** @param {HTMLElement} root */
export function focusableIn(root) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(FOCUSABLE)]).filter(
    (el) => !el.hasAttribute('hidden') && el.getClientRects().length > 0,
  );
}

/**
 * Keeps Tab focus inside `root`. Returns a function that removes the trap.
 * @param {HTMLElement} root
 */
export function trapFocus(root) {
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key !== 'Tab') return;
    const items = focusableIn(root);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = /** @type {HTMLElement} */ (items.at(-1));
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

/**
 * @template T
 * @typedef {object} ModalOptions
 * @property {string} title
 * @property {Node | string} [body]
 * @property {{ label: string, value: T, variant?: 'primary' | 'danger' | 'ghost', disabled?: () => boolean, accept?: () => boolean | Promise<boolean> }[]} [actions]
 *   `accept` runs before closing; returning false keeps the modal open (e.g. after a failed check)
 * @property {T} [dismissValue]        result when closed with Escape / backdrop / ×
 * @property {(close: (value: T) => void) => void} [onOpen]  wire inputs (e.g. Enter submits)
 * @property {string} [className]
 * @property {'sm' | 'md' | 'lg'} [size]
 */

/**
 * Opens a modal dialog and resolves with the chosen action's value.
 * @template T
 * @param {ModalOptions<T>} options
 * @returns {Promise<T>}
 */
export function openModal({ title, body, actions = [], dismissValue, onOpen, className = '', size = 'sm' }) {
  return new Promise((resolve) => {
    const previous = focusedElement();
    const titleId = `nx-modal-${Math.random().toString(36).slice(2)}`;
    const footer = h('footer', { class: 'nx-modal-actions' });
    const dialog = h(
      'div',
      {
        class: `nx-modal nx-glass is-${size} ${className}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
      },
      h('div', { class: 'nx-modal-head' }, h('h2', { id: titleId, text: title })),
      h('div', { class: 'nx-modal-body' }, typeof body === 'string' ? h('p', { text: body }) : (body ?? '')),
      footer,
    );
    const backdrop = h('div', { class: 'nx-modal-backdrop' }, dialog);
    let done = false;
    /** @param {T} value */
    const close = (value) => {
      if (done) return;
      done = true;
      untrap();
      backdrop.classList.add('is-closing');
      setTimeout(() => backdrop.remove(), 150);
      previous?.focus?.({ preventScroll: true });
      resolve(value);
    };
    for (const action of actions) {
      const btn = h('button', {
        class: `nx-btn${action.variant ? ` is-${action.variant}` : ''}`,
        type: 'button',
        text: action.label,
        onclick: async () => {
          if (!action.accept || (await action.accept())) close(action.value);
        },
      });
      if (action.disabled) {
        const update = () => (btn.disabled = action.disabled?.() ?? false);
        update();
        dialog.addEventListener('input', update);
        dialog.addEventListener('change', update);
      }
      footer.append(btn);
    }
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close(/** @type {T} */ (dismissValue));
    });
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(/** @type {T} */ (dismissValue));
      }
    });
    document.body.append(backdrop);
    const untrap = trapFocus(dialog);
    onOpen?.(close);
    const first =
      focusableIn(dialog.querySelector('.nx-modal-body') ?? dialog)[0] ??
      footer.querySelector('.is-primary') ??
      focusableIn(dialog)[0];
    first?.focus();
  });
}

/**
 * A popover anchored to an element; closes on outside click, Escape or `close()`.
 * @param {HTMLElement} anchor
 * @param {Node} content
 * @param {{ placement?: 'below' | 'above' | 'auto', onClose?: () => void, className?: string, label?: string }} [options]
 */
export function openPopover(anchor, content, { placement = 'auto', onClose, className = '', label } = {}) {
  const pop = h(
    'div',
    { class: `nx-popover nx-glass ${className}`, role: 'dialog', 'aria-label': label, tabindex: '-1' },
    content,
  );
  document.body.append(pop);
  const a = anchor.getBoundingClientRect();
  const p = pop.getBoundingClientRect();
  const below = placement === 'below' || (placement === 'auto' && a.bottom + p.height + 8 < window.innerHeight);
  const top = below ? a.bottom + 8 : a.top - p.height - 8;
  const left = Math.min(Math.max(4, a.left + a.width / 2 - p.width / 2), window.innerWidth - p.width - 4);
  pop.style.top = `${Math.max(4, top)}px`;
  pop.style.left = `${left}px`;
  const previous = focusedElement();
  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    pop.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc, true);
    if (pop.contains(document.activeElement) || document.activeElement === document.body) previous?.focus?.();
    onClose?.();
  };
  /** @param {PointerEvent} e */
  const outside = (e) => {
    const t = /** @type {Node} */ (e.target);
    if (!pop.contains(t) && !anchor.contains(t)) close();
  };
  /** @param {KeyboardEvent} e */
  const esc = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  document.addEventListener('keydown', esc, true);
  (focusableIn(pop)[0] ?? pop).focus({ preventScroll: true });
  return {
    element: pop,
    close,
    get open() {
      return open;
    },
  };
}

/**
 * Tooltips for every element with `data-tooltip` (hover and keyboard focus). Install once.
 * @param {Document} doc
 */
export function installTooltips(doc = document) {
  const tip = h('div', { class: 'nx-tooltip', role: 'tooltip' });
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const hide = () => {
    clearTimeout(timer);
    tip.remove();
  };
  /** @param {Event} e */
  const show = (e) => {
    const target = /** @type {HTMLElement} */ (e.target).closest?.('[data-tooltip]');
    if (!(target instanceof HTMLElement) || !target.dataset.tooltip) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      tip.textContent = target.dataset.tooltip ?? '';
      doc.body.append(tip);
      const r = target.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const below = r.top < 40;
      tip.style.top = `${below ? r.bottom + 6 : r.top - t.height - 6}px`;
      tip.style.left = `${Math.min(Math.max(4, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 4)}px`;
    }, 450);
  };
  doc.addEventListener('pointerover', show);
  doc.addEventListener('focusin', show);
  doc.addEventListener('pointerout', hide);
  doc.addEventListener('focusout', hide);
  doc.addEventListener('pointerdown', hide, true);
  doc.addEventListener('keydown', hide, true);
}
