// @ts-check
// Desktop icons: files, folders and app shortcuts from ~/Desktop on a snapping grid.
// Select (click, Ctrl/Shift-click, box select, Ctrl+A), drag to move (multi), open (double-click
// or Enter), rename (F2), delete to trash (Delete), copy/cut/paste, drop files from the real OS,
// arrow-key navigation, and a context menu for the desktop and for icons.
import { entriesFromDataTransfer, importEntries } from '../../services/vfs/transfer.js';
import { capturePointer, h, icon } from '../../ui/dom.js';
import { draggedPaths, fileIconName, PATHS_MIME, SHORTCUT_EXT } from '../../ui/file-icons.js';
import { attachContextMenu } from '../../ui/menu.js';
import { appIcon } from '../app-icon.js';
import { appName } from '../util.js';
import './desktop.css';

const CELL_W = 92;
const CELL_H = 100;
const PAD = 12;

/** @param {import('../shell.js').ShellContext} shell */
export function createDesktop(shell) {
  const sys = shell.system();
  const { t, session } = shell;
  const dir = `${sys.vfs.home}/Desktop`;
  const layer = shell.layers.desktop;
  const grid = h('div', { class: 'nx-desk-grid', role: 'listbox', 'aria-multiselectable': 'true', tabindex: '0' });
  const marquee = h('div', { class: 'nx-desk-marquee', hidden: true });
  layer.replaceChildren(grid, marquee);
  /** @type {Record<string, { col: number, row: number }>} */
  const positions = session.data.desktopPositions ?? (session.data.desktopPositions = {});
  /** @type {Map<string, { el: HTMLElement, node: import('../../services/vfs/vfs.js').VfsNode }>} */
  let icons = new Map();
  /** @type {Set<string>} */
  let selected = new Set();
  let anchor = '';
  /** @type {string[]} */
  let thumbUrls = [];
  /** File clipboard shared with the File Explorer. */
  const clip = sys.clipboard;
  const copyFiles = (/** @type {boolean} */ cut) => clip.setFiles([...selected], { cut });

  const columns = () => Math.max(1, Math.floor((layer.clientWidth - PAD * 2) / CELL_W));
  const rows = () => Math.max(1, Math.floor((layer.clientHeight - PAD * 2 - 80) / CELL_H));
  const key = (/** @type {{ col: number, row: number }} */ p) => `${p.col}:${p.row}`;

  /** First free cell, filling columns top to bottom from the left. @param {Set<string>} taken */
  function freeCell(taken) {
    for (let col = 0; col < 200; col++) {
      for (let row = 0; row < rows(); row++) if (!taken.has(`${col}:${row}`)) return { col, row };
    }
    return { col: 0, row: 0 };
  }

  async function render() {
    const nodes = await sys.vfs.list(dir, { hidden: false }).catch(() => []);
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbUrls = [];
    const taken = new Set();
    const next = new Map();
    for (const node of nodes) {
      let pos = positions[node.name];
      if (!pos || taken.has(key(pos))) pos = positions[node.name] = freeCell(taken);
      taken.add(key(pos));
      next.set(node.path, { el: await iconElement(node, pos), node });
    }
    for (const name of Object.keys(positions)) if (!nodes.some((n) => n.name === name)) delete positions[name];
    icons = next;
    selected = new Set([...selected].filter((p) => icons.has(p)));
    grid.replaceChildren(...[...icons.values()].map((i) => i.el));
    paintSelection();
    session.schedule();
  }

  /**
   * @param {import('../../services/vfs/vfs.js').VfsNode} node
   * @param {{ col: number, row: number }} pos
   */
  async function iconElement(node, pos) {
    let visual;
    if (node.name.endsWith(SHORTCUT_EXT)) {
      const target = await readShortcut(node.path);
      const m = target ? sys.registry.get(target) : null;
      visual = m ? appIcon(m, 48) : icon('rocket', { size: 40 });
    } else if (node.mime.startsWith('image/') && node.size < 8_000_000) {
      const blob = /** @type {Blob} */ (await sys.vfs.readFile(node.path, { as: 'blob' }));
      const url = URL.createObjectURL(blob);
      thumbUrls.push(url);
      visual = h('img', { class: 'nx-desk-thumb', src: url, alt: '', draggable: 'false' });
    } else {
      visual = h(
        'span',
        { class: `nx-desk-glyph${node.type === 'folder' ? ' is-folder' : ''}` },
        icon(fileIconName(node.mime, node.name), { size: 40 }),
      );
    }
    const label = node.name.endsWith(SHORTCUT_EXT) ? node.name.slice(0, -SHORTCUT_EXT.length) : node.name;
    const el = h(
      'div',
      {
        class: 'nx-desk-icon',
        role: 'option',
        'aria-selected': 'false',
        tabindex: '-1',
        dataset: { path: node.path },
        title: label,
      },
      visual,
      h('span', { class: 'nx-desk-label', text: label }),
    );
    place(el, pos);
    return el;
  }

  /** @param {HTMLElement} el @param {{ col: number, row: number }} pos */
  function place(el, pos) {
    el.style.left = `${PAD + pos.col * CELL_W}px`;
    el.style.top = `${PAD + pos.row * CELL_H}px`;
  }

  /** @param {string} path @returns {Promise<string | null>} */
  async function readShortcut(path) {
    try {
      return JSON.parse(/** @type {string} */ (await sys.vfs.readFile(path, { as: 'text' }))).app ?? null;
    } catch {
      return null;
    }
  }

  function paintSelection() {
    for (const [path, { el }] of icons) {
      const on = selected.has(path);
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', String(on));
    }
  }

  /** @param {string} path @param {{ ctrl?: boolean, shift?: boolean }} [mods] */
  function select(path, { ctrl = false, shift = false } = {}) {
    if (shift && anchor && icons.has(anchor)) {
      const order = [...icons.keys()].sort(byGrid);
      const [a, b] = [order.indexOf(anchor), order.indexOf(path)].sort((x, y) => x - y);
      selected = new Set(order.slice(a, b + 1));
    } else if (ctrl) {
      if (selected.has(path)) selected.delete(path);
      else selected.add(path);
      anchor = path;
    } else {
      selected = new Set([path]);
      anchor = path;
    }
    paintSelection();
    icons.get(path)?.el.focus({ preventScroll: true });
  }

  /** @param {string} a @param {string} b */
  function byGrid(a, b) {
    const pa = positions[/** @type {string} */ (a.split('/').pop())] ?? { col: 0, row: 0 };
    const pb = positions[/** @type {string} */ (b.split('/').pop())] ?? { col: 0, row: 0 };
    return pa.col - pb.col || pa.row - pb.row;
  }

  /** @param {string} path */
  async function open(path) {
    const node = icons.get(path)?.node;
    if (!node) return;
    if (node.name.endsWith(SHORTCUT_EXT)) {
      const appId = await readShortcut(path);
      if (appId) void shell.launch(appId);
      return;
    }
    try {
      await sys.intents.open(path);
    } catch {
      await sys.notifications.notify({ title: t('palette.noApp'), body: node.name });
    }
  }

  /** Inline rename. @param {string} path */
  function rename(path) {
    const entry = icons.get(path);
    if (!entry) return;
    const label = /** @type {HTMLElement} */ (entry.el.querySelector('.nx-desk-label'));
    const input = h('textarea', { class: 'nx-desk-rename', rows: '2', 'aria-label': t('desktop.rename') });
    const name = entry.node.name;
    input.value = name;
    label.replaceWith(input);
    input.focus();
    const dot = entry.node.type === 'file' && !name.endsWith(SHORTCUT_EXT) ? name.lastIndexOf('.') : -1;
    input.setSelectionRange(0, dot > 0 ? dot : name.length);
    let done = false;
    const finish = async (/** @type {boolean} */ save) => {
      if (done) return;
      done = true;
      const value = input.value.trim().replace(/\n/g, ' ');
      if (save && value && value !== name) {
        try {
          positions[value] = positions[name];
          await sys.vfs.rename(path, value);
          selected = new Set([`${dir}/${value}`]);
        } catch (error) {
          await sys.notifications.notify({
            title: t('desktop.renameFailed'),
            body: String(/** @type {Error} */ (error).message),
          });
        }
      }
      await render();
      grid.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        void finish(true);
      } else if (e.key === 'Escape') void finish(false);
    });
    input.addEventListener('blur', () => void finish(true));
  }

  async function trashSelected() {
    for (const path of selected) await sys.vfs.trash(path).catch(() => {});
    selected.clear();
  }

  /** @param {string} base e.g. "New folder" @param {'folder' | 'file'} kind @param {{ col: number, row: number }} [at] */
  async function createNew(base, kind, at) {
    const path = await sys.vfs.uniquePath(`${dir}/${base}`);
    const name = /** @type {string} */ (path.split('/').pop());
    if (at) positions[name] = at;
    if (kind === 'folder') await sys.vfs.mkdir(path);
    else await sys.vfs.writeFile(path, '');
    await render();
    select(path);
    rename(path);
  }

  async function paste() {
    const { paths, cut } = clip.files();
    for (const from of paths) {
      const target = await sys.vfs.uniquePath(`${dir}/${from.split('/').pop()}`);
      try {
        if (cut) await sys.vfs.move(from, target);
        else await sys.vfs.copy(from, target);
      } catch (error) {
        await sys.notifications.notify({
          title: t('desktop.pasteFailed'),
          body: String(/** @type {Error} */ (error).message),
        });
      }
    }
    if (cut) clip.setFiles([]);
  }

  /** @param {'name' | 'type' | 'modified'} by */
  function sortIcons(by) {
    const nodes = [...icons.values()].map((i) => i.node);
    const collator = new Intl.Collator(sys.i18n.locale, { numeric: true, sensitivity: 'base' });
    nodes.sort((a, b) =>
      by === 'modified'
        ? b.modified - a.modified
        : by === 'type'
          ? (a.type === b.type ? collator.compare(a.mime, b.mime) : a.type === 'folder' ? -1 : 1) ||
            collator.compare(a.name, b.name)
          : collator.compare(a.name, b.name),
    );
    for (const name of Object.keys(positions)) delete positions[name];
    const taken = new Set();
    for (const n of nodes) {
      const p = freeCell(taken);
      taken.add(key(p));
      positions[n.name] = p;
    }
    void render();
  }

  /** Cell under a point (desktop-relative). @param {number} x @param {number} y */
  function cellAt(x, y) {
    return {
      col: Math.max(0, Math.min(columns() - 1, Math.floor((x - PAD) / CELL_W))),
      row: Math.max(0, Math.min(rows() - 1, Math.floor((y - PAD) / CELL_H))),
    };
  }

  // ─── Pointer: select, drag icons, marquee ───────────────────────────────
  grid.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const iconEl = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.nx-desk-icon'));
    const origin = layer.getBoundingClientRect();
    if (!iconEl) {
      // Box selection on empty desktop.
      if (!e.ctrlKey && !e.shiftKey) selected.clear();
      const start = { x: e.clientX - origin.left, y: e.clientY - origin.top };
      const base = new Set(selected);
      capturePointer(grid, e.pointerId);
      grid.focus({ preventScroll: true });
      /** @param {PointerEvent} ev */
      const move = (ev) => {
        const x = ev.clientX - origin.left;
        const y = ev.clientY - origin.top;
        const r = {
          left: Math.min(x, start.x),
          top: Math.min(y, start.y),
          right: Math.max(x, start.x),
          bottom: Math.max(y, start.y),
        };
        Object.assign(marquee.style, {
          left: `${r.left}px`,
          top: `${r.top}px`,
          width: `${r.right - r.left}px`,
          height: `${r.bottom - r.top}px`,
        });
        marquee.hidden = false;
        selected = new Set(base);
        for (const [path, { el }] of icons) {
          const b = {
            left: el.offsetLeft,
            top: el.offsetTop,
            right: el.offsetLeft + el.offsetWidth,
            bottom: el.offsetTop + el.offsetHeight,
          };
          if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) selected.add(path);
        }
        paintSelection();
      };
      const up = () => {
        marquee.hidden = true;
        grid.removeEventListener('pointermove', move);
        grid.removeEventListener('pointerup', up);
        paintSelection();
      };
      grid.addEventListener('pointermove', move);
      grid.addEventListener('pointerup', up);
      paintSelection();
      return;
    }
    const path = /** @type {string} */ (iconEl.dataset.path);
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      select(path, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
      return;
    }
    if (!selected.has(path)) select(path);
    else iconEl.focus({ preventScroll: true });
    // Drag the selection; drop snaps to the grid.
    const start = { x: e.clientX, y: e.clientY };
    const moving = [...selected]
      .map((p) => /** @type {{ el: HTMLElement, node: any }} */ (icons.get(p)))
      .filter(Boolean);
    const startPos = moving.map((m) => ({ left: m.el.offsetLeft, top: m.el.offsetTop }));
    let dragging = false;
    capturePointer(iconEl, e.pointerId);
    /** @param {PointerEvent} ev */
    const move = (ev) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) < 5) return;
      dragging = true;
      moving.forEach((m, i) => {
        m.el.classList.add('is-dragging');
        m.el.style.left = `${startPos[i].left + dx}px`;
        m.el.style.top = `${startPos[i].top + dy}px`;
      });
    };
    const up = () => {
      iconEl.removeEventListener('pointermove', move);
      iconEl.removeEventListener('pointerup', up);
      if (!dragging) return;
      const others = new Set(
        [...icons.values()]
          .filter((i) => !selected.has(i.node.path))
          .map((i) => key(positions[i.node.name] ?? { col: -1, row: -1 })),
      );
      for (const m of moving) {
        m.el.classList.remove('is-dragging');
        let cell = cellAt(m.el.offsetLeft + CELL_W / 2, m.el.offsetTop + CELL_H / 2);
        if (others.has(key(cell))) cell = freeCellNear(cell, others);
        others.add(key(cell));
        positions[m.node.name] = cell;
        place(m.el, cell);
      }
      session.schedule();
    };
    iconEl.addEventListener('pointermove', move);
    iconEl.addEventListener('pointerup', up);
  });

  /** @param {{ col: number, row: number }} cell @param {Set<string>} taken */
  function freeCellNear(cell, taken) {
    for (let d = 1; d < 50; d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          const c = { col: cell.col + dc, row: cell.row + dr };
          if (c.col >= 0 && c.row >= 0 && c.row < rows() && !taken.has(key(c))) return c;
        }
      }
    }
    return freeCell(taken);
  }

  grid.addEventListener('dblclick', (e) => {
    const iconEl = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.nx-desk-icon'));
    if (iconEl?.dataset.path) void open(iconEl.dataset.path);
  });

  // ─── Keyboard ───────────────────────────────────────────────────────────
  grid.addEventListener('keydown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('.nx-desk-rename')) return;
    const current = /** @type {HTMLElement} */ (document.activeElement)?.dataset?.path ?? anchor;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Enter' && selected.size) {
      e.preventDefault();
      for (const p of selected) void open(p);
    } else if (e.key === 'F2' && current) {
      e.preventDefault();
      rename(current);
    } else if (e.key === 'Delete' && selected.size) {
      e.preventDefault();
      void trashSelected();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selected = new Set(icons.keys());
      paintSelection();
    } else if (mod && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x') && selected.size) {
      e.preventDefault();
      copyFiles(e.key.toLowerCase() === 'x');
    } else if (mod && e.key.toLowerCase() === 'v' && clip.files().paths.length) {
      e.preventDefault();
      void paste();
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const from = positions[current?.split('/').pop() ?? ''] ?? { col: 0, row: -1 };
      const target = {
        col: from.col + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0),
        row: from.row + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0),
      };
      // Nearest icon in that direction.
      let best = null;
      let bestScore = Infinity;
      for (const [path, { node }] of icons) {
        const p = positions[node.name];
        if (!p || path === current) continue;
        const dc = p.col - from.col;
        const dr = p.row - from.row;
        const ok =
          e.key === 'ArrowRight'
            ? dc > 0
            : e.key === 'ArrowLeft'
              ? dc < 0
              : e.key === 'ArrowDown'
                ? dr > 0 && dc === 0
                : dr < 0 && dc === 0;
        if (!ok && !(icons.size && !current)) continue;
        const score = Math.abs(p.col - target.col) * 3 + Math.abs(p.row - target.row);
        if (score < bestScore) {
          best = path;
          bestScore = score;
        }
      }
      if (best) select(best, { shift: e.shiftKey });
    }
  });
  grid.addEventListener('focus', () => {
    if (!selected.size && icons.size) select([...icons.keys()].sort(byGrid)[0]);
  });

  // ─── Context menus ─────────────────────────────────────────────────────
  attachContextMenu(
    grid,
    ({ x, y, target }) => {
      const iconEl = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (target).closest?.('.nx-desk-icon'));
      if (iconEl?.dataset.path) {
        const path = iconEl.dataset.path;
        if (!selected.has(path)) select(path);
        const node = icons.get(path)?.node;
        const openers =
          node && node.type === 'file' && !node.name.endsWith(SHORTCUT_EXT) ? sys.intents.openersFor(path) : [];
        return [
          { label: t('desktop.open'), icon: 'external-link', run: () => [...selected].forEach((p) => void open(p)) },
          ...(openers.length > 1
            ? [
                {
                  label: t('desktop.openWith'),
                  icon: 'apps',
                  submenu: openers.map((m) => ({
                    label: appName(sys, m.id),
                    run: () => void sys.intents.open(path, { with: m.id }),
                  })),
                },
              ]
            : []),
          'separator',
          {
            label: t('desktop.copy'),
            icon: 'copy',
            shortcut: 'Mod+C',
            run: () => copyFiles(false),
          },
          {
            label: t('desktop.cut'),
            icon: 'cut',
            shortcut: 'Mod+X',
            run: () => copyFiles(true),
          },
          {
            label: t('desktop.rename'),
            icon: 'edit',
            shortcut: 'F2',
            disabled: selected.size !== 1,
            run: () => rename(path),
          },
          'separator',
          {
            label: t('desktop.trash'),
            icon: 'trash',
            shortcut: 'Delete',
            danger: true,
            run: () => void trashSelected(),
          },
        ];
      }
      const origin = layer.getBoundingClientRect();
      const at = cellAt(x - origin.left, y - origin.top);
      const notes = sys.registry.list().find((m) => m.commands?.some((c) => c.id === 'notes.new'));
      const terminal = sys.registry.list().find((m) => m.id === 'nexus.terminal');
      return [
        {
          label: t('desktop.newFolder'),
          icon: 'folder-plus',
          run: () => void createNew(t('desktop.newFolderName'), 'folder', at),
        },
        {
          label: t('desktop.newTextFile'),
          icon: 'file-plus',
          run: () => void createNew(`${t('desktop.newTextFileName')}.txt`, 'file', at),
        },
        ...(notes
          ? [{ label: t('desktop.newNote'), icon: 'note', run: () => void sys.commands.execute('notes.new') }]
          : []),
        {
          label: t('desktop.paste'),
          icon: 'paste',
          shortcut: 'Mod+V',
          disabled: !clip.files().paths.length,
          run: () => void paste(),
        },
        'separator',
        {
          label: t('desktop.sort'),
          icon: 'sort',
          submenu: /** @type {const} */ (['name', 'type', 'modified']).map((by) => ({
            label: t(`desktop.sortBy.${by}`),
            run: () => sortIcons(by),
          })),
        },
        {
          label: t('personalize.changeWallpaper'),
          icon: 'wallpaper',
          run: () => shell.ui.personalize?.open('wallpaper'),
        },
        { label: t('widgets.add'), icon: 'layout-quarters', run: () => void shell.ui.widgets?.openGallery() },
        { label: t('desktop.display'), icon: 'monitor', run: () => shell.ui.personalize?.open('appearance') },
        ...(terminal
          ? [
              {
                label: t('desktop.terminalHere'),
                icon: 'terminal',
                run: () => void shell.launch(terminal.id, { cwd: dir }),
              },
            ]
          : []),
      ];
    },
    { label: t('desktop.menu') },
  );

  // ─── Drop files from the real OS, or VFS items dragged from the File Explorer ─────
  layer.addEventListener('dragover', (e) => {
    const types = e.dataTransfer?.types ?? [];
    if (types.includes('Files') || types.includes(PATHS_MIME)) {
      e.preventDefault();
      if (e.dataTransfer && types.includes(PATHS_MIME))
        e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move';
      layer.classList.add('is-drop-target');
    }
  });
  layer.addEventListener('dragleave', () => layer.classList.remove('is-drop-target'));
  layer.addEventListener('drop', async (e) => {
    layer.classList.remove('is-drop-target');
    const types = e.dataTransfer?.types ?? [];
    if (!e.dataTransfer || !(types.includes('Files') || types.includes(PATHS_MIME))) return;
    e.preventDefault();
    const origin = layer.getBoundingClientRect();
    const at = cellAt(e.clientX - origin.left, e.clientY - origin.top);
    const written = types.includes(PATHS_MIME)
      ? await dropPaths(e.dataTransfer.getData(PATHS_MIME), e.ctrlKey || e.altKey)
      : await importEntries(sys.vfs, await entriesFromDataTransfer(e.dataTransfer), dir);
    const tops = [...new Set(written.map((p) => p.slice(dir.length + 1).split('/')[0]))];
    const taken = new Set(Object.values(positions).map(key));
    tops.forEach((name, i) => {
      let cell = { col: at.col, row: at.row + i };
      if (taken.has(key(cell)) || cell.row >= rows()) cell = freeCellNear(cell, taken);
      taken.add(key(cell));
      positions[name] = cell;
    });
    await render();
  });

  /** Moves (or copies) VFS paths dragged from an app onto the desktop. @param {string} json @param {boolean} copy */
  async function dropPaths(json, copy) {
    /** @type {string[]} */
    const written = [];
    for (const from of draggedPaths(json)) {
      if (from.slice(0, from.lastIndexOf('/')) === dir) continue;
      try {
        const target = await sys.vfs.uniquePath(`${dir}/${from.split('/').pop()}`);
        if (copy) await sys.vfs.copy(from, target);
        else await sys.vfs.move(from, target);
        written.push(target);
      } catch (error) {
        await sys.notifications.notify({
          title: t('desktop.pasteFailed'),
          body: String(/** @type {Error} */ (error).message),
        });
      }
    }
    return written;
  }

  sys.vfs.watch(dir, () => void render());
  addEventListener('resize', () => void render());
  sys.i18n.onChange(() => grid.setAttribute('aria-label', t('desktop.label')));
  grid.setAttribute('aria-label', t('desktop.label'));
  void render();

  /** Creates an app shortcut on the desktop. @param {string} appId */
  async function addShortcut(appId) {
    const path = await sys.vfs.uniquePath(`${dir}/${appName(sys, appId)}${SHORTCUT_EXT}`);
    await sys.vfs.writeFile(path, JSON.stringify({ app: appId }), { mime: 'application/vnd.nexus.app' });
  }

  return { render, addShortcut };
}
