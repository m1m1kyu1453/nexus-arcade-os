// File Explorer: browse the VFS with icons/list/details/column views, a sidebar of places and
// tags, a preview pane, and every file operation (with undo for the last one). Nothing runs at
// import time.
import { capturePointer, h, icon, iconButton } from '../../ui/dom.js';
import { draggedPaths, PATHS_MIME, SHORTCUT_EXT } from '../../ui/file-icons.js';
import { attachContextMenu } from '../../ui/menu.js';
import { resolvePath } from '../../ui/paths.js';
import {
  crumbs,
  displayName,
  formatSize,
  History,
  parentOf,
  rangeBetween,
  resolveInput,
  sortItems,
  TRASH,
  typeAhead,
} from './model.js';
import * as ops from './ops.js';
import { createPreview } from './preview.js';
import { openProperties } from './properties.js';
import { createSidebar } from './sidebar.js';
import { detailsHeader, renderColumn, renderItems } from './views.js';
import './styles.css';

/** @typedef {import('./model.js').Item} Item */
/** @typedef {import('./views.js').ViewMode} ViewMode */

const VIEWS = /** @type {const} */ ([
  ['icons', 'apps'],
  ['list', 'view-list'],
  ['details', 'view-details'],
  ['columns', 'view-columns'],
]);
const TERMINAL = 'nexus.terminal';

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'files.open': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.files' }),
  'files.trash': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.files', args: { path: TRASH } }),
};

/** @type {import('../../kernel/types').AppModule['terminal']} */
export const terminal = {
  /** `explore [FOLDER]` in the Terminal. */
  async explore(ctx, io) {
    const path = resolvePath(io.args[0] ?? '.', io.cwd, /** @type {string} */ (ctx.fs.home));
    const node = await /** @type {any} */ (ctx.fs).stat(path);
    if (node?.type !== 'folder') {
      io.err(`explore: ${ctx.i18n.t(node ? 'errors.notFolder' : 'errors.notFound', { path: io.args[0] ?? path })}\n`);
      return 1;
    }
    await ctx.commands.execute('shell.launchApp', { appId: 'nexus.files', args: { path } });
    return 0;
  },
};

/** @type {import('../../kernel/types').AppModule['mount']} */
export async function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const fs = /** @type {any} */ (ctx.fs);
  const home = /** @type {string} */ (fs.home);
  const saved = /** @type {any} */ (args.restoredState ?? {});
  const prefs = /** @type {any} */ ((await ctx.storage.kv.get('prefs')) ?? {});

  const state = {
    /** Folder path, 'recent:' or 'tag:<name>'. */
    location: /** @type {string} */ (saved.location ?? args.intent?.path ?? args.path ?? args.cwd ?? home),
    /** @type {ViewMode} */
    view: saved.view ?? prefs.view ?? 'icons',
    sort: saved.sort ?? prefs.sort ?? { key: 'name', desc: false },
    preview: saved.preview ?? prefs.preview ?? false,
    query: '',
    /** @type {'folder' | 'trash' | 'search' | 'recent' | 'tag'} */
    kind: 'folder',
    readOnly: false,
    loading: true,
  };
  const history = new History(state.location);
  /** @type {Item[]} */
  let items = [];
  /** @type {Set<string>} */
  let selected = new Set();
  let anchor = '';
  /** @type {ops.Undo | null} */
  let lastUndo = null;
  /** Children per column-view folder. @type {Map<string, Item[]>} */
  let columnItems = new Map();
  /** Default app of the single selected file (for the context menu). */
  let selectedDefault = '';
  /** @type {string[]} */
  let blobUrls = [];
  let typeBuffer = '';
  let typeTimer = 0;
  let loadToken = 0;
  /** While an inline rename is open, reloads wait (re-rendering would destroy the input); it reloads when done. */
  let renaming = false;
  /** @type {(() => void) | null} */
  let unwatch = null;

  // ─── Layout ─────────────────────────────────────────────────────────────
  const root = h('div', { class: 'nx-files', dataset: { testid: 'files' } });
  const backBtn = iconButton({ icon: 'arrow-left', label: t('toolbar.back'), onClick: () => back() });
  const fwdBtn = iconButton({ icon: 'arrow-right', label: t('toolbar.forward'), onClick: () => forward() });
  const upBtn = iconButton({ icon: 'arrow-up', label: t('toolbar.up'), onClick: () => up() });
  const crumbBar = h('nav', {
    class: 'nx-files-crumbs',
    'aria-label': t('toolbar.path'),
    dataset: { testid: 'files-crumbs' },
  });
  const pathInput = h('input', {
    class: 'nx-input nx-files-path-input',
    type: 'text',
    'aria-label': t('toolbar.editPath'),
    spellcheck: 'false',
    hidden: true,
    dataset: { testid: 'files-path-input' },
  });
  const searchInput = h('input', {
    class: 'nx-input nx-files-search',
    type: 'search',
    'aria-label': t('toolbar.search'),
    dataset: { testid: 'files-search' },
  });
  const viewButtons = h(
    'div',
    { class: 'nx-files-views', role: 'group', 'aria-label': t('toolbar.view') },
    ...VIEWS.map(([mode, iconName]) => {
      const btn = iconButton({
        icon: iconName,
        label: t(`toolbar.${mode}`),
        onClick: () => setView(mode),
        pressed: false,
      });
      btn.dataset.view = mode;
      return btn;
    }),
  );
  const previewBtn = iconButton({
    icon: 'eye',
    label: t('toolbar.preview'),
    onClick: () => togglePreview(),
    pressed: state.preview,
  });
  const newFolderBtn = iconButton({
    icon: 'folder-plus',
    label: t('toolbar.newFolder'),
    onClick: () => void createNew('folder'),
  });
  const uploadInput = h('input', {
    type: 'file',
    multiple: true,
    class: 'nx-visually-hidden',
    tabindex: '-1',
    'aria-hidden': 'true',
  });
  const moreBtn = iconButton({ icon: 'more-horizontal', label: t('toolbar.more'), onClick: (e) => openMoreMenu(e) });
  const placesBtn = iconButton({
    icon: 'sidebar',
    label: t('places.label'),
    onClick: () => toggleSidebar(),
    pressed: false,
  });
  placesBtn.classList.add('nx-files-places-btn');
  previewBtn.classList.add('nx-files-preview-btn');
  const toolbar = h(
    'div',
    { class: 'nx-files-toolbar', role: 'toolbar', 'aria-label': t('title') },
    placesBtn,
    backBtn,
    fwdBtn,
    upBtn,
    h(
      'div',
      { class: 'nx-files-location', onclick: (e) => e.target === e.currentTarget && editPath() },
      crumbBar,
      pathInput,
    ),
    searchInput,
    newFolderBtn,
    viewButtons,
    previewBtn,
    moreBtn,
    uploadInput,
  );
  const header = h('div', { class: 'nx-files-header-wrap' });
  const view = h('div', {
    class: 'nx-files-view',
    role: 'listbox',
    'aria-multiselectable': 'true',
    tabindex: '0',
    dataset: { testid: 'files-view' },
  });
  const marquee = h('div', { class: 'nx-files-marquee', hidden: true });
  const content = h('section', { class: 'nx-files-content' }, header, view, marquee);
  const status = h('footer', {
    class: 'nx-files-status',
    role: 'status',
    'aria-live': 'polite',
    dataset: { testid: 'files-status' },
  });
  const preview = createPreview(ctx, { onOpen: (item) => void open(item) });
  const sidebar = createSidebar(ctx, {
    go: (loc) => {
      toggleSidebar(false);
      void navigate(loc);
    },
    dropTarget: (el, loc) => dropTarget(el, loc),
  });
  const main = h('div', { class: 'nx-files-main' }, sidebar.el, content, preview.el);
  root.append(toolbar, main, status);
  container.replaceChildren(root);

  // ─── Loading ────────────────────────────────────────────────────────────
  const isFolderLocation = () => !state.location.includes(':');
  const inTrash = () => state.location === TRASH || state.location.startsWith(`${TRASH}/`);
  const showHidden = () => /** @type {boolean} */ (ctx.settings.get('showHidden'));
  const visible = (/** @type {Item[]} */ list) =>
    showHidden() ? list : list.filter((i) => !displayName(i).startsWith('.'));

  /** The newest load; an older one that gets superseded resolves when this one has rendered. */
  let latestLoad = Promise.resolve();

  /**
   * Loads the current location and renders it. Resolves once the view shows the result of this
   * or a newer load (so callers can rely on the DOM afterwards).
   * @param {{ keepSelection?: boolean }} [options]
   * @returns {Promise<void>}
   */
  function load(options) {
    const promise = loadNow(options);
    latestLoad = promise;
    return promise;
  }

  /** @param {{ keepSelection?: boolean }} [options] */
  async function loadNow({ keepSelection = true } = {}) {
    if (renaming) return;
    const mine = ++loadToken;
    const loc = state.location;
    /** @type {Item[]} */
    let next;
    let readOnly = false;
    try {
      if (loc === 'recent:') {
        state.kind = 'recent';
        next = await fs.recent();
      } else if (loc.startsWith('tag:')) {
        state.kind = 'tag';
        next = await fs.search({ tag: loc.slice(4) });
      } else if (state.query) {
        state.kind = 'search';
        next = await fs.search({ name: state.query, under: loc });
      } else {
        const node = await fs.stat(loc);
        if (!node || node.type !== 'folder') {
          notifyError(t(node ? 'errors.notFolder' : 'errors.notFound', { path: loc }));
          if (mine === loadToken) await navigate(home, { replace: true });
          return;
        }
        readOnly = !!node.readOnly;
        state.kind = loc === TRASH ? 'trash' : 'folder';
        next = loc === TRASH ? await fs.listTrash() : await fs.list(loc);
      }
    } catch (error) {
      notifyError(String(/** @type {Error} */ (error).message));
      next = [];
    }
    if (mine !== loadToken) return latestLoad;
    state.readOnly = readOnly || inTrash();
    items = sortItems(visible(next), state.sort, ctx.i18n.locale);
    if (state.view === 'columns' && isFolderLocation() && !state.query) await loadColumns();
    if (mine !== loadToken) return latestLoad;
    const paths = new Set(items.map((i) => i.path));
    selected = keepSelection ? new Set([...selected].filter((p) => paths.has(p))) : new Set();
    state.loading = false;
    // Unchanged content (e.g. a watcher reload after our own change): keep the DOM, so a drag
    // or hover that has just started isn't interrupted.
    const key = renderKey();
    if (key === lastRenderKey && view.childElementCount) return paint();
    lastRenderKey = key;
    render();
  }

  /** What a render depends on besides the selection. */
  let lastRenderKey = '';
  const renderKey = () =>
    JSON.stringify([
      state.location,
      state.view,
      state.sort,
      state.kind,
      state.query,
      state.readOnly,
      ctx.i18n.locale,
      items.map((i) => [i.path, i.size, i.modified, i.tags, i.trash?.at]),
      state.view === 'columns' ? [...columnItems].map(([k, v]) => [k, v.map((i) => i.path)]) : null,
    ]);

  /** Children of every folder shown in the column view. */
  async function loadColumns() {
    columnItems = new Map([[state.location, items]]);
    for (const folder of columnChain().slice(0, -1)) {
      const list = await fs.list(folder).catch(() => []);
      columnItems.set(folder, sortItems(visible(list), { key: 'name', desc: false }, ctx.i18n.locale));
    }
    const open = openFolderInColumns();
    if (open) {
      const list = await fs.list(open).catch(() => []);
      columnItems.set(open, sortItems(visible(list), { key: 'name', desc: false }, ctx.i18n.locale));
    }
  }

  /** Folders from home (or '/') down to the current one. */
  function columnChain() {
    const base = state.location === home || state.location.startsWith(`${home}/`) ? home : inTrash() ? TRASH : '/';
    const chain = [base];
    let p = state.location;
    const tail = [];
    while (p !== base && p !== '/') {
      tail.unshift(p);
      p = parentOf(p);
    }
    return [...chain, ...tail];
  }

  /** A single selected folder is previewed as one more column. */
  function openFolderInColumns() {
    if (selected.size !== 1) return null;
    const item = items.find((i) => selected.has(i.path));
    return item?.type === 'folder' ? item.path : null;
  }

  function watchLocation() {
    unwatch?.();
    const reload = debounce(() => void load(), 120);
    if (state.location === 'recent:') unwatch = ctx.events.on('vfs:recent-changed', reload);
    else if (!isFolderLocation() || state.query)
      unwatch = fs.watch(state.location.includes(':') ? '/' : state.location, reload, { recursive: true });
    else unwatch = fs.watch(state.location, reload);
  }

  /**
   * @param {string} location
   * @param {{ replace?: boolean, select?: string[] }} [options]
   */
  async function navigate(location, { replace = false, select = [] } = {}) {
    const loc = location.includes(':')
      ? location
      : resolveInput(location, state.location.includes(':') ? home : state.location, home);
    if (!replace) history.push(loc);
    else history.stack[history.index] = loc;
    state.location = loc;
    state.query = '';
    searchInput.value = '';
    selected = new Set(select);
    anchor = select[0] ?? '';
    watchLocation();
    await load();
    if (select[0]) focusItem(select[0]);
    persist();
  }
  const back = () => history.canBack && void goTo(history.back());
  const forward = () => history.canForward && void goTo(history.forward());
  /** History navigation (doesn't push). @param {string} loc */
  async function goTo(loc) {
    const from = state.location;
    state.location = loc;
    state.query = '';
    searchInput.value = '';
    selected = new Set(isFolderLocation() && parentOf(from) === loc ? [from] : []);
    watchLocation();
    await load();
    ctx.window?.stateChanged();
  }
  function up() {
    if (!isFolderLocation() || state.location === '/') return;
    const from = state.location;
    void navigate(from === TRASH ? home : parentOf(from), { select: [from] });
  }

  // ─── Rendering ─────────────────────────────────────────────────────────
  /** @returns {import('./views.js').ViewContext} */
  function viewContext() {
    const clip = ctx.clipboard.files();
    return {
      ctx,
      selected,
      cut: new Set(clip.cut ? clip.paths : []),
      sort: state.sort,
      kind: state.kind,
      objectUrl: (blob) => {
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        return url;
      },
    };
  }

  function render() {
    // Rebuilding removes the focused item; keep keyboard focus inside the view.
    const hadFocus = view.contains(document.activeElement);
    for (const url of blobUrls) URL.revokeObjectURL(url);
    blobUrls = [];
    const vc = viewContext();
    const mode = state.view === 'columns' && (!isFolderLocation() || state.query) ? 'details' : state.view;
    root.dataset.view = mode;
    root.dataset.kind = state.kind;
    for (const btn of viewButtons.children)
      btn.setAttribute('aria-pressed', String(/** @type {HTMLElement} */ (btn).dataset.view === state.view));
    previewBtn.setAttribute('aria-pressed', String(state.preview));
    main.classList.toggle('has-preview', state.preview);
    backBtn.toggleAttribute('disabled', !history.canBack);
    fwdBtn.toggleAttribute('disabled', !history.canForward);
    upBtn.toggleAttribute('disabled', !isFolderLocation() || state.location === '/');
    newFolderBtn.toggleAttribute('disabled', !canWriteHere());
    header.replaceChildren(mode === 'details' ? detailsHeader(vc, (key) => sortBy(key)) : '');
    renderCrumbs();
    sidebar.setCurrent(state.location);
    searchInput.placeholder = t('toolbar.searchPlaceholder', { folder: locationName() });
    ctx.window?.setTitle(`${locationName()} — ${t('title')}`);

    if (mode === 'columns') {
      const chain = columnChain();
      const open = openFolderInColumns();
      const columns = chain.map((path, i) =>
        renderColumn(columnItems.get(path) ?? [], vc, {
          path,
          active: i === chain.length - 1,
          open: chain[i + 1] ?? open ?? undefined,
        }),
      );
      if (open) columns.push(renderColumn(columnItems.get(open) ?? [], vc, { path: open, active: false }));
      view.replaceChildren(h('div', { class: 'nx-files-columns' }, ...columns));
      view.setAttribute('role', 'group');
      const active = view.querySelector('.nx-files-column.is-active');
      requestAnimationFrame(() => active?.scrollIntoView({ inline: 'nearest', block: 'nearest' }));
    } else {
      view.setAttribute('role', 'listbox');
      view.replaceChildren(...(items.length ? renderItems(items, mode, vc) : [emptyState()]));
    }
    renderStatus();
    void preview.show(selectedItems());
    if (hadFocus) {
      const target = (anchor && elementFor(anchor)) || elementFor([...selected][0] ?? '');
      (target ?? view).focus({ preventScroll: true });
    }
  }

  function emptyState() {
    const key =
      state.kind === 'trash'
        ? 'trash'
        : state.kind === 'search'
          ? 'search'
          : state.kind === 'recent'
            ? 'recent'
            : state.kind === 'tag'
              ? 'tag'
              : 'folder';
    return h(
      'div',
      { class: 'nx-empty nx-files-empty', role: 'presentation' },
      icon(key === 'trash' ? 'trash' : key === 'search' ? 'search' : 'folder-open', { size: 40 }),
      h('p', { text: t(`empty.${key}`, { tag: state.location.slice(4) }) }),
      key === 'folder' && canWriteHere() ? h('p', { class: 'nx-files-empty-hint', text: t('empty.folderHint') }) : null,
    );
  }

  function renderCrumbs() {
    if (!isFolderLocation()) {
      crumbBar.replaceChildren(h('span', { class: 'nx-files-crumb is-current', text: locationName() }));
      return;
    }
    const parts = crumbs(state.location, home);
    crumbBar.replaceChildren(
      ...parts.flatMap((c, i) => {
        const last = i === parts.length - 1;
        const label = c.home
          ? t('places.home')
          : c.trash
            ? t('places.trash')
            : c.name === '/'
              ? t('places.root')
              : c.name;
        const btn = h(
          'button',
          {
            type: 'button',
            class: `nx-files-crumb${last ? ' is-current' : ''}`,
            'aria-current': last ? 'location' : undefined,
            onclick: () => !last && void navigate(c.path),
          },
          c.home ? icon('home', { size: 14 }) : c.trash ? icon('trash', { size: 14 }) : null,
          label,
        );
        dropTarget(btn, c.path);
        return i
          ? [
              h('span', { class: 'nx-files-crumb-sep', 'aria-hidden': 'true' }, icon('chevron-right', { size: 12 })),
              btn,
            ]
          : [btn];
      }),
    );
  }

  function locationName() {
    const loc = state.location;
    if (loc === 'recent:') return t('places.recent');
    if (loc.startsWith('tag:')) return `#${loc.slice(4)}`;
    if (loc === home) return t('places.home');
    if (loc === TRASH) return t('places.trash');
    if (loc === '/') return t('places.root');
    const name = loc.slice(loc.lastIndexOf('/') + 1);
    return parentOf(loc) === home && t(`places.${name}`) !== `places.${name}` ? t(`places.${name}`) : name;
  }

  function renderStatus() {
    const sel = selectedItems();
    const bytes = sel.filter((i) => i.type === 'file').reduce((s, i) => s + i.size, 0);
    const parts = [
      state.kind === 'search'
        ? t('status.results', { count: items.length, query: state.query })
        : t('status.items', { count: items.length }),
    ];
    if (sel.length)
      parts.push(
        bytes
          ? t('status.selectedSize', { count: sel.length, size: formatSize(bytes, (n, o) => ctx.i18n.number(n, o)) })
          : t('status.selected', { count: sel.length }),
      );
    const clip = ctx.clipboard.files();
    if (clip.paths.length) parts.push(t(clip.cut ? 'status.cut' : 'status.copied', { count: clip.paths.length }));
    if (state.readOnly && state.kind === 'folder') parts.push(t('status.readOnly'));
    status.textContent = parts.join(' · ');
  }

  /** Repaints selection without rebuilding the view. */
  function paint() {
    const clip = ctx.clipboard.files();
    const cut = new Set(clip.cut ? clip.paths : []);
    for (const el of activeItems()) {
      const path = /** @type {string} */ (el.dataset.path);
      const on = selected.has(path);
      el.classList.toggle('is-selected', on);
      el.classList.toggle('is-cut', cut.has(path));
      el.setAttribute('aria-selected', String(on));
    }
    renderStatus();
    void preview.show(selectedItems());
    void refreshSelectedDefault();
    if (state.view === 'columns' && isFolderLocation() && !state.query) {
      const open = openFolderInColumns();
      const shown = /** @type {HTMLElement | null} */ (
        view.querySelector('.nx-files-column:not(.is-active):last-child')
      )?.dataset.column;
      const chainEnd = columnChain().at(-1);
      if ((open ?? chainEnd) !== shown) void loadColumns().then(() => render());
    }
  }

  async function refreshSelectedDefault() {
    const [item] = selectedItems();
    selectedDefault =
      selected.size === 1 && item?.type === 'file' && !item.trash
        ? ((await ctx.intents.getDefault(item.path)) ?? '')
        : '';
  }

  /** Item elements the selection lives in (the active column in column view). @returns {HTMLElement[]} */
  function activeItems() {
    const scope = view.querySelector('.nx-files-column.is-active') ?? view;
    return [...scope.querySelectorAll('.nx-files-item')].map((e) => /** @type {HTMLElement} */ (e));
  }
  const order = () => items.map((i) => i.path);
  const selectedItems = () => items.filter((i) => selected.has(i.path));
  /** @param {string} path */
  const elementFor = (path) => activeItems().find((e) => e.dataset.path === path);
  /** @param {string} path */
  function focusItem(path) {
    const el = elementFor(path);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** @param {string} path @param {{ ctrl?: boolean, shift?: boolean }} [mods] */
  function select(path, { ctrl = false, shift = false } = {}) {
    if (shift && anchor) {
      const range = rangeBetween(order(), anchor, path);
      selected = ctrl ? new Set([...selected, ...range]) : new Set(range);
    } else if (ctrl) {
      if (selected.has(path)) selected.delete(path);
      else selected.add(path);
      anchor = path;
    } else {
      selected = new Set([path]);
      anchor = path;
    }
    paint();
    focusItem(path);
  }

  // ─── Actions ───────────────────────────────────────────────────────────
  const canWriteHere = () => state.kind === 'folder' && !state.readOnly;
  /** @param {string} body */
  function notifyError(body) {
    ctx.notify({ title: t('errors.title'), body });
  }
  /** @param {ops.Failure[]} failed */
  function reportFailures(failed) {
    if (failed.length) notifyError(t('errors.some', { count: failed.length, reason: failed[0]?.error.message ?? '' }));
  }
  /** @param {ops.Undo | null} undo */
  const remember = (undo) => {
    if (undo) lastUndo = undo;
  };

  /** @param {Item} item */
  async function open(item) {
    if (item.type === 'folder') return navigate(item.path);
    if (item.trash) return;
    if (item.name.endsWith(SHORTCUT_EXT)) {
      try {
        const { app } = JSON.parse(/** @type {string} */ (await fs.readFile(item.path, { as: 'text' })));
        if (app) await ctx.commands.execute('shell.launchApp', { appId: app });
      } catch {
        notifyError(t('errors.noApp', { name: displayName(item) }));
      }
      return;
    }
    try {
      await ctx.intents.open({ path: item.path, type: 'file', mime: item.mime });
    } catch {
      notifyError(t('errors.noApp', { name: displayName(item) }));
    }
  }

  function openSelected() {
    const sel = selectedItems();
    const folders = sel.filter((i) => i.type === 'folder');
    if (folders.length === 1 && sel.length === 1) return void open(/** @type {Item} */ (folders[0]));
    for (const item of sel.filter((i) => i.type === 'file')) void open(item);
  }

  /** @param {'folder' | 'file'} kind */
  async function createNew(kind) {
    if (!canWriteHere()) return;
    try {
      const name = kind === 'folder' ? t('names.folder') : `${t('names.file')}.txt`;
      const { path, undo } = await ops.createNew(fs, state.location, name, kind);
      remember(undo);
      selected = new Set([path]);
      anchor = path;
      await load();
      startRename(path);
    } catch (error) {
      notifyError(String(/** @type {Error} */ (error).message));
    }
  }

  /** Inline rename (F2). @param {string} path */
  function startRename(path) {
    const item = items.find((i) => i.path === path);
    const el = elementFor(path);
    if (!item || !el || item.trash || state.readOnly) return;
    const label = /** @type {HTMLElement} */ (el.querySelector('.nx-files-name'));
    const input = h('input', {
      class: 'nx-files-rename',
      type: 'text',
      'aria-label': t('menu.rename'),
      spellcheck: 'false',
    });
    input.value = item.name;
    el.draggable = false;
    label.replaceWith(input);
    input.focus();
    const dot = item.type === 'file' ? item.name.lastIndexOf('.') : -1;
    input.setSelectionRange(0, dot > 0 ? dot : item.name.length);
    let done = false;
    renaming = true;
    const finish = async (/** @type {boolean} */ save) => {
      if (done) return;
      done = true;
      renaming = false;
      const value = input.value.trim();
      if (save && value && value !== item.name) {
        try {
          const result = await ops.rename(fs, path, value);
          remember(result.undo);
          selected = new Set([result.path]);
          anchor = result.path;
          if (item.type === 'folder') history.rewrite(path, result.path);
        } catch (error) {
          notifyError(String(/** @type {Error} */ (error).message));
        }
      }
      await load();
      focusItem([...selected][0] ?? '');
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        void finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void finish(false);
      }
    });
    input.addEventListener('blur', () => void finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
  }

  /** @param {boolean} cut */
  function copySelection(cut) {
    const paths = selectedItems()
      .filter((i) => !i.trash)
      .map((i) => i.path);
    if (paths.length) ctx.clipboard.setFiles(paths, { cut });
    paint();
  }

  /** @param {string} [dest] */
  async function paste(dest = state.location) {
    const { paths, cut } = ctx.clipboard.files();
    if (!paths.length || !(dest !== state.location || canWriteHere())) return;
    const result = await ops.transfer(fs, paths, dest, cut ? 'move' : 'copy');
    if (cut) ctx.clipboard.setFiles([]);
    remember(result.undo);
    reportFailures(result.failed);
    if (dest === state.location) selected = new Set(result.paths);
    await load();
  }

  async function trashSelection() {
    const sel = selectedItems();
    if (!sel.length || state.readOnly) return;
    if (ctx.settings.get('confirmTrash')) {
      const ok = await ctx.dialog.confirm(
        t('confirm.trash', { count: sel.length, name: displayName(/** @type {Item} */ (sel[0])) }),
        {
          title: t('confirm.trashTitle'),
          okLabel: t('confirm.trashOk'),
        },
      );
      if (!ok) return;
    }
    const next = neighbour(sel);
    const result = await ops.trash(
      fs,
      sel.map((i) => i.path),
    );
    remember(result.undo);
    reportFailures(result.failed);
    selected = new Set(next ? [next] : []);
    anchor = next ?? '';
    await load();
    if (next) focusItem(next);
  }

  /** The item to select after removing `gone`. @param {Item[]} gone */
  function neighbour(gone) {
    const paths = order();
    const removed = new Set(gone.map((i) => i.path));
    const last = Math.max(...gone.map((i) => paths.indexOf(i.path)));
    return (
      paths.slice(last + 1).find((p) => !removed.has(p)) ?? [...paths].reverse().find((p) => !removed.has(p)) ?? null
    );
  }

  async function deleteSelectionForever() {
    const sel = selectedItems();
    if (!sel.length) return;
    if (!inTrash() && state.readOnly) return;
    const ok = await ctx.dialog.confirm(
      t('confirm.delete', { count: sel.length, name: displayName(/** @type {Item} */ (sel[0])) }),
      {
        title: t('confirm.deleteTitle'),
        okLabel: t('confirm.deleteOk'),
        danger: true,
      },
    );
    if (!ok) return;
    const result = await ops.deleteForever(
      fs,
      sel.map((i) => i.path),
    );
    reportFailures(result.failed);
    selected.clear();
    await load();
  }

  async function restoreSelection() {
    const sel = selectedItems().filter((i) => i.trash);
    if (!sel.length) return;
    const result = await ops.restore(
      fs,
      sel.map((i) => i.path),
    );
    remember(result.undo);
    reportFailures(result.failed);
    selected.clear();
    await load();
  }

  async function emptyTrash() {
    const count = (await fs.listTrash()).length;
    if (!count) return;
    const ok = await ctx.dialog.confirm(t('confirm.empty', { count }), {
      title: t('confirm.emptyTitle'),
      okLabel: t('confirm.emptyOk'),
      danger: true,
    });
    if (!ok) return;
    await fs.emptyTrash();
    await load();
  }

  async function undo() {
    const step = lastUndo;
    if (!step) {
      ctx.notify({ title: t('undo.nothing') });
      return;
    }
    lastUndo = null;
    try {
      await step.run();
      ctx.notify({ title: t('undo.done', { action: t(`undo.${step.kind}`) }) });
    } catch (error) {
      notifyError(String(/** @type {Error} */ (error).message));
    }
    await load();
  }

  async function copyPaths() {
    const paths = selectedItems().map((i) => (i.trash ? i.trash.originalPath : i.path));
    const text = paths.length ? paths.join('\n') : state.location;
    try {
      await ctx.clipboard.writeText(text);
      ctx.notify({ title: t('done.pathCopied'), body: text });
    } catch {
      notifyError(t('errors.clipboard'));
    }
  }

  async function download() {
    for (const item of selectedItems()) {
      try {
        await fs.download(item.path);
      } catch (error) {
        notifyError(String(/** @type {Error} */ (error).message));
      }
    }
  }

  const terminalAvailable = () => !!ctx.system?.apps.has(TERMINAL);
  /** @param {string} cwd */
  const openTerminal = (cwd) => void ctx.system?.windows.launch(TERMINAL, { cwd });

  async function showProperties() {
    const item = selectedItems()[0] ?? null;
    const target = item ?? (isFolderLocation() ? await fs.stat(state.location) : null);
    if (!target) return;
    if (await openProperties(ctx, target)) {
      await load();
      await sidebar.render();
    }
  }

  /** @param {FileList | File[] | DataTransfer} source @param {string} dest */
  async function importFiles(source, dest) {
    try {
      const written = await fs.importFiles(source, dest);
      if (written.length) ctx.notify({ title: t('done.imported', { count: written.length }) });
    } catch (error) {
      notifyError(String(/** @type {Error} */ (error).message));
    }
    await load();
  }

  /** @param {ViewMode} mode */
  function setView(mode) {
    state.view = mode;
    persist();
    void load();
  }
  /** Narrow windows hide the sidebar; this shows it as an overlay. @param {boolean} [force] */
  function toggleSidebar(force) {
    const on = force ?? !main.classList.contains('show-sidebar');
    main.classList.toggle('show-sidebar', on);
    placesBtn.setAttribute('aria-pressed', String(on));
  }
  function togglePreview() {
    state.preview = !state.preview;
    persist();
    render();
  }
  /** @param {import('./model.js').SortKey} key */
  function sortBy(key) {
    state.sort = { key, desc: state.sort.key === key ? !state.sort.desc : key === 'modified' || key === 'size' };
    items = sortItems(items, state.sort, ctx.i18n.locale);
    persist();
    render();
  }
  function persist() {
    void ctx.storage.kv.set('prefs', { view: state.view, sort: state.sort, preview: state.preview });
    ctx.window?.stateChanged();
  }

  function editPath() {
    if (!isFolderLocation()) return;
    crumbBar.hidden = true;
    pathInput.hidden = false;
    pathInput.value = state.location;
    pathInput.focus();
    pathInput.select();
  }
  function closePathEditor() {
    pathInput.hidden = true;
    crumbBar.hidden = false;
  }
  pathInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const target = resolveInput(pathInput.value, isFolderLocation() ? state.location : home, home);
      closePathEditor();
      void navigate(target);
      view.focus();
    } else if (e.key === 'Escape') {
      closePathEditor();
      view.focus();
    }
  });
  pathInput.addEventListener('blur', closePathEditor);

  const runSearch = debounce(() => {
    state.query = searchInput.value.trim();
    if (!isFolderLocation()) state.location = home;
    selected.clear();
    watchLocation();
    void load();
  }, 200);
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (!isCommandKey(e)) e.stopPropagation();
    if (e.key === 'Escape' && searchInput.value) {
      searchInput.value = '';
      runSearch();
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      view.focus();
      if (items[0]) select(items[0].path);
    }
  });

  uploadInput.addEventListener('change', () => {
    if (uploadInput.files?.length) void importFiles([...uploadInput.files], state.location);
    uploadInput.value = '';
  });

  // ─── Menus ─────────────────────────────────────────────────────────────
  /** @returns {import('../../ui/menu.js').MenuEntry[]} */
  function viewEntries() {
    return [
      {
        label: t('toolbar.view'),
        icon: 'apps',
        submenu: VIEWS.map(([mode]) => ({
          label: t(`toolbar.${mode}`),
          checked: state.view === mode,
          run: () => setView(mode),
        })),
      },
      {
        label: t('toolbar.sort'),
        icon: 'sort',
        submenu: /** @type {const} */ (['name', 'modified', 'type', 'size']).map((key) => ({
          label: t(`columns.${key}`),
          checked: state.sort.key === key,
          run: () => sortBy(key),
        })),
      },
      {
        label: t('toolbar.showHidden'),
        checked: showHidden(),
        run: () => void ctx.settings.set('showHidden', !showHidden()),
      },
      { label: t('toolbar.preview'), checked: state.preview, shortcut: 'Alt+P', run: togglePreview },
    ];
  }

  /** @param {MouseEvent} e */
  function openMoreMenu(e) {
    const r = /** @type {HTMLElement} */ (e.currentTarget).getBoundingClientRect();
    void import('../../ui/menu.js').then(({ openMenu }) =>
      openMenu(
        [
          {
            label: t('menu.newFolder'),
            icon: 'folder-plus',
            shortcut: 'Mod+Shift+N',
            disabled: !canWriteHere(),
            run: () => void createNew('folder'),
          },
          { label: t('menu.newFile'), icon: 'file-plus', disabled: !canWriteHere(), run: () => void createNew('file') },
          { label: t('menu.upload'), icon: 'upload', disabled: !canWriteHere(), run: () => uploadInput.click() },
          'separator',
          ...viewEntries(),
          ...(state.kind === 'trash'
            ? ['separator', { label: t('menu.emptyTrash'), icon: 'trash', danger: true, run: () => void emptyTrash() }]
            : []),
        ].map((x) => /** @type {any} */ (x)),
        { x: r.left, y: r.bottom + 4, label: t('toolbar.more') },
      ),
    );
  }

  /** @param {Item} item @returns {import('../../ui/menu.js').MenuEntry[]} */
  function itemEntries(item) {
    const sel = selectedItems();
    const single = sel.length === 1;
    if (item.trash) {
      return [
        { label: t('menu.restore'), icon: 'undo', run: () => void restoreSelection() },
        {
          label: t('menu.deleteForever'),
          icon: 'trash',
          shortcut: 'Shift+Delete',
          danger: true,
          run: () => void deleteSelectionForever(),
        },
        'separator',
        {
          label: t('menu.properties'),
          icon: 'info',
          shortcut: 'Alt+Enter',
          disabled: !single,
          run: () => void showProperties(),
        },
      ];
    }
    const openers = single && item.type === 'file' ? ctx.intents.openersFor(item.path) : [];
    const appName = (/** @type {string} */ id) => ctx.system?.apps.name(id) ?? id;
    const clip = ctx.clipboard.files();
    /** @type {import('../../ui/menu.js').MenuEntry[]} */
    const entries = [
      { label: t('menu.open'), icon: 'external-link', shortcut: 'Enter', run: openSelected },
      ...(openers.length > 1
        ? [
            {
              label: t('menu.openWith'),
              icon: 'apps',
              submenu: openers.map((id) => ({
                label: appName(id),
                run: () => void ctx.intents.open(item.path, { with: id }),
              })),
            },
          ]
        : []),
      ...(openers.length
        ? [
            {
              label: t('menu.setDefault'),
              icon: 'check',
              submenu: openers.map((id) => ({
                label: appName(id),
                checked: selectedDefault === id,
                run: () =>
                  void (
                    selectedDefault === id ? ctx.intents.clearDefault(item.path) : ctx.intents.setDefault(item.path, id)
                  ).then(refreshSelectedDefault),
              })),
            },
          ]
        : []),
      ...(state.kind !== 'folder'
        ? [
            {
              label: t('menu.showInFolder'),
              icon: 'folder-open',
              disabled: !single,
              run: () => void navigate(parentOf(item.path), { select: [item.path] }),
            },
          ]
        : []),
      'separator',
      {
        label: t('menu.cut'),
        icon: 'cut',
        shortcut: 'Mod+X',
        disabled: state.readOnly,
        run: () => copySelection(true),
      },
      { label: t('menu.copy'), icon: 'copy', shortcut: 'Mod+C', run: () => copySelection(false) },
      ...(single && item.type === 'folder' && clip.paths.length
        ? [{ label: t('menu.pasteInto'), icon: 'paste', run: () => void paste(item.path) }]
        : []),
      {
        label: t('menu.rename'),
        icon: 'edit',
        shortcut: 'F2',
        disabled: !single || state.readOnly,
        run: () => startRename(item.path),
      },
      { label: t('menu.copyPath'), icon: 'link', run: () => void copyPaths() },
      { label: t('menu.download'), icon: 'download', run: () => void download() },
      ...(single && item.type === 'folder' && terminalAvailable()
        ? [{ label: t('menu.terminalHere'), icon: 'terminal', run: () => openTerminal(item.path) }]
        : []),
      'separator',
      {
        label: t('menu.trash'),
        icon: 'trash',
        shortcut: 'Delete',
        danger: true,
        disabled: state.readOnly,
        run: () => void trashSelection(),
      },
      {
        label: t('menu.properties'),
        icon: 'info',
        shortcut: 'Alt+Enter',
        disabled: !single,
        run: () => void showProperties(),
      },
    ];
    return entries;
  }

  /** @returns {import('../../ui/menu.js').MenuEntry[]} */
  function backgroundEntries() {
    const clip = ctx.clipboard.files();
    return [
      ...(canWriteHere()
        ? /** @type {import('../../ui/menu.js').MenuEntry[]} */ ([
            {
              label: t('menu.newFolder'),
              icon: 'folder-plus',
              shortcut: 'Mod+Shift+N',
              run: () => void createNew('folder'),
            },
            { label: t('menu.newFile'), icon: 'file-plus', run: () => void createNew('file') },
            {
              label: t('menu.paste'),
              icon: 'paste',
              shortcut: 'Mod+V',
              disabled: !clip.paths.length,
              run: () => void paste(),
            },
            { label: t('menu.upload'), icon: 'upload', run: () => uploadInput.click() },
            'separator',
          ])
        : []),
      ...(state.kind === 'trash'
        ? /** @type {import('../../ui/menu.js').MenuEntry[]} */ ([
            {
              label: t('menu.emptyTrash'),
              icon: 'trash',
              danger: true,
              disabled: !items.length,
              run: () => void emptyTrash(),
            },
            'separator',
          ])
        : []),
      ...viewEntries(),
      'separator',
      { label: t('menu.selectAll'), shortcut: 'Mod+A', run: selectAll },
      ...(lastUndo
        ? [
            {
              label: t('menu.undo', { action: t(`undo.${lastUndo.kind}`) }),
              icon: 'undo',
              shortcut: 'Mod+Z',
              run: () => void undo(),
            },
          ]
        : []),
      { label: t('toolbar.refresh'), icon: 'refresh', shortcut: 'F5', run: () => void load() },
      ...(isFolderLocation() && !inTrash()
        ? [
            { label: t('menu.copyPath'), icon: 'link', run: () => void copyPaths() },
            ...(terminalAvailable()
              ? [{ label: t('menu.terminalHere'), icon: 'terminal', run: () => openTerminal(state.location) }]
              : []),
            { label: t('menu.properties'), icon: 'info', run: () => void showProperties() },
          ]
        : []),
    ];
  }

  attachContextMenu(
    view,
    ({ target }) => {
      const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (target)?.closest?.('.nx-files-item'));
      const item = el ? itemAt(el) : null;
      if (item) {
        if (!selected.has(item.path)) select(item.path);
        return itemEntries(item);
      }
      if (selected.size) {
        selected.clear();
        paint();
      }
      return backgroundEntries();
    },
    { label: t('title') },
  );

  function selectAll() {
    selected = new Set(order());
    paint();
  }

  // ─── Pointer ───────────────────────────────────────────────────────────
  /** Item for an element (the column view also shows items of other folders). @param {HTMLElement} el */
  function itemAt(el) {
    const path = el.dataset.path;
    const column = /** @type {HTMLElement | null} */ (el.closest('.nx-files-column'));
    if (column && !column.classList.contains('is-active'))
      return (
        (columnItems.get(/** @type {string} */ (column.dataset.column)) ?? []).find((i) => i.path === path) ?? null
      );
    return items.find((i) => i.path === path) ?? null;
  }

  view.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.nx-files-item'));
    if (!el) return;
    const column = /** @type {HTMLElement | null} */ (el.closest('.nx-files-column'));
    if (column && !column.classList.contains('is-active')) {
      // Another folder's column: go there and select the clicked item.
      void navigate(/** @type {string} */ (column.dataset.column), {
        select: [/** @type {string} */ (el.dataset.path)],
      });
      return;
    }
    select(/** @type {string} */ (el.dataset.path), { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey });
  });
  view.addEventListener('dblclick', (e) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.nx-files-item'));
    const item = el ? itemAt(el) : null;
    if (item) void open(item);
  });

  // Box selection on empty space.
  view.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('.nx-files-item, .nx-files-column, input')) return;
    view.focus({ preventScroll: true });
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
      selected.clear();
      paint();
    }
    const box = content.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    const base = new Set(selected);
    capturePointer(view, e.pointerId);
    /** @param {PointerEvent} ev */
    const move = (ev) => {
      const r = {
        left: Math.min(ev.clientX, start.x),
        top: Math.min(ev.clientY, start.y),
        right: Math.max(ev.clientX, start.x),
        bottom: Math.max(ev.clientY, start.y),
      };
      if (r.right - r.left < 4 && r.bottom - r.top < 4) return;
      Object.assign(marquee.style, {
        left: `${r.left - box.left}px`,
        top: `${r.top - box.top}px`,
        width: `${r.right - r.left}px`,
        height: `${r.bottom - r.top}px`,
      });
      marquee.hidden = false;
      selected = new Set(base);
      for (const el of activeItems()) {
        const b = el.getBoundingClientRect();
        if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top)
          selected.add(/** @type {string} */ (el.dataset.path));
      }
      paint();
    };
    const end = () => {
      marquee.hidden = true;
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', end);
      view.removeEventListener('pointercancel', end);
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', end);
    view.addEventListener('pointercancel', end);
  });

  // ─── Drag & drop ───────────────────────────────────────────────────────
  view.addEventListener('dragstart', (e) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('.nx-files-item'));
    const item = el ? itemAt(el) : null;
    if (!item || item.trash || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    if (!selected.has(item.path)) select(item.path);
    const paths = selectedItems().map((i) => i.path);
    e.dataTransfer.setData(PATHS_MIME, JSON.stringify(paths.length ? paths : [item.path]));
    e.dataTransfer.setData('text/plain', paths.join('\n'));
    e.dataTransfer.effectAllowed = state.readOnly ? 'copy' : 'copyMove';
  });

  /** Makes an element accept dropped VFS paths and real files for `dest`. @param {HTMLElement} el @param {string | (() => string | null)} dest */
  function dropTarget(el, dest) {
    const where = () => (typeof dest === 'function' ? dest() : dest);
    el.addEventListener('dragover', (e) => {
      const types = e.dataTransfer?.types ?? [];
      const to = where();
      if (!to || !(types.includes(PATHS_MIME) || types.includes('Files'))) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = types.includes('Files') || e.ctrlKey || e.altKey ? 'copy' : 'move';
      el.classList.add('is-drop-target');
    });
    el.addEventListener('dragleave', () => el.classList.remove('is-drop-target'));
    el.addEventListener('drop', (e) => {
      el.classList.remove('is-drop-target');
      const to = where();
      const dt = e.dataTransfer;
      if (!to || !dt) return;
      e.preventDefault();
      e.stopPropagation();
      if (dt.types.includes('Files') && !dt.types.includes(PATHS_MIME)) {
        if (to !== TRASH) void importFiles(dt, to);
        return;
      }
      void dropPaths(draggedPaths(dt.getData(PATHS_MIME)), to, e.ctrlKey || e.altKey ? 'copy' : 'move');
    });
  }

  /** @param {string[]} paths @param {string} dest @param {'copy' | 'move'} mode */
  async function dropPaths(paths, dest, mode) {
    const valid = paths.filter((p) => p !== dest);
    if (!valid.length) return;
    const result = dest === TRASH ? await ops.trash(fs, valid) : await ops.transfer(fs, valid, dest, mode);
    remember(result.undo);
    reportFailures(result.failed);
    await load();
  }

  // Folder items accept drops into themselves; empty space drops into the current folder.
  dropTarget(view, () => {
    const hovered = /** @type {HTMLElement | null} */ (view.querySelector('.nx-files-item.is-drop-hover'));
    return hovered?.dataset.path ?? (canWriteHere() ? state.location : null);
  });
  view.addEventListener(
    'dragover',
    (e) => {
      const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('.nx-files-item'));
      for (const other of view.querySelectorAll('.is-drop-hover'))
        if (other !== el) other.classList.remove('is-drop-hover');
      if (el?.dataset.type === 'folder' && !itemAt(el)?.trash) el.classList.add('is-drop-hover');
    },
    true,
  );
  view.addEventListener('dragleave', (e) => {
    const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest?.('.nx-files-item'));
    if (el && !el.contains(/** @type {Node | null} */ (e.relatedTarget))) el.classList.remove('is-drop-hover');
  });
  view.addEventListener('drop', () => {
    for (const el of view.querySelectorAll('.is-drop-hover')) el.classList.remove('is-drop-hover');
  });

  // ─── Keyboard ──────────────────────────────────────────────────────────
  /** Items per row in the icon grid. */
  function perRow() {
    const els = activeItems();
    if (state.view !== 'icons' || els.length < 2) return 1;
    const top = els[0]?.offsetTop;
    let n = 0;
    while (n < els.length && els[n]?.offsetTop === top) n++;
    return Math.max(1, n);
  }

  root.addEventListener('keydown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const mod = e.ctrlKey || e.metaKey;
    if (target.closest('.nx-modal')) return;
    // In text fields only window-level shortcuts (Ctrl/Alt combos, F-keys from the search box) apply.
    if (target.closest('input, textarea, select') && !(target === searchInput && isCommandKey(e))) return;
    const key = e.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    const current = anchor && order().includes(anchor) ? anchor : ([...selected][0] ?? '');
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (e.altKey && key === 'ArrowLeft') return (handled(), back());
    if (e.altKey && key === 'ArrowRight') return (handled(), forward());
    if ((e.altKey && key === 'ArrowUp') || (key === 'Backspace' && !mod)) return (handled(), up());
    if (e.altKey && key === 'Enter') return (handled(), void showProperties());
    if (e.altKey && lower === 'p') return (handled(), togglePreview());
    if (key === 'F5' || (mod && lower === 'r')) return (handled(), void load());
    if (key === 'F4') return (handled(), editPath());
    if (mod && lower === 'f') return (handled(), searchInput.focus());
    if (mod && e.shiftKey && lower === 'n') return (handled(), void createNew('folder'));
    // Everything below acts on items: only while focus is in the view (not on toolbar buttons).
    if (!view.contains(target)) return;
    if (mod && lower === 'z') return (handled(), void undo());
    if (mod && lower === 'a') return (handled(), selectAll());
    if (mod && lower === 'c') return (handled(), copySelection(false));
    if (mod && lower === 'x') return (handled(), !state.readOnly && copySelection(true));
    if (mod && lower === 'v') return (handled(), void paste());
    if (key === 'F2' && current) return (handled(), startRename(current));
    if (key === 'Delete') {
      handled();
      if (e.shiftKey || inTrash()) void deleteSelectionForever();
      else void trashSelection();
      return;
    }
    if (key === 'Enter' && selected.size) return (handled(), openSelected());
    if (key === 'Escape' && selected.size) {
      handled();
      selected.clear();
      return paint();
    }

    const list = order();
    if (!list.length) return;
    const index = Math.max(0, list.indexOf(current));
    /** @param {number} i */
    const moveTo = (i) => {
      const path = /** @type {string} */ (list[Math.max(0, Math.min(list.length - 1, i))]);
      if (e.shiftKey) {
        const keep = anchor || current || path;
        selected = mod
          ? new Set([...selected, ...rangeBetween(list, keep, path)])
          : new Set(rangeBetween(list, keep, path));
        anchor = keep;
        paint();
        focusItem(path);
        anchor = keep;
      } else if (mod) focusItem(path);
      else select(path);
    };
    const columnsMode = state.view === 'columns' && isFolderLocation() && !state.query;
    if (columnsMode && key === 'ArrowLeft') return (handled(), up());
    if (columnsMode && key === 'ArrowRight') {
      handled();
      const item = items.find((i) => i.path === current);
      if (item?.type === 'folder') void navigate(item.path).then(() => items[0] && select(items[0].path));
      return;
    }
    const step = perRow();
    if (key === 'ArrowDown') return (handled(), moveTo(current ? index + step : 0));
    if (key === 'ArrowUp') return (handled(), moveTo(index - step));
    if (key === 'ArrowRight' && state.view === 'icons') return (handled(), moveTo(index + 1));
    if (key === 'ArrowLeft' && state.view === 'icons') return (handled(), moveTo(index - 1));
    if (key === 'Home') return (handled(), moveTo(0));
    if (key === 'End') return (handled(), moveTo(list.length - 1));
    if (key === ' ' && mod && current) {
      handled();
      return select(current, { ctrl: true });
    }
    // Type-ahead: jump to the first name starting with what was typed.
    if (key.length === 1 && !mod && !e.altKey && key !== ' ') {
      handled();
      clearTimeout(typeTimer);
      typeBuffer += key;
      typeTimer = window.setTimeout(() => (typeBuffer = ''), 800);
      const names = items.map((i) => displayName(i));
      // A fresh letter searches after the current item; longer prefixes may match it.
      const found = typeAhead(
        names,
        typeBuffer,
        typeBuffer.length === 1 && current ? index + 1 : index,
        ctx.i18n.locale,
      );
      if (found >= 0) select(/** @type {string} */ (list[found]));
    }
  });

  view.addEventListener('focus', () => {
    if (!selected.size && items[0] && !state.loading) {
      anchor = items[0].path;
      focusItem(items[0].path);
    }
  });

  // ─── Live updates ──────────────────────────────────────────────────────
  ctx.events.on('clipboard:files-changed', () => paint());
  ctx.settings.onChange('showHidden', () => void load());
  ctx.events.on(
    'vfs:changed',
    debounce(() => void sidebar.render(), 400),
  );
  /** Static labels; dynamic text is rebuilt by render(). */
  function applyLabels() {
    /** @type {[HTMLElement, string][]} */
    const labelled = [
      [backBtn, 'toolbar.back'],
      [fwdBtn, 'toolbar.forward'],
      [upBtn, 'toolbar.up'],
      [previewBtn, 'toolbar.preview'],
      [newFolderBtn, 'toolbar.newFolder'],
      [moreBtn, 'toolbar.more'],
      [placesBtn, 'places.label'],
      ...[...viewButtons.children].map(
        (b) => /** @type {[HTMLElement, string]} */ ([b, `toolbar.${/** @type {HTMLElement} */ (b).dataset.view}`]),
      ),
    ];
    for (const [el, key] of labelled) {
      el.setAttribute('aria-label', t(key));
      el.dataset.tooltip = t(key);
    }
    crumbBar.setAttribute('aria-label', t('toolbar.path'));
    pathInput.setAttribute('aria-label', t('toolbar.editPath'));
    searchInput.setAttribute('aria-label', t('toolbar.search'));
    viewButtons.setAttribute('aria-label', t('toolbar.view'));
    toolbar.setAttribute('aria-label', t('title'));
    sidebar.el.setAttribute('aria-label', t('places.label'));
    preview.el.setAttribute('aria-label', t('preview.label'));
  }
  ctx.i18n.onChange(() => {
    applyLabels();
    render();
    void sidebar.render();
  });

  function snapshot() {
    return { location: state.location, view: state.view, sort: state.sort, preview: state.preview };
  }
  function dispose() {
    unwatch?.();
    unwatch = null;
    for (const url of blobUrls) URL.revokeObjectURL(url);
    preview.dispose();
  }

  applyLabels();
  watchLocation();
  await Promise.all([load(), sidebar.render()]);
  view.focus({ preventScroll: true });

  return {
    saveState: snapshot,
    unmount: dispose,
    onIntent(intent) {
      if (intent.path) void navigate(intent.path);
    },
  };
}

/** Ctrl/Cmd/Alt combinations and function keys (not text input). @param {KeyboardEvent} e */
const isCommandKey = (e) => e.ctrlKey || e.metaKey || e.altKey || /^F\d{1,2}$/.test(e.key);

/**
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} ms
 * @returns {F}
 */
function debounce(fn, ms) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  return /** @type {F} */ (
    (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    }
  );
}
