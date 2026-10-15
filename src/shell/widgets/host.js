// @ts-check
// Widget host: widgets on the desktop, on a grid, per workspace. Add from the gallery, drag by the
// title bar, resize from the corner in grid steps, per-widget settings, remove. Keyboard: Alt+Arrows
// move, Alt+Shift+Arrows resize, Delete removes, the context-menu key opens the widget's menu.
// Built-in widgets and widgets declared in app manifests use the same WidgetDecl shape.
import { h, icon, iconButton, replace, toggle } from '../../ui/dom.js';
import { attachContextMenu } from '../../ui/menu.js';
import { openModal } from '../../ui/overlay.js';
import { registerCommand } from '../util.js';
import { BUILTIN_WIDGETS } from './builtin/index.js';
import { clampCell, findFree, fits } from './grid.js';
import './widgets.css';

const UNIT = 84;
const GAP = 12;
const STEP = UNIT + GAP;
const PAD = 16;
const MAX_SIZE = 8;

/**
 * @typedef {object} PlacedWidget
 * @property {string} id
 * @property {string} key        `${manifestId}/${widgetId}`
 * @property {number} ws         workspace index
 * @property {number} col
 * @property {number} row
 * @property {number} w
 * @property {number} h
 * @property {Record<string, unknown>} config
 */

/**
 * @typedef {object} CatalogEntry
 * @property {string} key
 * @property {import('../../kernel/types').AppManifest} manifest
 * @property {import('../../kernel/types').WidgetDecl} decl
 */

/** @param {import('../shell.js').ShellContext} shell */
export function createWidgetHost(shell) {
  const sys = shell.system();
  const { t } = shell;
  const layer = h('div', { class: 'nx-widgets', role: 'region', 'aria-label': t('widgets.region') });
  shell.layers.desktop.append(layer);
  const session = shell.session;
  /** @type {PlacedWidget[]} */
  const placed = session.data.widgets ?? (session.data.widgets = []);

  /**
   * @typedef {object} Mounted
   * @property {HTMLElement} el
   * @property {HTMLElement} body
   * @property {() => void} dispose
   * @property {Set<(size: [number, number]) => void>} resizeFns
   * @property {Set<(key: string) => void>} configFns
   */
  /** @type {Map<string, Mounted>} */
  const mounted = new Map();

  const cols = () => Math.max(1, Math.floor((layer.clientWidth - PAD * 2 + GAP) / STEP));
  const rows = () =>
    Math.max(1, Math.floor((layer.clientHeight - PAD * 2 - (shell.ui.dock?.reserved?.().bottom ?? 0) + GAP) / STEP));
  const current = () => shell.wm.current;
  const save = () => session.schedule();

  /** @returns {CatalogEntry[]} */
  function catalog() {
    return [BUILTIN_WIDGETS, ...sys.registry.list().filter((m) => m.widgets?.length)].flatMap((manifest) =>
      (manifest.widgets ?? []).map((decl) => ({ key: `${manifest.id}/${decl.id}`, manifest, decl })),
    );
  }
  /** @param {string} key */
  const lookup = (key) => catalog().find((c) => c.key === key);

  /** @param {PlacedWidget} p */
  const others = (p) => placed.filter((o) => o !== p && o.ws === p.ws);

  /** @param {HTMLElement} el @param {{ col: number, row: number, w: number, h: number }} c */
  function position(el, c) {
    el.style.left = `${PAD + c.col * STEP}px`;
    el.style.top = `${PAD + c.row * STEP}px`;
    el.style.width = `${c.w * STEP - GAP}px`;
    el.style.height = `${c.h * STEP - GAP}px`;
  }

  /** @param {PlacedWidget} p @param {CatalogEntry} entry */
  async function mount(p, entry) {
    const title = sys.localize(entry.decl.title);
    const body = h('div', { class: 'nx-widget-body' });
    const el = h(
      'section',
      { class: 'nx-widget nx-glass', tabindex: '0', 'aria-label': title, dataset: { id: p.id, key: p.key } },
      h(
        'header',
        { class: 'nx-widget-bar' },
        icon(entry.decl.icon ?? entry.manifest.icon, { size: 14 }),
        h('span', { class: 'nx-widget-title', text: title }),
        entry.decl.settings?.length
          ? iconButton({ icon: 'settings', label: t('widgets.settings'), onClick: () => void openSettings(p) })
          : null,
        iconButton({ icon: 'x', label: t('widgets.remove'), onClick: () => remove(p.id) }),
      ),
      body,
      h('div', { class: 'nx-widget-resize', 'aria-hidden': 'true' }),
    );
    position(el, p);
    layer.append(el);
    /** @type {Mounted} */
    const m = { el, body, dispose: () => {}, resizeFns: new Set(), configFns: new Set() };
    mounted.set(p.id, m);
    wireFrame(p, m, entry);

    /** @param {unknown} error */
    const crashed = (error) => {
      sys.logger.child('widgets').error(`Widget ${p.key} crashed`, error);
      m.dispose();
      replace(
        body,
        h(
          'div',
          { class: 'nx-widget-crash' },
          icon('warning', { size: 20 }),
          h('p', { text: t('widgets.crashed') }),
          h('button', { class: 'nx-btn', type: 'button', text: t('widgets.reload'), onclick: () => reload(p.id) }),
        ),
      );
    };
    try {
      const { ctx, dispose } = await sys.widgetContext(entry.manifest, { onCrash: crashed });
      m.dispose = dispose;
      const defaults = Object.fromEntries((entry.decl.settings ?? []).map((s) => [s.key, s.default]));
      const widgetCtx = /** @type {import('../../kernel/types').WidgetContext} */ (
        Object.assign(ctx, {
          widget: {
            id: p.id,
            size: () => /** @type {[number, number]} */ ([p.w, p.h]),
            onResize: (/** @type {(size: [number, number]) => void} */ fn) => {
              m.resizeFns.add(fn);
              return () => m.resizeFns.delete(fn);
            },
            config: {
              get: (/** @type {string} */ key) => (key in p.config ? p.config[key] : defaults[key]),
              set(/** @type {string} */ key, /** @type {unknown} */ value) {
                p.config[key] = value;
                save();
                for (const fn of m.configFns) fn(key);
              },
              onChange: (/** @type {(key: string) => void} */ fn) => {
                m.configFns.add(fn);
                return () => m.configFns.delete(fn);
              },
            },
          },
        })
      );
      const mod = await entry.decl.load();
      if (mounted.get(p.id) !== m) return dispose();
      const handle = await /** @type {any} */ (mod).mount(body, widgetCtx, shell);
      const inner = m.dispose;
      m.dispose = () => {
        try {
          handle?.unmount?.();
        } finally {
          inner();
        }
      };
    } catch (error) {
      crashed(error);
    }
  }

  /** @param {PlacedWidget} p @param {Mounted} m @param {CatalogEntry} entry */
  function wireFrame(p, m, entry) {
    const { el } = m;
    const [minW, minH] = entry.decl.minSize ?? [1, 1];
    // The desktop below must not start a box selection or show its own menu.
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => e.stopPropagation());

    /**
     * Pointer drag that snaps to cells; drops only on free space, otherwise springs back.
     * @param {PointerEvent} e
     * @param {'move' | 'resize'} mode
     */
    function drag(e, mode) {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, ...p };
      el.classList.add('is-dragging');
      el.setPointerCapture(e.pointerId);
      let next = { col: p.col, row: p.row, w: p.w, h: p.h };
      const onMove = (/** @type {PointerEvent} */ ev) => {
        const dc = Math.round((ev.clientX - start.x) / STEP);
        const dr = Math.round((ev.clientY - start.y) / STEP);
        next =
          mode === 'move'
            ? clampCell({ ...next, col: start.col + dc, row: start.row + dr }, cols(), rows())
            : clampCell(
                {
                  ...next,
                  w: Math.max(minW, Math.min(MAX_SIZE, start.w + dc)),
                  h: Math.max(minH, Math.min(MAX_SIZE, start.h + dr)),
                },
                cols(),
                rows(),
                [minW, minH],
              );
        position(el, next);
        el.classList.toggle('is-blocked', !fits(next, others(p), cols(), rows()));
      };
      const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.classList.remove('is-dragging', 'is-blocked');
        if (fits(next, others(p), cols(), rows())) setCell(p, next);
        else position(el, p);
      };
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    }
    /** @type {HTMLElement} */ (el.querySelector('.nx-widget-bar')).addEventListener('pointerdown', (e) => {
      if (!(/** @type {HTMLElement} */ (e.target).closest('button'))) drag(e, 'move');
    });
    /** @type {HTMLElement} */ (el.querySelector('.nx-widget-resize')).addEventListener('pointerdown', (e) =>
      drag(e, 'resize'),
    );

    el.addEventListener('keydown', (e) => {
      if (e.target !== el) return;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const d = arrows[/** @type {keyof typeof arrows} */ (e.key)];
      if (d && e.altKey) {
        e.preventDefault();
        const next = e.shiftKey
          ? {
              ...p,
              w: Math.max(minW, Math.min(MAX_SIZE, p.w + d[0])),
              h: Math.max(minH, Math.min(MAX_SIZE, p.h + d[1])),
            }
          : { ...p, col: p.col + d[0], row: p.row + d[1] };
        if (fits(next, others(p), cols(), rows())) setCell(p, next);
      } else if (e.key === 'Delete') {
        e.preventDefault();
        remove(p.id);
      }
    });

    attachContextMenu(
      el,
      () => [
        ...(entry.decl.settings?.length
          ? [{ label: t('widgets.settings'), icon: 'settings', run: () => void openSettings(p) }]
          : []),
        {
          label: t('widgets.moveTo'),
          icon: 'layers',
          submenu: shell.wm.workspaces.map((/** @type {{ name: string }} */ ws, /** @type {number} */ i) => ({
            label: ws.name || t('wm.workspaceN', { n: i + 1, name: '' }).trim(),
            checked: i === p.ws,
            run: () => moveToWorkspace(p, i),
          })),
        },
        { label: t('widgets.reload'), icon: 'refresh', run: () => reload(p.id) },
        'separator',
        { label: t('widgets.remove'), icon: 'trash', danger: true, shortcut: 'Delete', run: () => remove(p.id) },
      ],
      { label: t('widgets.menu') },
    );
  }

  /** @param {PlacedWidget} p @param {{ col: number, row: number, w: number, h: number }} c */
  function setCell(p, c) {
    const resized = c.w !== p.w || c.h !== p.h;
    Object.assign(p, { col: c.col, row: c.row, w: c.w, h: c.h });
    const m = mounted.get(p.id);
    if (m) {
      position(m.el, p);
      if (resized) for (const fn of m.resizeFns) fn([p.w, p.h]);
    }
    save();
  }

  /** @param {PlacedWidget} p @param {number} ws */
  function moveToWorkspace(p, ws) {
    if (ws === p.ws) return;
    const spot = fits(
      p,
      placed.filter((o) => o !== p && o.ws === ws),
      cols(),
      rows(),
    )
      ? p
      : findFree(
          p,
          placed.filter((o) => o.ws === ws),
          cols(),
          rows(),
        );
    if (!spot) {
      void sys.notifications.notify({ title: t('widgets.full'), transient: true, timeoutMs: 3000 });
      return;
    }
    Object.assign(p, { ws, col: spot.col, row: spot.row });
    save();
    render();
  }

  /** @param {string} id */
  function unmount(id) {
    const m = mounted.get(id);
    if (!m) return;
    mounted.delete(id);
    try {
      m.dispose();
    } catch (error) {
      sys.logger.child('widgets').warn('Widget unmount failed', error);
    }
    m.el.remove();
  }

  /** @param {string} id */
  function reload(id) {
    unmount(id);
    render();
  }

  /** @param {string} id */
  function remove(id) {
    const i = placed.findIndex((p) => p.id === id);
    if (i < 0) return;
    const el = mounted.get(id)?.el;
    const next = el && /** @type {HTMLElement | null} */ (el.nextElementSibling ?? el.previousElementSibling);
    unmount(id);
    placed.splice(i, 1);
    save();
    next?.focus();
  }

  /** Mounts the current workspace's widgets (and unmounts the others: no hidden timers). */
  function render() {
    const ws = current();
    for (const [id] of mounted) {
      const p = placed.find((x) => x.id === id);
      if (!p || p.ws !== ws) unmount(id);
    }
    for (const p of placed) {
      if (p.ws !== ws) continue;
      const entry = lookup(p.key);
      if (!entry) continue; // app uninstalled or disabled: keep the placement for when it returns
      const c = clampCell(p, cols(), rows(), entry.decl.minSize);
      const m = mounted.get(p.id);
      if (m) position(m.el, c);
      else void mount(p, entry);
    }
  }

  /** @param {CatalogEntry} entry */
  function add(entry) {
    const [w, h] = entry.decl.size;
    const spot = findFree(
      { w, h },
      placed.filter((p) => p.ws === current()),
      cols(),
      rows(),
    );
    if (!spot) {
      void sys.notifications.notify({ title: t('widgets.full'), transient: true, timeoutMs: 3000 });
      return null;
    }
    /** @type {PlacedWidget} */
    const p = {
      id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      key: entry.key,
      ws: current(),
      ...spot,
      config: {},
    };
    placed.push(p);
    save();
    render();
    mounted.get(p.id)?.el.focus();
    return p.id;
  }

  async function openGallery() {
    const cards = catalog().map((entry) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            class: 'nx-widget-card',
            type: 'button',
            dataset: { key: entry.key },
            onclick: () => {
              close?.(true);
              add(entry);
            },
          },
          h('span', { class: 'nx-widget-card-icon' }, icon(entry.decl.icon ?? entry.manifest.icon, { size: 22 })),
          h('strong', { text: sys.localize(entry.decl.title) }),
          h('small', {
            text: `${entry.manifest === BUILTIN_WIDGETS ? t('widgets.builtIn') : sys.localize(entry.manifest.name)} · ${entry.decl.size[0]}×${entry.decl.size[1]}`,
          }),
        ),
      ),
    );
    /** @type {((value: boolean) => void) | undefined} */
    let close;
    await openModal({
      title: t('widgets.gallery'),
      body: h(
        'div',
        { class: 'nx-dlg-stack' },
        h('p', { class: 'nx-widget-hint', text: t('widgets.galleryHint') }),
        h('ul', { class: 'nx-widget-gallery' }, ...cards),
      ),
      size: 'md',
      actions: [{ label: t('dialog.close'), value: false }],
      dismissValue: false,
      onOpen: (done) => (close = done),
    });
  }

  /** @param {PlacedWidget} p */
  async function openSettings(p) {
    const entry = lookup(p.key);
    if (!entry?.decl.settings?.length) return;
    /** @type {Record<string, unknown>} */
    const draft = {};
    const fields = entry.decl.settings.map((s) => {
      const value = s.key in p.config ? p.config[s.key] : s.default;
      const label = sys.localize(s.label);
      const set = (/** @type {unknown} */ v) => (draft[s.key] = v);
      /** @type {HTMLElement} */
      let control;
      if (s.type === 'boolean') return toggle({ label, checked: !!value, onChange: set });
      if (s.type === 'enum') {
        const select = h(
          'select',
          { class: 'nx-select', onchange: () => set(select.value) },
          ...s.options.map((o) => h('option', { value: o.value, text: sys.localize(o.label) })),
        );
        select.value = String(value);
        control = select;
      } else {
        const input = h('input', {
          class: 'nx-input',
          type: { number: 'number', color: 'color', date: 'date' }[/** @type {string} */ (s.type)] ?? 'text',
          min: s.type === 'number' ? s.min : undefined,
          max: s.type === 'number' ? s.max : undefined,
          step: s.type === 'number' ? s.step : undefined,
          oninput: () => set(s.type === 'number' ? Number(input.value) : input.value),
        });
        input.value = String(value ?? '');
        control = input;
      }
      return h(
        'label',
        { class: 'nx-field' },
        h('span', { text: label }),
        control,
        s.description ? h('small', { class: 'nx-widget-hint', text: sys.localize(s.description) }) : null,
      );
    });
    const ok = await openModal({
      title: t('widgets.settingsOf', { name: sys.localize(entry.decl.title) }),
      body: h('div', { class: 'nx-dlg-stack' }, ...fields),
      actions: [
        { label: t('dialog.cancel'), value: false },
        { label: t('dialog.save'), value: true, variant: 'primary' },
      ],
      dismissValue: false,
    });
    if (!ok) return;
    const m = mounted.get(p.id);
    for (const [key, value] of Object.entries(draft)) {
      if (typeof value === 'number' && Number.isNaN(value)) continue;
      p.config[key] = value;
      if (m) for (const fn of m.configFns) fn(key);
    }
    save();
  }

  sys.bus.on('workspace:changed', () => render());
  // Built-in widgets format with the system language: remount them when it changes.
  sys.bus.on('i18n:changed', () => {
    for (const id of [...mounted.keys()]) unmount(id);
    render();
  });
  addEventListener('resize', () => render());
  registerCommand(sys, {
    id: 'shell.widgets.add',
    title: 'widgets.add',
    icon: 'plus',
    run: () => openGallery(),
  });
  render();

  return { openGallery, add, remove, render, catalog, placed: () => placed };
}
