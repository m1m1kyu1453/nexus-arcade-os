// @ts-check
// Notification center + quick settings: a slide-out panel with quick tiles, the "While you
// were away" summary from the scheduler, and notifications grouped by app (clear one/all,
// actions). Opens from the bell, with Alt+N, or by swiping down on phones.
import { h, icon, replace } from '../../ui/dom.js';
import { closeMenus } from '../../ui/menu.js';
import { trapFocus } from '../../ui/overlay.js';
import { appIcon } from '../app-icon.js';
import { takeScreenshot } from '../screenshot.js';
import { appName, registerCommand } from '../util.js';
import './center.css';

const FOCUS_MINUTES = 25;

/** @param {import('../shell.js').ShellContext} shell */
export function createNotificationCenter(shell) {
  const sys = shell.system();
  const { t } = shell;
  const tiles = h('div', { class: 'nx-qs-tiles' });
  const volume = h('input', { class: 'nx-slider', type: 'range', min: '0', max: '1', step: '0.05' });
  const content = h('div', { class: 'nx-center-list' });
  const clearAll = h('button', { class: 'nx-btn is-ghost', type: 'button' });
  const heading = h('h2', { id: 'nx-center-title' });
  const panel = h(
    'aside',
    { class: 'nx-center nx-glass', role: 'dialog', 'aria-labelledby': 'nx-center-title', tabindex: '-1' },
    tiles,
    h('div', { class: 'nx-qs-volume' }, icon('volume-low', { size: 16 }), volume, icon('volume', { size: 16 })),
    h('div', { class: 'nx-center-head' }, heading, clearAll),
    content,
  );
  const backdrop = h('div', { class: 'nx-center-backdrop', hidden: true }, panel);
  document.body.append(backdrop);
  trapFocus(panel);
  /** @type {HTMLElement | null} */
  let previousFocus = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let focusTimer;
  let focusEndsAt = 0;

  const isOpen = () => !backdrop.hidden;
  const setting = (/** @type {string} */ key) => sys.settings.get('system', key);

  function open() {
    closeMenus();
    previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    backdrop.hidden = false;
    render();
    panel.focus();
  }
  function close() {
    if (!isOpen()) return;
    backdrop.hidden = true;
    void sys.notifications.markAllRead();
    previousFocus?.focus?.({ preventScroll: true });
  }

  /**
   * @param {{ id: string, icon: string, label: string, active?: boolean, onClick: () => unknown }} tile
   */
  const tile = ({ id, icon: iconName, label, active, onClick }) =>
    h(
      'button',
      {
        class: `nx-qs-tile${active ? ' is-active' : ''}`,
        type: 'button',
        'aria-pressed': active === undefined ? undefined : String(active),
        dataset: { tile: id },
        onclick: async () => {
          await onClick();
          renderTiles();
        },
      },
      icon(iconName, { size: 20 }),
      h('span', { text: label }),
    );

  function renderTiles() {
    const dark = sys.theme.scheme === 'dark';
    const focusLeft = Math.max(0, Math.ceil((focusEndsAt - Date.now()) / 60_000));
    replace(
      tiles,
      tile({
        id: 'dnd',
        icon: 'bell-off',
        label: t('center.dnd'),
        active: !!setting('doNotDisturb'),
        onClick: () => sys.settings.set('system', 'doNotDisturb', !setting('doNotDisturb')),
      }),
      tile({
        id: 'theme',
        icon: dark ? 'moon' : 'sun',
        label: t(dark ? 'center.dark' : 'center.light'),
        active: dark,
        onClick: () => sys.settings.set('system', 'theme', setting(dark ? 'themeAutoLight' : 'themeAutoDark')),
      }),
      tile({
        id: 'saver',
        icon: 'battery-saver',
        label: t('center.batterySaver'),
        active: !!setting('batterySaver'),
        onClick: () => sys.settings.set('system', 'batterySaver', !setting('batterySaver')),
      }),
      tile({
        id: 'mute',
        icon: 'volume-off',
        label: t('center.mute'),
        active: !!setting('soundMuted'),
        onClick: () => sys.settings.set('system', 'soundMuted', !setting('soundMuted')),
      }),
      tile({
        id: 'focus',
        icon: 'target',
        label: focusLeft
          ? t('center.focusLeft', { minutes: focusLeft })
          : t('center.focus', { minutes: FOCUS_MINUTES }),
        active: focusLeft > 0,
        onClick: toggleFocus,
      }),
      tile({
        id: 'screenshot',
        icon: 'screenshot',
        label: t('center.screenshot'),
        onClick: () => (close(), screenshot()),
      }),
      tile({ id: 'lock', icon: 'lock', label: t('center.lock'), onClick: () => (close(), shell.ui.lock?.lock()) }),
      tile({
        id: 'personalize',
        icon: 'palette',
        label: t('shell.personalize'),
        onClick: () => (close(), shell.ui.personalize?.open()),
      }),
    );
    volume.value = String(setting('soundMaster'));
    volume.setAttribute('aria-label', t('shell.volume'));
  }

  function toggleFocus() {
    clearTimeout(focusTimer);
    if (focusEndsAt > Date.now()) {
      focusEndsAt = 0;
      sys.notifications.setFocusMode(false);
      return;
    }
    focusEndsAt = Date.now() + FOCUS_MINUTES * 60_000;
    sys.notifications.setFocusMode(true);
    focusTimer = setTimeout(() => {
      focusEndsAt = 0;
      sys.notifications.setFocusMode(false);
      void sys.notifications.notify({ title: t('center.focusDone'), urgent: true });
      renderTiles();
    }, FOCUS_MINUTES * 60_000);
  }

  async function screenshot() {
    try {
      const path = await takeScreenshot(sys);
      if (path) await sys.notifications.notify({ title: t('center.screenshotSaved'), body: path });
    } catch (error) {
      await sys.notifications.notify({
        title: t('center.screenshotFailed'),
        body: String(/** @type {Error} */ (error)?.message ?? error),
      });
    }
  }

  async function renderList() {
    heading.textContent = t('center.title');
    clearAll.textContent = t('center.clearAll');
    const history = await sys.notifications.history({ limit: 200 });
    clearAll.hidden = history.length === 0;
    if (!history.length) {
      replace(
        content,
        h('div', { class: 'nx-empty' }, icon('bell', { size: 28 }), h('span', { text: t('center.empty') })),
      );
      return;
    }
    const away = history.filter((n) => n.group === 'away');
    /** @type {Map<string, any[]>} */
    const byApp = new Map();
    for (const n of history) {
      if (n.group === 'away') continue;
      byApp.set(n.app, [...(byApp.get(n.app) ?? []), n]);
    }
    const sections = [];
    if (away.length) sections.push(group(t('center.away'), null, away));
    for (const [app, list] of byApp)
      sections.push(group(app === 'system' ? t('center.system') : appName(sys, app), app, list));
    replace(content, ...sections);
  }

  /** @param {string} title @param {string | null} app @param {any[]} list */
  function group(title, app, list) {
    const manifest = app ? sys.registry.get(app) : null;
    return h(
      'section',
      { class: 'nx-center-group' },
      h(
        'header',
        {},
        manifest ? appIcon(manifest, 22) : icon(app === null ? 'clock' : 'nexus-mark', { size: 18 }),
        h('strong', { text: title }),
        h(
          'button',
          {
            class: 'nx-icon-btn',
            type: 'button',
            'aria-label': t('center.clearGroup', { group: title }),
            onclick: async () => {
              for (const n of list) await sys.notifications.clear(n.id);
            },
          },
          icon('x', { size: 14 }),
        ),
      ),
      ...list.map((n) =>
        h(
          'article',
          { class: `nx-center-item${n.read ? '' : ' is-unread'}` },
          h(
            'div',
            {},
            h('strong', { text: n.title }),
            n.body ? h('p', { text: n.body }) : null,
            h('time', { text: sys.i18n.format.ago(n.createdAt) }),
          ),
          h(
            'button',
            {
              class: 'nx-icon-btn',
              type: 'button',
              'aria-label': t('center.clear'),
              onclick: () => sys.notifications.clear(n.id),
            },
            icon('x', { size: 14 }),
          ),
          n.actions?.length
            ? h(
                'div',
                { class: 'nx-center-actions' },
                ...n.actions.map((/** @type {{ id: string, label: string }} */ a) =>
                  h('button', {
                    class: 'nx-btn',
                    type: 'button',
                    text: a.label,
                    onclick: () => sys.notifications.triggerAction(n.id, a.id),
                  }),
                ),
              )
            : null,
        ),
      ),
    );
  }

  function render() {
    renderTiles();
    void renderList();
  }

  volume.addEventListener('input', () => sys.settings.set('system', 'soundMaster', Number(volume.value)));
  clearAll.addEventListener('click', () => sys.notifications.clear());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  });
  backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());
  sys.bus.on('notifications:history-changed', () => isOpen() && void renderList());
  sys.bus.on('theme:changed', () => isOpen() && renderTiles());
  sys.settings.onChange('system', '*', () => isOpen() && renderTiles());

  registerCommand(sys, {
    id: 'shell.notifications',
    title: 'center.title',
    icon: 'bell',
    shortcut: 'Alt+N',
    run: () => (isOpen() ? close() : open()),
  });
  registerCommand(sys, { id: 'shell.focus', title: 'center.focusCommand', icon: 'target', run: toggleFocus });
  registerCommand(sys, { id: 'shell.screenshot', title: 'center.screenshot', icon: 'screenshot', run: screenshot });
  return { open, close, toggle: () => (isOpen() ? close() : open()), isOpen };
}
