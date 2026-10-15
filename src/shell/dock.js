// @ts-check
// Dock: pinned apps plus running ones, with running dots, badges, progress bars, previews of
// multiple windows, a context menu, drag-to-reorder, hover magnification and auto-hide.
import { h, replace } from '../ui/dom.js';
import { attachContextMenu } from '../ui/menu.js';
import { openPopover } from '../ui/overlay.js';
import { appIcon } from './app-icon.js';
import './dock.css';
import { appName } from './util.js';
import { windowThumb } from './wm/thumb.js';

/** @param {import('./shell.js').ShellContext} shell */
export function createDock(shell) {
  const sys = shell.system();
  const { t, wm, session } = shell;
  const list = h('ul', { class: 'nx-dock-list', role: 'toolbar', 'aria-label': t('shell.dock') });
  const dock = h('nav', { class: 'nx-dock nx-glass', 'aria-label': t('shell.dock') }, list);
  const hotEdge = h('div', { class: 'nx-dock-hot-edge', 'aria-hidden': 'true' });
  shell.layers.chrome.append(hotEdge, dock);
  /** @type {Map<string, HTMLElement>} */
  const buttons = new Map();
  /** @type {ReturnType<typeof openPopover> | null} */
  let preview = null;

  const setting = (/** @type {string} */ key) => sys.settings.get('system', key);
  const position = () => /** @type {'bottom' | 'left' | 'right'} */ (setting('dockPosition'));
  const size = () => /** @type {number} */ (setting('dockSize'));

  /** Windows of an app, most recently focused first. @param {string} appId */
  const windowsOf = (appId) => wm.list().filter((w) => w.appId === appId);

  /** @param {string} appId */
  function activate(appId) {
    const wins = windowsOf(appId);
    if (!wins.length) return void shell.launch(appId);
    const onCurrent = wins.filter((w) => w.workspace === wm.current);
    if (wins.length === 1 || onCurrent.length === 1) {
      const w = onCurrent[0] ?? wins[0];
      if (wm.focusedId() === w.id && !w.minimized) wm.minimize(w.id);
      else wm.focus(w.id);
      return;
    }
    showPreviews(appId);
  }

  /** Window list with scaled live snapshots for apps with several windows. @param {string} appId */
  function showPreviews(appId) {
    const anchor = buttons.get(appId);
    if (!anchor) return;
    preview?.close();
    const items = windowsOf(appId).map((w) => {
      const thumb = windowThumb(w, 180, 110);
      return h(
        'button',
        {
          class: 'nx-dock-preview',
          type: 'button',
          onclick: () => {
            preview?.close();
            wm.focus(w.id);
          },
        },
        thumb,
        h('span', { text: w.title }),
      );
    });
    preview = openPopover(anchor, h('div', { class: 'nx-dock-previews', role: 'menu' }, ...items), {
      label: appName(sys, appId),
      onClose: () => (preview = null),
    });
  }

  function render() {
    const pinned = session.data.pinned.filter((id) => sys.registry.isEnabled(id));
    const running = [...new Set(wm.list().map((w) => w.appId))].filter((id) => !pinned.includes(id));
    buttons.clear();
    const item = (/** @type {string} */ appId, /** @type {boolean} */ isPinned) => {
      const manifest = sys.registry.get(appId);
      if (!manifest) return null;
      const wins = windowsOf(appId);
      const badge = wins.reduce((sum, w) => sum + (w.badge ?? 0), 0);
      const progress = wins.reduce(
        (max, w) => (w.progress === null ? max : Math.max(max ?? 0, w.progress)),
        /** @type {number | null} */ (null),
      );
      const name = appName(sys, appId);
      const btn = h(
        'button',
        {
          class: 'nx-dock-item',
          type: 'button',
          'aria-label': wins.length ? t('shell.dockRunning', { app: name, count: wins.length }) : name,
          'data-tooltip': name,
          dataset: { app: appId },
          onclick: () => activate(appId),
          onauxclick: (/** @type {MouseEvent} */ e) => e.button === 1 && void shell.launch(appId),
        },
        appIcon(manifest, size()),
        badge ? h('span', { class: 'nx-badge nx-dock-badge', text: badge > 99 ? '99+' : String(badge) }) : null,
        progress !== null ? h('span', { class: 'nx-dock-progress', style: { '--p': String(progress) } }) : null,
        h(
          'span',
          { class: 'nx-dock-dots', 'aria-hidden': 'true' },
          ...Array.from({ length: Math.min(3, wins.length) }, () => h('i')),
        ),
      );
      btn.addEventListener('pointerenter', () => {
        if (wins.length > 1) setTimeout(() => btn.matches(':hover') && !preview && showPreviews(appId), 500);
      });
      attachContextMenu(btn, () => [
        {
          label: t('shell.newWindow'),
          icon: 'plus',
          disabled: !!manifest.window?.singleInstance && wins.length > 0,
          run: () => void shell.launch(appId),
        },
        isPinned
          ? {
              label: t('shell.unpin'),
              icon: 'pin-off',
              run: () => session.setPinned(session.data.pinned.filter((id) => id !== appId)),
            }
          : { label: t('shell.pin'), icon: 'pin', run: () => session.setPinned([...session.data.pinned, appId]) },
        'separator',
        {
          label: t('shell.closeAll'),
          icon: 'close',
          disabled: !wins.length,
          run: () => wins.forEach((w) => void sys.lifecycle.close(w.id)),
        },
      ]);
      if (isPinned) enableReorder(btn, appId);
      buttons.set(appId, btn);
      return h('li', { role: 'none' }, btn);
    };
    replace(
      list,
      ...pinned
        .map((id) => item(id, true))
        .filter((x) => !!x)
        .map((x) => /** @type {HTMLElement} */ (x)),
      ...(running.length ? [h('li', { class: 'nx-dock-sep', role: 'separator' })] : []),
      ...running
        .map((id) => item(id, false))
        .filter((x) => !!x)
        .map((x) => /** @type {HTMLElement} */ (x)),
      h('li', { class: 'nx-dock-sep', role: 'separator' }),
      h(
        'li',
        { role: 'none' },
        h(
          'button',
          {
            class: 'nx-dock-item nx-dock-apps',
            type: 'button',
            'aria-label': t('shell.launcher'),
            'data-tooltip': t('shell.launcher'),
            onclick: () => shell.ui.launcher?.toggle(),
          },
          appIcon({ icon: 'apps', category: 'system' }, size()),
        ),
      ),
    );
  }

  /** Pointer-based reorder of pinned apps. @param {HTMLElement} btn @param {string} appId */
  function enableReorder(btn, appId) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const start = { x: e.clientX, y: e.clientY };
      let dragging = false;
      /** @param {PointerEvent} ev */
      const move = (ev) => {
        if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 8) return;
        if (!dragging) {
          dragging = true;
          btn.setPointerCapture(ev.pointerId);
          btn.classList.add('is-dragging');
        }
        const horizontal = position() === 'bottom';
        btn.style.transform = horizontal
          ? `translateX(${ev.clientX - start.x}px)`
          : `translateY(${ev.clientY - start.y}px)`;
      };
      /** @param {PointerEvent} ev */
      const up = (ev) => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerup', up);
        if (!dragging) return;
        btn.style.transform = '';
        btn.classList.remove('is-dragging');
        // Suppress the click that follows the drag.
        btn.addEventListener('click', (c) => c.stopImmediatePropagation(), { capture: true, once: true });
        const horizontal = position() === 'bottom';
        const pinned = session.data.pinned.filter((id) => sys.registry.isEnabled(id));
        const centers = pinned.map((id) => {
          const r = /** @type {HTMLElement} */ (buttons.get(id)).getBoundingClientRect();
          return horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
        });
        const pos = horizontal ? ev.clientX : ev.clientY;
        const others = pinned.filter((id) => id !== appId);
        const index = centers.filter((c, i) => pinned[i] !== appId && c < pos).length;
        others.splice(index, 0, appId);
        session.setPinned([...others, ...session.data.pinned.filter((id) => !pinned.includes(id))]);
        render();
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerup', up);
    });
  }

  // Hover magnification (macOS-like): icons near the pointer grow.
  dock.addEventListener('pointermove', (e) => {
    if (!setting('dockMagnification') || sys.theme.motion !== 'full' || e.pointerType === 'touch') return;
    const horizontal = position() === 'bottom';
    for (const btn of list.querySelectorAll('.nx-dock-item')) {
      const r = btn.getBoundingClientRect();
      const center = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
      const distance = Math.abs((horizontal ? e.clientX : e.clientY) - center);
      const scale = 1 + 0.45 * Math.max(0, 1 - distance / (size() * 2.2));
      /** @type {HTMLElement} */ (btn).style.setProperty('--mag', scale.toFixed(3));
    }
  });
  dock.addEventListener('pointerleave', () => {
    for (const btn of list.querySelectorAll('.nx-dock-item'))
      /** @type {HTMLElement} */ (btn).style.setProperty('--mag', '1');
  });

  // Auto-hide: reveal at the screen edge, on hover and while focused.
  let revealTimer = 0;
  const setRevealed = (/** @type {boolean} */ on) => dock.classList.toggle('is-revealed', on);
  hotEdge.addEventListener('pointerenter', () => setRevealed(true));
  dock.addEventListener('pointerenter', () => clearTimeout(revealTimer));
  dock.addEventListener('pointerleave', () => {
    if (!dock.contains(document.activeElement)) revealTimer = window.setTimeout(() => setRevealed(false), 600);
  });
  dock.addEventListener('focusin', () => setRevealed(true));
  dock.addEventListener('focusout', () => !dock.matches(':hover') && setRevealed(false));

  function applySettings() {
    dock.dataset.position = position();
    hotEdge.dataset.position = position();
    dock.classList.toggle('is-autohide', !!setting('dockAutoHide'));
    hotEdge.hidden = !setting('dockAutoHide');
    dock.style.setProperty('--dock-size', `${size()}px`);
    render();
    wm.relayout();
  }

  for (const type of [
    'window:opened',
    'window:closed',
    'window:changed',
    'app:registered',
    'app:enabled-changed',
    'i18n:changed',
  ])
    sys.bus.on(type, () => render());
  sys.settings.onChange('system', '*', (_v, key) => key.startsWith('dock') && applySettings());
  const originalSetPinned = session.setPinned.bind(session);
  session.setPinned = (pinned) => {
    originalSetPinned(pinned);
    render();
  };
  applySettings();

  return {
    element: dock,
    /** Space the dock takes from the work area. */
    reserved() {
      const full = size() + 20;
      if (setting('dockAutoHide') || window.innerWidth < 768) return { bottom: 0, left: 0, right: 0 };
      const p = position();
      return { bottom: p === 'bottom' ? full : 0, left: p === 'left' ? full : 0, right: p === 'right' ? full : 0 };
    },
    /** Where a window minimizes to. @param {string} appId */
    iconRect: (appId) => buttons.get(appId)?.getBoundingClientRect() ?? null,
    render,
  };
}
