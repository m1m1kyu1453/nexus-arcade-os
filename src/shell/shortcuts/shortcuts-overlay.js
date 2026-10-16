// @ts-check
// Keyboard shortcut overlay: hold Mod+/ to see every shortcut available right now (commands whose
// `when` matches the current focus), grouped by category. A quick tap keeps it open until Escape.
import { formatShortcut } from '../../services/commands/keys.js';
import { focusedElement, h, icon, replace } from '../../ui/dom.js';
import { trapFocus } from '../../ui/overlay.js';
import { registerCommand } from '../util.js';
import './shortcuts-overlay.css';

/** Holding longer than this means "show while held"; a shorter tap pins the overlay. */
const HOLD_MS = 350;

/** @param {import('../shell.js').ShellContext} shell */
export function createShortcutsOverlay(shell) {
  const sys = shell.system();
  const { t } = shell;
  const titleId = 'nx-shortcuts-title';
  const columns = h('div', { class: 'nx-shortcuts-columns' });
  const panel = h(
    'div',
    {
      class: 'nx-shortcuts nx-glass',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
    },
    h(
      'header',
      { class: 'nx-shortcuts-head' },
      icon('keyboard', { size: 20 }),
      h('h2', { id: titleId, text: t('shortcuts.title') }),
      h('span', { class: 'nx-shortcuts-hint', text: t('shortcuts.hint', { keys: formatShortcut('Mod+/') }) }),
    ),
    columns,
  );
  const backdrop = h('div', { class: 'nx-shortcuts-backdrop', hidden: true }, panel);
  document.body.append(backdrop);

  let openedAt = 0;
  let pinned = false;
  /** @type {(() => void) | null} */
  let untrap = null;
  /** @type {HTMLElement | null} */
  let previous = null;

  function render() {
    /** @type {Map<string, { title: string, shortcut: string }[]>} */
    const groups = new Map();
    for (const c of sys.commands.list()) {
      const shortcut = sys.shortcuts.bindingFor(c.id);
      if (!shortcut) continue;
      const category = c.category ?? t('shortcuts.other');
      groups.set(category, [...(groups.get(category) ?? []), { title: c.title, shortcut }]);
    }
    if (!groups.size) {
      replace(columns, h('p', { class: 'nx-empty', text: t('shortcuts.none') }));
      return;
    }
    replace(
      columns,
      ...[...groups].map(([category, items]) =>
        h(
          'section',
          { class: 'nx-shortcuts-group' },
          h('h3', { text: category }),
          h(
            'dl',
            {},
            ...items.flatMap((item) => [
              h('dt', { text: item.title }),
              h(
                'dd',
                {},
                ...formatShortcut(item.shortcut)
                  .split(' ')
                  .map((step) => h('kbd', { class: 'nx-kbd', text: step })),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  /** @param {{ pin?: boolean }} [options] */
  function open({ pin = true } = {}) {
    if (isOpen()) {
      // Pressing the shortcut again while pinned closes it.
      if (pinned) close();
      return;
    }
    render();
    previous = focusedElement();
    openedAt = performance.now();
    pinned = pin;
    backdrop.hidden = false;
    untrap = trapFocus(panel);
    panel.focus({ preventScroll: true });
  }

  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    untrap?.();
    untrap = null;
    previous?.focus?.({ preventScroll: true });
  }

  const isOpen = () => !backdrop.hidden;

  // Releasing Mod or "/" after a hold closes; after a tap the overlay stays (pinned).
  addEventListener(
    'keyup',
    (e) => {
      if (!isOpen() || pinned) return;
      if (!['Control', 'Meta', '/'].includes(e.key)) return;
      if (performance.now() - openedAt >= HOLD_MS) close();
      else pinned = true;
    },
    { capture: true },
  );
  // Switching away from the tab while holding never delivers the keyup.
  addEventListener('blur', () => !pinned && close());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());

  registerCommand(sys, {
    id: 'shell.shortcuts',
    title: 'shortcuts.title',
    icon: 'keyboard',
    shortcut: 'Mod+/',
    run: () => open({ pin: false }),
  });

  return { open, close, isOpen };
}
