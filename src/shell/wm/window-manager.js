// @ts-check
// Window manager: the lifecycle "host" that gives every app instance a window.
//
// Windows live in one container per workspace (so switching workspaces can slide). Each window
// has a title bar (icon, title, minimize/maximize/close), resize handles on all edges and
// corners, a cursor-following glow when focused, and states: normal, maximized, snapped,
// minimized. Snapping happens by dragging to screen edges/corners (with a preview), by the
// snap layouts flyout on the maximize button, or with Mod+Arrows. The layout is saved and
// restored after a reload by the shell (see `snapshot()` / `queueRestore()`).
import { h, icon } from '../../ui/dom.js';
import { renderCrashView } from '../crash-view.js';
import { clampRect, placeWindow, sharedEdgeNeighbours, SNAP_LAYOUTS, zoneAt, zoneRect } from './geometry.js';
import './wm.css';

/** @typedef {import('./geometry.js').Rect} Rect */
/** @typedef {import('./geometry.js').Zone} Zone */
/** @typedef {'normal' | 'maximized' | 'snapped'} WindowState */

/**
 * @typedef {object} Win
 * @property {string} id            instance id
 * @property {string} appId
 * @property {import('../../kernel/types').AppManifest} manifest
 * @property {HTMLElement} el
 * @property {HTMLElement} body
 * @property {HTMLElement} titleEl
 * @property {string} title
 * @property {Rect} rect            current rectangle
 * @property {Rect} normalRect      rectangle to restore to
 * @property {WindowState} state
 * @property {Zone | null} zone
 * @property {boolean} minimized
 * @property {number} workspace
 * @property {number | null} badge
 * @property {number | null} progress
 * @property {boolean} fullscreen
 * @property {{ minW: number, minH: number }} min
 */

/**
 * @typedef {object} SavedWindow
 * @property {string} appId
 * @property {Rect} rect
 * @property {Rect} normalRect
 * @property {WindowState} state
 * @property {Zone | null} zone
 * @property {boolean} minimized
 * @property {number} workspace
 */

/**
 * @param {object} options
 * @param {HTMLElement} options.layer                    container for workspace layers
 * @param {() => import('../../kernel/system.js').System} options.system
 * @param {() => Rect} options.workArea                  viewport minus top bar / dock
 * @param {(appId: string) => DOMRect | null} [options.dockIconRect] minimize animation target
 * @param {() => void} [options.onChange]                layout changed (persist)
 */
export function createWindowManager({ layer, system, workArea, dockIconRect = () => null, onChange = () => {} }) {
  /** @type {Map<string, Win>} */
  const windows = new Map();
  /** Most recently focused first. @type {string[]} */
  let mru = [];
  /** @type {{ name: string }[]} */
  let workspaces = [];
  let current = 0;
  let zTop = 10;
  /** @type {Map<string, SavedWindow[]>} saved layouts waiting for their app to open */
  const restoreQueue = new Map();
  const preview = h('div', { class: 'nx-snap-preview', 'aria-hidden': 'true' });
  /** @type {HTMLElement[]} */
  let wsLayers = [];

  const sys = () => system();
  const motion = () => sys().theme.motion;
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars = {}) =>
    sys().i18n.t('system', key, vars);
  const emit = (/** @type {string} */ type, /** @type {unknown} */ payload) => sys().bus.emit(type, payload);

  /** @param {number} count */
  function setWorkspaces(count, names = []) {
    workspaces = Array.from({ length: Math.max(1, count) }, (_, i) => ({ name: names[i] ?? '' }));
    wsLayers.forEach((l) => l.remove());
    wsLayers = workspaces.map((_, i) => h('div', { class: 'nx-workspace', dataset: { index: String(i) } }));
    layer.replaceChildren(...wsLayers, preview);
    current = Math.min(current, workspaces.length - 1);
    for (const w of windows.values()) {
      w.workspace = Math.min(w.workspace, workspaces.length - 1);
      wsLayers[w.workspace].append(w.el);
    }
    layoutWorkspaces(false);
  }

  /** @param {boolean} animate */
  function layoutWorkspaces(animate) {
    wsLayers.forEach((l, i) => {
      l.classList.toggle('is-current', i === current);
      l.classList.toggle('is-animated', animate && motion() === 'full');
      l.style.transform = `translateX(${(i - current) * 100}%)`;
      l.inert = i !== current;
      l.setAttribute('aria-hidden', String(i !== current));
    });
  }

  /** Applies a window's rect/state to its element. @param {Win} w */
  function apply(w) {
    const r = w.fullscreen ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } : w.rect;
    Object.assign(w.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    w.el.classList.toggle('is-maximized', w.state === 'maximized');
    w.el.classList.toggle('is-snapped', w.state === 'snapped');
    w.el.classList.toggle('is-minimized', w.minimized);
    w.el.classList.toggle('is-fullscreen', w.fullscreen);
    const maxBtn = /** @type {HTMLElement} */ (w.el.querySelector('[data-action="maximize"]'));
    maxBtn.replaceChildren(icon(w.state === 'maximized' ? 'restore' : 'maximize', { size: 14 }));
    maxBtn.setAttribute('aria-label', t(w.state === 'maximized' ? 'wm.restore' : 'wm.maximize'));
  }

  /**
   * Animates between two rects (FLIP) when motion allows.
   * @param {Win} w
   * @param {Rect} from
   */
  function animateRect(w, from) {
    if (motion() !== 'full' || !w.el.animate) return;
    const to = w.rect;
    w.el.animate(
      [
        {
          transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) scale(${from.w / to.w}, ${from.h / to.h})`,
          transformOrigin: '0 0',
        },
        { transform: 'none', transformOrigin: '0 0' },
      ],
      { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
  }

  function changed() {
    emit('window:layout', {
      maximizedOnCurrent: [...windows.values()].some(
        (w) => w.workspace === current && !w.minimized && (w.state === 'maximized' || w.fullscreen),
      ),
    });
    onChange();
  }

  /** @param {Win} w */
  function raise(w) {
    w.el.style.zIndex = String(++zTop);
  }

  /** @param {string} id */
  function focus(id) {
    const w = windows.get(id);
    if (!w) return;
    if (w.workspace !== current) switchWorkspace(w.workspace);
    if (w.minimized) unminimize(w);
    raise(w);
    for (const other of windows.values()) other.el.classList.toggle('is-focused', other === w);
    mru = [id, ...mru.filter((x) => x !== id)];
    if (!w.el.contains(document.activeElement))
      (w.body.querySelector('[autofocus]') ?? w.el).focus({ preventScroll: true });
    emit('window:focused', { id });
    if (sys().lifecycle.focusedId !== id && sys().lifecycle.get(id)) sys().lifecycle.focus(id);
  }

  /** Focus the next visible window after `id` went away. @param {string} [except] */
  function focusTopmost(except) {
    const next = mru.find(
      (id) => id !== except && windows.get(id)?.workspace === current && !windows.get(id)?.minimized,
    );
    if (next) focus(next);
    else for (const w of windows.values()) w.el.classList.remove('is-focused');
  }

  /**
   * @param {Win} w
   * @param {Zone | null} zone   null = back to normal
   */
  function snap(w, zone) {
    const from = { ...w.rect };
    if (w.state === 'normal') w.normalRect = { ...w.rect };
    if (zone === null) {
      w.state = 'normal';
      w.zone = null;
      w.rect = clampRect(w.normalRect, workArea(), w.min);
    } else if (zone === 'max') {
      w.state = 'maximized';
      w.zone = 'max';
      w.rect = zoneRect('max', workArea());
    } else {
      w.state = 'snapped';
      w.zone = zone;
      w.rect = zoneRect(zone, workArea());
    }
    apply(w);
    animateRect(w, from);
    changed();
  }

  /** @param {Win} w */
  function minimize(w) {
    if (w.minimized) return;
    const target = dockIconRect(w.appId);
    const finish = () => {
      w.minimized = true;
      apply(w);
      sys().lifecycle.get(w.id) && sys().lifecycle.suspend(w.id, 'minimized');
      focusTopmost(w.id);
      changed();
    };
    if (motion() === 'full' && target && w.el.animate) {
      const r = w.el.getBoundingClientRect();
      const anim = w.el.animate(
        [
          { transform: 'none', opacity: 1 },
          {
            transform: `translate(${target.left + target.width / 2 - (r.left + r.width / 2)}px, ${target.top + target.height / 2 - (r.top + r.height / 2)}px) scale(0.08)`,
            opacity: 0,
          },
        ],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
      );
      anim.onfinish = finish;
    } else finish();
  }

  /** @param {Win} w */
  function unminimize(w) {
    if (!w.minimized) return;
    w.minimized = false;
    apply(w);
    sys().lifecycle.get(w.id) && sys().lifecycle.resume(w.id, 'minimized');
    const target = dockIconRect(w.appId);
    if (motion() === 'full' && target && w.el.animate) {
      const r = w.el.getBoundingClientRect();
      w.el.animate(
        [
          {
            transform: `translate(${target.left + target.width / 2 - (r.left + r.width / 2)}px, ${target.top + target.height / 2 - (r.top + r.height / 2)}px) scale(0.08)`,
            opacity: 0,
          },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    }
    changed();
  }

  /** @param {number} index @param {{ animate?: boolean }} [options] */
  function switchWorkspace(index, { animate = true } = {}) {
    if (index < 0 || index >= workspaces.length || index === current) return;
    const previous = current;
    current = index;
    layoutWorkspaces(animate);
    for (const w of windows.values()) {
      if (!sys().lifecycle.get(w.id)) continue;
      if (w.workspace === current) sys().lifecycle.resume(w.id, 'workspace');
      else if (w.workspace === previous) sys().lifecycle.suspend(w.id, 'workspace');
    }
    emit('workspace:changed', { index, previous });
    focusTopmost();
    changed();
  }

  /** @param {Win} w @param {number} index */
  function moveToWorkspace(w, index) {
    if (index < 0 || index >= workspaces.length || index === w.workspace) return;
    w.workspace = index;
    wsLayers[index].append(w.el);
    if (sys().lifecycle.get(w.id)) {
      if (index === current) sys().lifecycle.resume(w.id, 'workspace');
      else sys().lifecycle.suspend(w.id, 'workspace');
    }
    if (index !== current) focusTopmost(w.id);
    emit('window:moved', { id: w.id, workspace: index });
    changed();
  }

  // ─── Pointer interactions ──────────────────────────────────────────────
  /** @param {Win} w @param {PointerEvent} e */
  function startDrag(w, e) {
    if (e.button !== 0 || w.fullscreen) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startRect = { ...w.rect };
    let dragging = false;
    /** @type {Zone | null} */
    let zone = null;
    const target = /** @type {HTMLElement} */ (e.currentTarget);
    target.setPointerCapture(e.pointerId);
    /** @param {PointerEvent} ev */
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 4) return;
        dragging = true;
        w.el.classList.add('is-dragging');
        if (w.state !== 'normal') {
          // Dragging a maximized/snapped window restores it under the pointer.
          const ratio = (startX - startRect.x) / startRect.w;
          w.state = 'normal';
          w.zone = null;
          w.rect = { ...w.normalRect, x: Math.round(startX - w.normalRect.w * ratio), y: startRect.y };
          startRect.x = w.rect.x;
          startRect.y = w.rect.y;
          startRect.w = w.rect.w;
          startRect.h = w.rect.h;
        }
      }
      w.rect = { ...w.rect, x: startRect.x + dx, y: Math.max(workArea().y, startRect.y + dy) };
      apply(w);
      zone = zoneAt({ x: ev.clientX, y: ev.clientY }, workArea());
      showPreview(zone);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      showPreview(null);
      w.el.classList.remove('is-dragging');
      if (!dragging) return;
      if (zone) {
        w.normalRect = { ...w.rect };
        snap(w, zone);
      } else {
        w.rect = clampRect(w.rect, workArea(), w.min);
        w.normalRect = { ...w.rect };
        apply(w);
        changed();
      }
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /**
   * @param {Win} w
   * @param {string} dir  n, s, e, w, ne, nw, se, sw
   * @param {PointerEvent} e
   */
  function startResize(w, dir, e) {
    if (e.button !== 0 || w.fullscreen) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, rect: { ...w.rect } };
    const area = workArea();
    // Snapped neighbours that share the dragged edge move with it.
    const others = [...windows.values()].filter(
      (o) => o !== w && o.state === 'snapped' && o.workspace === w.workspace && !o.minimized,
    );
    /** @type {{ edge: 'left' | 'right' | 'top' | 'bottom', wins: { win: Win, rect: Rect }[] }[]} */
    const linked = [];
    if (w.state === 'snapped') {
      for (const edge of /** @type {const} */ (['left', 'right', 'top', 'bottom'])) {
        if (!dir.includes({ left: 'w', right: 'e', top: 'n', bottom: 's' }[edge])) continue;
        const ids = sharedEdgeNeighbours(
          w.rect,
          edge,
          others.map((o) => ({ id: o.id, rect: o.rect })),
        );
        linked.push({
          edge,
          wins: ids.map((id) => ({
            win: /** @type {Win} */ (windows.get(id)),
            rect: { .../** @type {Win} */ (windows.get(id)).rect },
          })),
        });
      }
    }
    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture(e.pointerId);
    w.el.classList.add('is-resizing');
    /** @param {PointerEvent} ev */
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      let { x, y, w: width, h: height } = start.rect;
      if (dir.includes('e')) width = Math.max(w.min.minW, Math.min(start.rect.w + dx, area.x + area.w - x));
      if (dir.includes('s')) height = Math.max(w.min.minH, Math.min(start.rect.h + dy, area.y + area.h - y));
      if (dir.includes('w')) {
        const nx = Math.max(area.x, Math.min(start.rect.x + dx, start.rect.x + start.rect.w - w.min.minW));
        width = start.rect.w + (start.rect.x - nx);
        x = nx;
      }
      if (dir.includes('n')) {
        const ny = Math.max(area.y, Math.min(start.rect.y + dy, start.rect.y + start.rect.h - w.min.minH));
        height = start.rect.h + (start.rect.y - ny);
        y = ny;
      }
      w.rect = { x, y, w: width, h: height };
      if (w.state === 'maximized') w.state = 'normal';
      apply(w);
      for (const { edge, wins } of linked) {
        for (const { win, rect } of wins) {
          if (edge === 'right') win.rect = { ...rect, x: x + width, w: rect.x + rect.w - (x + width) };
          if (edge === 'left') win.rect = { ...rect, w: x - rect.x };
          if (edge === 'bottom') win.rect = { ...rect, y: y + height, h: rect.y + rect.h - (y + height) };
          if (edge === 'top') win.rect = { ...rect, h: y - rect.y };
          apply(win);
        }
      }
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      w.el.classList.remove('is-resizing');
      if (w.state === 'normal') w.normalRect = { ...w.rect };
      emit('window:resized', { id: w.id });
      changed();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  /** @param {Zone | null} zone */
  function showPreview(zone) {
    if (!zone) {
      preview.classList.remove('is-visible');
      return;
    }
    const r = zoneRect(zone, workArea());
    Object.assign(preview.style, {
      left: `${r.x + 6}px`,
      top: `${r.y + 6}px`,
      width: `${r.w - 12}px`,
      height: `${r.h - 12}px`,
    });
    preview.classList.add('is-visible');
  }

  /** Snap layouts flyout under the maximize button. @param {Win} w @param {HTMLElement} anchor */
  function showSnapLayouts(w, anchor) {
    if (document.querySelector('.nx-snap-layouts')) return;
    const r = anchor.getBoundingClientRect();
    const flyout = h('div', { class: 'nx-snap-layouts nx-glass', role: 'menu', 'aria-label': t('wm.snapLayouts') });
    for (const layout of SNAP_LAYOUTS) {
      const area = { x: 0, y: 0, w: 60, h: 40 };
      const group = h('div', { class: 'nx-snap-layout' });
      for (const zone of layout.zones) {
        const z = zoneRect(zone, area);
        const cell = h('button', {
          class: 'nx-snap-cell',
          type: 'button',
          role: 'menuitem',
          'aria-label': t(`wm.zone.${zone}`),
          style: { left: `${z.x}px`, top: `${z.y}px`, width: `${z.w - 2}px`, height: `${z.h - 2}px` },
          onclick: () => {
            remove();
            snap(w, zone);
            focus(w.id);
          },
        });
        group.append(cell);
      }
      flyout.append(group);
    }
    document.body.append(flyout);
    const fr = flyout.getBoundingClientRect();
    flyout.style.left = `${Math.min(window.innerWidth - fr.width - 6, Math.max(6, r.right - fr.width))}px`;
    flyout.style.top = `${r.bottom + 6}px`;
    const remove = () => {
      flyout.remove();
      document.removeEventListener('pointerdown', outside, true);
    };
    /** @param {PointerEvent} e */
    const outside = (e) => !flyout.contains(/** @type {Node} */ (e.target)) && remove();
    document.addEventListener('pointerdown', outside, true);
    let leaveTimer = 0;
    const scheduleClose = () => (leaveTimer = window.setTimeout(remove, 400));
    flyout.addEventListener('pointerleave', scheduleClose);
    flyout.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
    anchor.addEventListener('pointerleave', scheduleClose, { once: true });
  }

  // ─── Window creation (lifecycle host) ─────────────────────────────────
  /**
   * @param {import('../../kernel/types').AppManifest} manifest
   * @param {string} id
   * @returns {Win}
   */
  function createWindow(manifest, id) {
    const title = sys().localize(manifest.name);
    const titleId = `nx-win-title-${id.replace(/[^a-z0-9]/gi, '-')}`;
    const titleEl = h('span', { class: 'nx-window-title', id: titleId, text: title });
    const ctrl = (/** @type {string} */ action, /** @type {string} */ iconName, /** @type {string} */ label) =>
      h(
        'button',
        { class: `nx-window-ctrl is-${action}`, type: 'button', 'aria-label': label, dataset: { action } },
        icon(iconName, { size: 14 }),
      );
    const controls = h(
      'div',
      { class: 'nx-window-controls' },
      ctrl('minimize', 'minimize', t('wm.minimize')),
      ctrl('maximize', 'maximize', t('wm.maximize')),
      ctrl('close', 'close', t('wm.close')),
    );
    const titlebar = h(
      'header',
      { class: 'nx-titlebar' },
      h('span', { class: 'nx-window-icon' }, icon(manifest.icon, { size: 16 })),
      titleEl,
      controls,
    );
    const body = h('div', { class: 'nx-window-body' });
    const el = h(
      'section',
      {
        class: 'nx-window',
        role: 'dialog',
        'aria-labelledby': titleId,
        tabindex: '-1',
        dataset: { instance: id, app: manifest.id },
      },
      titlebar,
      body,
    );
    for (const dir of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])
      el.append(h('div', { class: `nx-resize is-${dir}`, dataset: { dir }, 'aria-hidden': 'true' }));

    const area = workArea();
    const queued = restoreQueue.get(manifest.id)?.shift();
    const size = { w: manifest.window?.width ?? 720, h: manifest.window?.height ?? 480 };
    const normalRect = queued
      ? clampRect(queued.normalRect, area)
      : placeWindow(
          size,
          area,
          [...windows.values()].filter((o) => o.workspace === current).map((o) => o.rect),
        );
    /** @type {Win} */
    const w = {
      id,
      appId: manifest.id,
      manifest,
      el,
      body,
      titleEl,
      title,
      rect: normalRect,
      normalRect,
      state: 'normal',
      zone: null,
      minimized: false,
      workspace: queued ? Math.min(queued.workspace, workspaces.length - 1) : current,
      badge: null,
      progress: null,
      fullscreen: false,
      min: { minW: manifest.window?.minWidth ?? 280, minH: manifest.window?.minHeight ?? 180 },
    };
    if (manifest.window?.resizable === false) el.classList.add('is-fixed-size');

    titlebar.addEventListener('pointerdown', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('.nx-window-controls')) return;
      focus(id);
      startDrag(w, e);
    });
    titlebar.addEventListener('dblclick', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('.nx-window-controls') || manifest.window?.resizable === false)
        return;
      snap(w, w.state === 'maximized' ? null : 'max');
    });
    controls.addEventListener('click', (e) => {
      const action = /** @type {HTMLElement} */ (e.target).closest('[data-action]')?.getAttribute('data-action');
      if (action === 'minimize') minimize(w);
      if (action === 'maximize' && manifest.window?.resizable !== false)
        snap(w, w.state === 'maximized' ? null : 'max');
      if (action === 'close') void sys().lifecycle.close(id);
    });
    let hoverTimer = 0;
    const maxBtn = /** @type {HTMLElement} */ (controls.querySelector('[data-action="maximize"]'));
    maxBtn.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || manifest.window?.resizable === false) return;
      hoverTimer = window.setTimeout(() => showSnapLayouts(w, maxBtn), 450);
    });
    maxBtn.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
    for (const handle of el.querySelectorAll('.nx-resize')) {
      handle.addEventListener('pointerdown', (e) =>
        startResize(w, /** @type {HTMLElement} */ (handle).dataset.dir ?? '', /** @type {PointerEvent} */ (e)),
      );
    }
    el.addEventListener('pointerdown', () => focus(id), true);
    el.addEventListener('focusin', () => mru[0] !== id && focus(id));
    // Cursor-following glow on the focused window's border.
    el.addEventListener('pointermove', (e) => {
      if (!el.classList.contains('is-focused')) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--glow-x', `${e.clientX - r.left}px`);
      el.style.setProperty('--glow-y', `${e.clientY - r.top}px`);
    });

    windows.set(id, w);
    wsLayers[w.workspace].append(el);
    if (queued) {
      w.state = queued.state;
      w.zone = queued.zone;
      w.rect = queued.state === 'normal' ? normalRect : zoneRect(/** @type {Zone} */ (queued.zone ?? 'max'), area);
    }
    apply(w);
    raise(w);
    if (queued?.minimized) {
      w.minimized = true;
      apply(w);
    } else if (motion() !== 'off') el.classList.add('is-opening');
    el.addEventListener('animationend', () => el.classList.remove('is-opening'), { once: true });
    return w;
  }

  /** The `ctx.window` object of an instance. @param {Win} w */
  function handleFor(w) {
    return {
      get title() {
        return w.title;
      },
      /** @param {string} text */
      setTitle(text) {
        w.title = String(text);
        w.titleEl.textContent = w.title;
        emit('window:changed', { id: w.id });
      },
      /** @param {number | null} count */
      setBadge(count) {
        w.badge = count && count > 0 ? Math.floor(count) : null;
        emit('window:changed', { id: w.id });
      },
      /** @param {number | null} value 0–1, or null to hide */
      setProgress(value) {
        w.progress = value === null || value === undefined ? null : Math.min(1, Math.max(0, value));
        emit('window:changed', { id: w.id });
      },
      minimize: () => minimize(w),
      maximize: () => snap(w, 'max'),
      restore: () => (w.minimized ? unminimize(w) : snap(w, null)),
      close: () => sys().lifecycle.close(w.id),
      focus: () => focus(w.id),
      /** @param {number} width @param {number} height */
      resize(width, height) {
        w.state = 'normal';
        w.zone = null;
        w.rect = clampRect({ ...w.rect, w: width, h: height }, workArea(), w.min);
        w.normalRect = { ...w.rect };
        apply(w);
        changed();
      },
      /** @param {boolean} on */
      setFullscreen(on) {
        w.fullscreen = !!on;
        apply(w);
        changed();
      },
      get isFocused() {
        return mru[0] === w.id && w.el.classList.contains('is-focused');
      },
      /** @param {() => void} fn */
      onResize(fn) {
        const observer = new ResizeObserver(() => fn());
        observer.observe(w.body);
        return () => observer.disconnect();
      },
    };
  }

  /** @type {import('../../kernel/lifecycle.js').Host} */
  const host = {
    open(manifest, { instanceId }) {
      const w = createWindow(manifest, instanceId);
      emit('window:opened', { id: instanceId, appId: manifest.id });
      changed();
      return { container: w.body, window: handleFor(w) };
    },
    close(instanceId) {
      const w = windows.get(instanceId);
      if (!w) return;
      windows.delete(instanceId);
      mru = mru.filter((x) => x !== instanceId);
      const remove = () => w.el.remove();
      if (motion() !== 'off' && !w.minimized && w.el.animate) {
        w.el.animate(
          [
            { opacity: 1, transform: 'none' },
            { opacity: 0, transform: 'scale(0.96)' },
          ],
          { duration: 140, easing: 'ease-in' },
        ).onfinish = remove;
      } else remove();
      emit('window:closed', { id: instanceId, appId: w.appId });
      focusTopmost(instanceId);
      changed();
    },
    focus(instanceId) {
      if (mru[0] !== instanceId) focus(instanceId);
    },
    showCrash(instanceId, report, actions) {
      const w = windows.get(instanceId);
      if (!w) return;
      renderCrashView(w.body, {
        report,
        appName: sys().localize(w.manifest.name),
        i18n: sys().i18n.scoped('system'),
        clipboard: sys().clipboard,
        actions,
      });
    },
  };

  /** Re-lays out snapped/maximized windows and keeps the rest visible. */
  function onViewportResize() {
    const area = workArea();
    for (const w of windows.values()) {
      if (w.state === 'maximized' || (w.state === 'snapped' && w.zone))
        w.rect = zoneRect(/** @type {Zone} */ (w.zone ?? 'max'), area);
      else w.rect = clampRect(w.rect, area, w.min);
      apply(w);
    }
    changed();
  }
  window.addEventListener('resize', onViewportResize);

  setWorkspaces(4);

  return {
    host,
    focus,
    /** @param {string} id */
    get: (id) => windows.get(id),
    /** All windows, most recently focused first. */
    list: () =>
      [...mru.map((id) => windows.get(id)), ...[...windows.values()].filter((w) => !mru.includes(w.id))]
        .filter((w) => !!w)
        .map((w) => /** @type {Win} */ (w)),
    focusedId: () => (mru[0] && windows.get(mru[0])?.el.classList.contains('is-focused') ? mru[0] : null),
    minimize: (/** @type {string} */ id) => windows.has(id) && minimize(/** @type {Win} */ (windows.get(id))),
    unminimize: (/** @type {string} */ id) => windows.has(id) && unminimize(/** @type {Win} */ (windows.get(id))),
    /** @param {string} id @param {Zone | null} zone */
    snap: (id, zone) => windows.has(id) && snap(/** @type {Win} */ (windows.get(id)), zone),
    /** @param {string} id */
    toggleMaximize(id) {
      const w = windows.get(id);
      if (w) snap(w, w.state === 'maximized' ? null : 'max');
    },
    get workspaces() {
      return workspaces.map((ws, i) => ({
        ...ws,
        index: i,
        current: i === current,
        windows: [...windows.values()].filter((w) => w.workspace === i).length,
      }));
    },
    get current() {
      return current;
    },
    switchWorkspace,
    /** @param {string} id @param {number} index */
    moveToWorkspace: (id, index) => windows.has(id) && moveToWorkspace(/** @type {Win} */ (windows.get(id)), index),
    /** @param {number} count @param {string[]} [names] */
    setWorkspaces(count, names) {
      setWorkspaces(count, names);
      changed();
    },
    /** @param {number} index @param {string} name */
    renameWorkspace(index, name) {
      if (workspaces[index]) workspaces[index].name = name.trim().slice(0, 40);
      changed();
      emit('workspace:changed', { index: current, previous: current });
    },
    /** Saved layout (the shell stores it with app args). @returns {SavedWindow[]} */
    snapshot: () =>
      [...windows.values()].map((w) => ({
        appId: w.appId,
        rect: w.rect,
        normalRect: w.normalRect,
        state: w.state,
        zone: w.zone,
        minimized: w.minimized,
        workspace: w.workspace,
      })),
    /** Layouts to apply when these apps open again (in order). @param {SavedWindow[]} saved */
    queueRestore(saved) {
      for (const s of saved) restoreQueue.set(s.appId, [...(restoreQueue.get(s.appId) ?? []), s]);
    },
    /** @param {number} index */
    setCurrent(index) {
      current = Math.max(0, Math.min(index, workspaces.length - 1));
      layoutWorkspaces(false);
    },
    relayout: onViewportResize,
  };
}

/** @typedef {ReturnType<typeof createWindowManager>} WindowManager */
