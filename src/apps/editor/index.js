// Nexus Edit: a tabbed text and code editor on CodeMirror 6. Files open from the VFS (intents,
// Open dialog, drag & drop from the File Explorer); unsaved work survives reloads as drafts and
// closing asks before anything is lost. Nothing runs at import time.
import { h, icon, iconButton } from '../../ui/dom.js';
import { draggedPaths, PATHS_MIME } from '../../ui/file-icons.js';
import { renderMarkdown } from '../../ui/markdown.js';
import { openModal } from '../../ui/overlay.js';
import { createEditor } from './editor.js';
import { detectEol, fileName, FONT_SIZES, tabTitles, untitledName, withEol, zoom } from './model.js';
import './styles.css';

const MAX_BYTES = 8_000_000;
const TEXT_TYPES = /^text\/|json|xml|yaml|javascript|typescript|x-sh|sql|svg/;

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'editor.new': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.editor', args: { newFile: true } }),
};

/**
 * @typedef {object} Tab
 * @property {string} id
 * @property {string | null} path
 * @property {string} untitled        name while there is no path
 * @property {import('./editor.js').Editor} editor
 * @property {string} saved           text at the last save/load ("\n" line ends)
 * @property {import('./model.js').Eol} eol
 * @property {boolean} readOnly
 * @property {'changed' | 'deleted' | null} conflict
 * @property {boolean} saving
 * @property {(() => void) | null} unwatch
 * @property {HTMLElement} el
 * @property {HTMLElement} preview
 * @property {{ line: number, column: number, selected: number }} cursor
 */

/** @type {import('../../kernel/types').AppModule['mount']} */
export async function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const fs = /** @type {any} */ (ctx.fs);
  const saved = /** @type {any} */ (args.restoredState ?? null);
  const prefs = /** @type {any} */ ((await ctx.storage.kv.get('prefs')) ?? {});
  /** @type {Record<string, { path: string | null, untitled: string, text: string, eol: import('./model.js').Eol }>} */
  const drafts = /** @type {any} */ ((await ctx.storage.kv.get('drafts')) ?? {});

  const state = {
    wrap: /** @type {boolean} */ (prefs.wrap ?? false),
    fontSize: /** @type {number} */ (prefs.fontSize ?? FONT_SIZES.default),
    preview: /** @type {boolean} */ (prefs.preview ?? true),
  };
  /** @type {Tab[]} */
  const tabs = [];
  /** @type {Tab | null} */
  let active = null;
  let nextId = 1;

  // ─── Layout ─────────────────────────────────────────────────────────────
  const btn = (/** @type {string} */ iconName, /** @type {string} */ key, /** @type {() => void} */ run) => {
    const b = iconButton({ icon: iconName, label: t(key), onClick: run });
    b.dataset.label = key;
    return b;
  };
  const wrapBtn = btn('view-list', 'toolbar.wrap', () => toggleWrap());
  const previewBtn = btn('eye', 'toolbar.preview', () => togglePreview());
  const toolbar = h(
    'div',
    { class: 'nx-edit-toolbar', role: 'toolbar', 'aria-label': t('title') },
    btn('file-plus', 'toolbar.new', () => newTab()),
    btn('folder-open', 'toolbar.open', () => void openDialog()),
    btn('download', 'toolbar.save', () => active && void save(active)),
    h('span', { class: 'nx-edit-sep' }),
    btn('search', 'toolbar.find', () => active?.editor.find()),
    btn('hash', 'toolbar.gotoLine', () => active?.editor.gotoLine()),
    wrapBtn,
    previewBtn,
    h('span', { class: 'nx-edit-sep' }),
    btn('zoom-out', 'toolbar.zoomOut', () => setFont(zoom(state.fontSize, -1))),
    btn('zoom-in', 'toolbar.zoomIn', () => setFont(zoom(state.fontSize, 1))),
  );
  const tabBar = h('div', { class: 'nx-edit-tabs', role: 'tablist', 'aria-label': t('tabs') });
  const body = h('div', { class: 'nx-edit-body' });
  const empty = h(
    'div',
    { class: 'nx-empty nx-edit-empty' },
    icon('file-code', { size: 40 }),
    h('p', { text: t('empty') }),
    h(
      'div',
      { class: 'nx-edit-empty-actions' },
      h('button', { class: 'nx-btn is-primary', type: 'button', onclick: () => newTab() }, t('toolbar.new')),
      h('button', { class: 'nx-btn', type: 'button', onclick: () => void openDialog() }, t('toolbar.open')),
    ),
  );
  const pos = h('span', { dataset: { testid: 'edit-position' } });
  const lang = h('span', { dataset: { testid: 'edit-language' } });
  const eolBtn = h('button', {
    type: 'button',
    class: 'nx-edit-status-btn',
    onclick: () => cycleEol(),
    dataset: { testid: 'edit-eol' },
  });
  const sizeBtn = h('button', {
    type: 'button',
    class: 'nx-edit-status-btn',
    onclick: () => setFont(FONT_SIZES.default),
  });
  const status = h(
    'footer',
    { class: 'nx-edit-status', dataset: { testid: 'edit-status' } },
    pos,
    h('span', { class: 'nx-edit-status-fill' }),
    lang,
    h('span', { text: 'UTF-8', title: t('status.encoding') }),
    eolBtn,
    sizeBtn,
  );
  const root = h('div', { class: 'nx-edit', dataset: { testid: 'editor' } }, toolbar, tabBar, body, status);
  container.replaceChildren(root);

  // ─── Tabs ──────────────────────────────────────────────────────────────
  const isDirty = (/** @type {Tab} */ tab) => tab.editor.text !== tab.saved || (!tab.path && tab.editor.text !== '');
  const titles = () => tabTitles(tabs.map((x) => ({ id: x.id, path: x.path, untitled: x.untitled })));

  /**
   * @param {{ path?: string | null, text?: string, saved?: string, eol?: import('./model.js').Eol, readOnly?: boolean, untitled?: string, id?: string }} init
   */
  function addTab({ path = null, text = '', saved: savedText = text, eol = 'LF', readOnly = false, untitled, id }) {
    const name = path
      ? fileName(path)
      : (untitled ??
        untitledName(
          tabs.map((x) => x.untitled),
          t('untitled'),
        ));
    const el = h('div', { class: 'nx-edit-pane' });
    const preview = h('div', { class: 'nx-edit-preview nx-markdown', 'aria-label': t('toolbar.preview') });
    /** @type {Tab} */
    const tab = /** @type {any} */ ({
      id: id ?? `t${nextId++}`,
      path,
      untitled: path ? '' : name,
      saved: savedText,
      eol,
      readOnly,
      conflict: null,
      saving: false,
      unwatch: null,
      el,
      preview,
      cursor: { line: 1, column: 1, selected: 0 },
    });
    const n = Number(tab.id.slice(1));
    if (n >= nextId) nextId = n + 1;
    tab.editor = createEditor({
      text,
      name,
      locale: ctx.i18n.locale,
      wrap: state.wrap,
      fontSize: state.fontSize,
      readOnly,
      onUpdate: (u) => {
        tab.cursor = u;
        if (u.docChanged) {
          scheduleDraft();
          renderTabs();
          if (tab === active) schedulePreview();
        }
        if (tab === active) renderStatus();
      },
    });
    el.append(h('div', { class: 'nx-edit-cm' }, tab.editor.dom), preview);
    body.append(el);
    tabs.push(tab);
    watch(tab);
    void tab.editor.setLanguage(name).then(() => tab === active && renderStatus());
    select(tab);
    return tab;
  }

  /** @param {Tab} tab */
  function select(tab) {
    active = tab;
    for (const x of tabs) x.el.hidden = x !== tab;
    empty.remove();
    renderTabs();
    renderStatus();
    renderNotice(tab);
    void renderPreview();
    requestAnimationFrame(() => tab.editor.focus());
    ctx.window?.stateChanged();
  }

  function newTab() {
    addTab({});
  }

  /** @param {Tab} tab @param {{ force?: boolean }} [options] */
  async function closeTab(tab, { force = false } = {}) {
    if (!force && isDirty(tab)) {
      const choice = await askSave([tab]);
      if (choice === 'cancel') return false;
      if (choice === 'save' && !(await save(tab))) return false;
    }
    tab.unwatch?.();
    tab.editor.destroy();
    tab.el.remove();
    const index = tabs.indexOf(tab);
    tabs.splice(index, 1);
    delete drafts[tab.id];
    void ctx.storage.kv.set('drafts', drafts);
    if (active === tab) {
      active = tabs[Math.min(index, tabs.length - 1)] ?? null;
      if (active) select(active);
      else showEmpty();
    } else renderTabs();
    ctx.window?.stateChanged();
    return true;
  }

  function showEmpty() {
    body.append(empty);
    renderTabs();
    renderStatus();
  }

  function renderTabs() {
    const names = titles();
    tabBar.replaceChildren(
      ...tabs.map((tab) => {
        const dirty = isDirty(tab);
        const title = /** @type {string} */ (names.get(tab.id));
        return h(
          'div',
          {
            class: `nx-edit-tab${tab === active ? ' is-active' : ''}${dirty ? ' is-dirty' : ''}`,
            role: 'presentation',
          },
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: 'nx-edit-tab-label',
              'aria-selected': String(tab === active),
              title: tab.path ?? title,
              onclick: () => select(tab),
              onauxclick: (/** @type {MouseEvent} */ e) => e.button === 1 && void closeTab(tab),
              dataset: { testid: 'edit-tab' },
            },
            title,
            dirty ? h('span', { class: 'nx-edit-dirty', 'aria-label': t('dirty'), title: t('dirty') }) : null,
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'nx-edit-tab-close',
              'aria-label': t('closeTab', { name: title }),
              onclick: () => void closeTab(tab),
            },
            icon('x', { size: 12 }),
          ),
        );
      }),
    );
    const current = active ? `${isDirty(active) ? '● ' : ''}${names.get(active.id)} — ` : '';
    ctx.window?.setTitle(`${current}${t('title')}`);
  }

  function renderStatus() {
    status.hidden = !active;
    if (!active) return;
    const c = active.cursor;
    pos.textContent = `${t('status.position', { line: c.line, column: c.column })}${c.selected ? ` ${t('status.selected', { count: c.selected })}` : ''}`;
    lang.textContent = active.editor.language ?? t('status.plain');
    eolBtn.textContent = active.eol;
    eolBtn.title = t('status.eol');
    sizeBtn.textContent = `${Math.round((state.fontSize / FONT_SIZES.default) * 100)} %`;
    sizeBtn.title = t('status.zoom');
    wrapBtn.setAttribute('aria-pressed', String(state.wrap));
    const md = isMarkdown(active);
    previewBtn.hidden = !md;
    previewBtn.setAttribute('aria-pressed', String(state.preview));
  }

  /** Notice above the editor: changed elsewhere, deleted, read-only. @param {Tab} tab */
  function renderNotice(tab) {
    tab.el.querySelector('.nx-edit-notice')?.remove();
    const key = tab.conflict ?? (tab.readOnly ? 'readOnly' : null);
    if (!key) return;
    const actions =
      key === 'changed'
        ? [
            h('button', { class: 'nx-btn', type: 'button', onclick: () => void reload(tab) }, t('notice.reload')),
            h(
              'button',
              { class: 'nx-btn', type: 'button', onclick: () => ((tab.conflict = null), renderNotice(tab)) },
              t('notice.keep'),
            ),
          ]
        : [h('button', { class: 'nx-btn', type: 'button', onclick: () => void saveAs(tab) }, t('notice.saveAs'))];
    tab.el.prepend(
      h(
        'div',
        { class: `nx-edit-notice is-${key}`, role: 'status' },
        icon('warning', { size: 16 }),
        h('span', { text: t(`notice.${key}`) }),
        ...actions,
      ),
    );
  }

  // ─── Files ─────────────────────────────────────────────────────────────
  /** @param {string} path */
  async function openPath(path) {
    const existing = tabs.find((x) => x.path === path);
    if (existing) return select(existing);
    try {
      const node = await fs.stat(path);
      if (!node) throw new Error(t('errors.notFound', { name: path }));
      if (node.type !== 'file') return;
      if (node.size > MAX_BYTES) throw new Error(t('errors.tooLarge', { name: node.name }));
      if (
        !TEXT_TYPES.test(node.mime) &&
        node.size > 0 &&
        !node.name.startsWith('.') &&
        node.mime !== 'application/octet-stream'
      )
        throw new Error(t('errors.binary', { name: node.name }));
      const raw = /** @type {string} */ (await fs.readFile(path, { as: 'text' }));
      const eol = detectEol(raw);
      const text = raw.replace(/\r\n?/g, '\n');
      // An empty untitled tab that was never touched is replaced by the opened file.
      const blank = tabs.length === 1 && !tabs[0]?.path && !tabs[0]?.editor.text ? tabs[0] : null;
      addTab({ path, text, eol, readOnly: !!node.readOnly });
      if (blank) void closeTab(blank, { force: true });
    } catch (error) {
      ctx.notify({ title: t('errors.openTitle'), body: String(/** @type {Error} */ (error).message) });
    }
  }

  async function openDialog() {
    const picked = await /** @type {any} */ (ctx.dialog).openFile({
      title: t('toolbar.open'),
      multiple: true,
      startIn: active?.path ? active.path.slice(0, active.path.lastIndexOf('/')) : undefined,
    });
    for (const path of [picked ?? []].flat()) await openPath(path);
  }

  /** @param {Tab} tab @returns {Promise<boolean>} */
  async function save(tab) {
    if (!tab.path || tab.readOnly || tab.conflict === 'deleted') return saveAs(tab);
    return writeTo(tab, tab.path);
  }

  /** @param {Tab} tab @returns {Promise<boolean>} */
  async function saveAs(tab) {
    const titlesMap = titles();
    const path = await /** @type {any} */ (ctx.dialog).saveFile({
      title: t('toolbar.saveAs'),
      suggestedName: tab.path ? fileName(tab.path) : `${titlesMap.get(tab.id)}.txt`,
      startIn: tab.path && !tab.readOnly ? tab.path.slice(0, tab.path.lastIndexOf('/')) : `${ctx.fs.home}/Documents`,
    });
    if (!path) return false;
    const ok = await writeTo(tab, path);
    if (ok && path !== tab.path) {
      tab.path = path;
      tab.untitled = '';
      tab.readOnly = false;
      tab.editor.setReadOnly(false);
      watch(tab);
      await tab.editor.setLanguage(fileName(path));
      renderTabs();
      renderStatus();
      ctx.window?.stateChanged();
    }
    return ok;
  }

  /** @param {Tab} tab @param {string} path */
  async function writeTo(tab, path) {
    const text = tab.editor.text;
    tab.saving = true;
    try {
      await fs.writeFile(path, withEol(text, tab.eol));
      tab.saved = text;
      tab.conflict = null;
      delete drafts[tab.id];
      void ctx.storage.kv.set('drafts', drafts);
      renderNotice(tab);
      renderTabs();
      ctx.notify({ title: t('done.saved', { name: fileName(path) }), timeoutMs: 2000 });
      return true;
    } catch (error) {
      ctx.notify({ title: t('errors.saveTitle'), body: String(/** @type {Error} */ (error).message) });
      return false;
    } finally {
      tab.saving = false;
    }
  }

  /** @param {Tab} tab */
  async function reload(tab) {
    if (!tab.path) return;
    const raw = /** @type {string} */ (await fs.readFile(tab.path, { as: 'text' }));
    const text = raw.replace(/\r\n?/g, '\n');
    tab.saved = text;
    tab.eol = detectEol(raw);
    tab.editor.setText(text);
    tab.conflict = null;
    renderNotice(tab);
    renderTabs();
    renderStatus();
  }

  /** Follows renames, reloads clean tabs changed elsewhere, flags dirty ones. @param {Tab} tab */
  function watch(tab) {
    tab.unwatch?.();
    tab.unwatch = null;
    if (!tab.path) return;
    const dir = tab.path.slice(0, tab.path.lastIndexOf('/')) || '/';
    tab.unwatch = fs.watch(dir, (/** @type {any} */ change) => {
      if (tab.saving) return;
      if (change.type === 'moved' && change.oldPath === tab.path) {
        tab.path = change.path;
        watch(tab);
        void tab.editor.setLanguage(fileName(change.path)).then(() => renderStatus());
        renderTabs();
        ctx.window?.stateChanged();
      } else if (
        (change.type === 'trashed' || change.type === 'deleted') &&
        (change.oldPath ?? change.path) === tab.path
      ) {
        tab.conflict = 'deleted';
        renderNotice(tab);
      } else if (change.type === 'modified' && change.path === tab.path) {
        if (isDirty(tab)) {
          tab.conflict = 'changed';
          renderNotice(tab);
        } else void reload(tab);
      }
    });
  }

  // ─── Drafts: unsaved text survives a reload ────────────────────────────
  let draftTimer = 0;
  function writeDrafts() {
    clearTimeout(draftTimer);
    for (const tab of tabs) {
      if (isDirty(tab))
        drafts[tab.id] = { path: tab.path, untitled: tab.untitled, text: tab.editor.text, eol: tab.eol };
      else delete drafts[tab.id];
    }
    void ctx.storage.kv.set('drafts', drafts);
  }
  function scheduleDraft() {
    clearTimeout(draftTimer);
    draftTimer = window.setTimeout(writeDrafts, 800);
  }
  // A reload right after typing must not lose the last keystrokes.
  addEventListener('pagehide', () => draftTimer && writeDrafts(), { signal: ctx.signal });

  // ─── Closing ───────────────────────────────────────────────────────────
  /**
   * Asks whether to save. @param {Tab[]} dirty
   * @returns {Promise<'save' | 'discard' | 'cancel'>}
   */
  function askSave(dirty) {
    const names = titles();
    const one = dirty.length === 1;
    return openModal({
      title: t(one ? 'confirm.oneTitle' : 'confirm.manyTitle', {
        name: names.get(/** @type {Tab} */ (dirty[0]).id),
        count: dirty.length,
      }),
      body: one
        ? t('confirm.oneBody')
        : h(
            'div',
            {},
            h('p', { text: t('confirm.manyBody') }),
            h('ul', {}, ...dirty.map((x) => h('li', { text: names.get(x.id) ?? '' }))),
          ),
      actions: [
        { label: t('confirm.cancel'), value: /** @type {const} */ ('cancel') },
        { label: t('confirm.discard'), value: /** @type {const} */ ('discard'), variant: 'danger' },
        {
          label: t(one ? 'confirm.save' : 'confirm.saveAll'),
          value: /** @type {const} */ ('save'),
          variant: 'primary',
        },
      ],
      dismissValue: /** @type {const} */ ('cancel'),
    });
  }

  // ─── Commands ──────────────────────────────────────────────────────────
  function toggleWrap() {
    state.wrap = !state.wrap;
    for (const tab of tabs) tab.editor.setWrap(state.wrap);
    persist();
    renderStatus();
  }
  function togglePreview() {
    state.preview = !state.preview;
    persist();
    void renderPreview();
    renderStatus();
  }
  /** @param {number} px */
  function setFont(px) {
    state.fontSize = px;
    for (const tab of tabs) tab.editor.setFontSize(px);
    persist();
    renderStatus();
  }
  function cycleEol() {
    if (!active) return;
    const order = /** @type {const} */ (['LF', 'CRLF', 'CR']);
    active.eol = order[(order.indexOf(active.eol) + 1) % order.length] ?? 'LF';
    // A different line ending is a change that needs saving.
    active.saved = `${active.saved}\u0000`;
    renderTabs();
    renderStatus();
    scheduleDraft();
  }
  function persist() {
    void ctx.storage.kv.set('prefs', { wrap: state.wrap, fontSize: state.fontSize, preview: state.preview });
  }

  const isMarkdown = (/** @type {Tab} */ tab) =>
    /\.(md|markdown)$/i.test(tab.path ?? '') || tab.editor.language === 'Markdown';
  let previewTimer = 0;
  const schedulePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => void renderPreview(), 250);
  };
  async function renderPreview() {
    const tab = active;
    if (!tab) return;
    const show = state.preview && isMarkdown(tab);
    tab.el.classList.toggle('has-preview', show);
    if (!show) return;
    const html = await renderMarkdown(tab.editor.text);
    if (tab === active) tab.preview.innerHTML = html;
  }

  // Shortcuts for this window (they win over system ones such as Ctrl+W).
  const opts = { allowInInputs: true };
  ctx.shortcuts.register('Mod+S', () => active && void save(active), opts);
  ctx.shortcuts.register('Mod+Shift+S', () => active && void saveAs(active), opts);
  ctx.shortcuts.register('Mod+O', () => void openDialog(), opts);
  ctx.shortcuts.register('Mod+Alt+N', () => newTab(), opts);
  ctx.shortcuts.register('Mod+W', () => active && void closeTab(active), opts);
  ctx.shortcuts.register('Mod+G', () => active?.editor.gotoLine(), opts);
  // These would otherwise open the shortcut overview and the launcher.
  ctx.shortcuts.register('Mod+/', () => active?.editor.toggleComment(), opts);
  ctx.shortcuts.register('Mod+Space', () => active?.editor.complete(), opts);
  ctx.shortcuts.register('Alt+Z', () => toggleWrap(), opts);
  ctx.shortcuts.register('Mod+Alt+P', () => togglePreview(), opts);
  ctx.shortcuts.register('Mod+=', () => setFont(zoom(state.fontSize, 1)), opts);
  ctx.shortcuts.register('Mod+-', () => setFont(zoom(state.fontSize, -1)), opts);
  ctx.shortcuts.register('Mod+0', () => setFont(FONT_SIZES.default), opts);

  // Drops: files from the File Explorer open; files from the computer open as new tabs.
  // Capture phase, so CodeMirror doesn't insert the dragged paths as text. Plain text drags
  // (selected text) still go to the editor.
  const isFileDrag = (/** @type {DragEvent} */ e) => {
    const types = e.dataTransfer?.types ?? [];
    return types.includes(PATHS_MIME) || types.includes('Files');
  };
  root.addEventListener(
    'dragover',
    (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      root.classList.add('is-drop-target');
    },
    { capture: true },
  );
  root.addEventListener('dragleave', (e) => {
    if (!root.contains(/** @type {Node | null} */ (e.relatedTarget))) root.classList.remove('is-drop-target');
  });
  root.addEventListener(
    'drop',
    (e) => {
      root.classList.remove('is-drop-target');
      const dt = e.dataTransfer;
      if (!dt || !isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (dt.types.includes(PATHS_MIME)) {
        for (const path of draggedPaths(dt.getData(PATHS_MIME))) void openPath(path);
        return;
      }
      for (const file of dt.files)
        void file
          .text()
          .then((text) =>
            addTab({ text: text.replace(/\r\n?/g, '\n'), saved: '', eol: detectEol(text), untitled: file.name }),
          );
    },
    { capture: true },
  );

  ctx.i18n.onChange(() => {
    for (const b of toolbar.querySelectorAll('[data-label]')) {
      const label = t(/** @type {string} */ (/** @type {HTMLElement} */ (b).dataset.label));
      b.setAttribute('aria-label', label);
      /** @type {HTMLElement} */ (b).dataset.tooltip = label;
    }
    for (const tab of tabs) {
      tab.editor.setLocale(ctx.i18n.locale);
      renderNotice(tab);
    }
    renderTabs();
    renderStatus();
  });

  // ─── Start: restore tabs and drafts, then open what we were launched with ─────
  if (saved?.tabs?.length) {
    for (const s of saved.tabs) {
      const draft = drafts[s.id];
      if (s.path) {
        const node = await fs.stat(s.path).catch(() => null);
        const disk = node?.type === 'file' ? /** @type {string} */ (await fs.readFile(s.path, { as: 'text' })) : null;
        if (disk === null && !draft) continue;
        const savedText = (disk ?? '').replace(/\r\n?/g, '\n');
        const tab = addTab({
          id: s.id,
          path: s.path,
          text: draft?.text ?? savedText,
          saved: disk === null ? '\u0000' : savedText,
          eol: draft?.eol ?? s.eol ?? 'LF',
          readOnly: !!node?.readOnly,
        });
        if (disk === null) {
          tab.conflict = 'deleted';
          renderNotice(tab);
        }
      } else if (draft) addTab({ id: s.id, text: draft.text, saved: '', untitled: s.untitled, eol: draft.eol });
    }
    const again = tabs.find((x) => x.id === saved.active);
    if (again) select(again);
  }
  const launchPath = /** @type {string | undefined} */ (args.intent?.path ?? args.path);
  if (launchPath) await openPath(launchPath);
  if (!tabs.length) {
    if (args.newFile || !saved) newTab();
    else showEmpty();
  }

  return {
    async canClose() {
      const dirty = tabs.filter(isDirty);
      if (!dirty.length) return true;
      const choice = await askSave(dirty);
      if (choice === 'cancel') return false;
      if (choice === 'save') for (const tab of dirty) if (!(await save(tab))) return false;
      for (const tab of tabs) delete drafts[tab.id];
      await ctx.storage.kv.set('drafts', drafts);
      return true;
    },
    saveState: () => ({
      tabs: tabs.map((x) => ({ id: x.id, path: x.path, untitled: x.untitled, eol: x.eol })),
      active: active?.id ?? null,
    }),
    onIntent(intent) {
      if (intent.path) void openPath(intent.path);
      else if (intent.action === 'share' && typeof intent.data === 'string') addTab({ text: intent.data, saved: '' });
    },
    unmount() {
      clearTimeout(draftTimer);
      clearTimeout(previewTimer);
      for (const tab of tabs) {
        tab.unwatch?.();
        tab.editor.destroy();
      }
    },
  };
}
