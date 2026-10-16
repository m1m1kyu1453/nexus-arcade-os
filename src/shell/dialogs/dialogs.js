// @ts-check
// System dialogs behind ctx.dialog: alert, confirm, prompt, file open/save (a mini file
// browser on the VFS), color picker and app picker ("Open with…").
import { entriesFromFileList, importEntries } from '../../services/vfs/transfer.js';
import { h, icon, replace } from '../../ui/dom.js';
import { openModal } from '../../ui/overlay.js';
import { appIcon } from '../app-icon.js';
import { fileIconName } from '../../ui/file-icons.js';
import { appName } from '../util.js';
import './dialogs.css';

/** @param {import('../shell.js').ShellContext} shell */
export function createDialogs(shell) {
  const sys = shell.system();
  const { t } = shell;
  const ok = () => ({ label: t('dialog.ok'), value: true, variant: /** @type {const} */ ('primary') });
  const cancel = () => ({ label: t('dialog.cancel'), value: false });

  /** @param {string} message @param {{ title?: string }} [options] */
  async function alert(message, { title } = {}) {
    await openModal({ title: title ?? t('dialog.notice'), body: message, actions: [ok()], dismissValue: true });
  }

  /**
   * @param {string} message
   * @param {{ title?: string, okLabel?: string, danger?: boolean }} [options]
   */
  async function confirm(message, { title, okLabel, danger } = {}) {
    return openModal({
      title: title ?? t('dialog.confirm'),
      body: message,
      actions: [cancel(), { label: okLabel ?? t('dialog.ok'), value: true, variant: danger ? 'danger' : 'primary' }],
      dismissValue: false,
    });
  }

  /**
   * @param {string} message
   * @param {string} [value]
   * @param {{ title?: string, placeholder?: string }} [options]
   * @returns {Promise<string | null>}
   */
  async function prompt(message, value = '', { title, placeholder } = {}) {
    const input = h('input', { class: 'nx-input', type: 'text', placeholder, 'aria-label': message });
    input.value = value;
    const accepted = await openModal({
      title: title ?? message,
      body: h('div', { class: 'nx-dlg-stack' }, title ? h('p', { text: message }) : null, input),
      actions: [cancel(), ok()],
      dismissValue: false,
      onOpen: (done) => {
        input.addEventListener('keydown', (e) => e.key === 'Enter' && done(true));
        setTimeout(() => input.select());
      },
    });
    return accepted ? input.value : null;
  }

  /**
   * Mini file browser shared by open and save.
   * @param {{ mode: 'open' | 'save' | 'folder', title?: string, accept?: string[], multiple?: boolean, startIn?: string, suggestedName?: string }} options
   * @returns {Promise<string | string[] | null>}
   */
  async function browse({ mode, title, accept, multiple = false, startIn, suggestedName = '' }) {
    let dir = startIn && (await sys.vfs.stat(startIn))?.type === 'folder' ? startIn : `${sys.vfs.home}/Documents`;
    /** @type {Set<string>} */
    const selected = new Set();
    const crumbs = h('nav', { class: 'nx-dlg-crumbs', 'aria-label': t('dialog.location') });
    const list = h('ul', {
      class: 'nx-dlg-files',
      role: 'listbox',
      'aria-multiselectable': String(multiple),
      tabindex: '0',
    });
    const places = h('ul', { class: 'nx-dlg-places' });
    const nameInput = h('input', { class: 'nx-input', type: 'text', 'aria-label': t('dialog.fileName') });
    nameInput.value = suggestedName;
    const upload = h('input', { type: 'file', class: 'nx-visually-hidden', multiple });
    /** @type {(value: any) => void} */
    let finish = () => {};
    /** @type {string | null} */
    let saved = null;

    /** @param {import('../../services/vfs/vfs.js').VfsNode} n */
    const accepted = (n) =>
      n.type === 'folder' ||
      (mode !== 'folder' && !accept?.length) ||
      accept.some((a) =>
        a.startsWith('.')
          ? n.name.toLowerCase().endsWith(a.toLowerCase())
          : a.endsWith('/*')
            ? n.mime.startsWith(a.slice(0, -1))
            : n.mime === a,
      );

    for (const [label, path, iconName] of [
      [t('dialog.place.home'), sys.vfs.home, 'home'],
      [t('dialog.place.desktop'), `${sys.vfs.home}/Desktop`, 'monitor'],
      [t('dialog.place.documents'), `${sys.vfs.home}/Documents`, 'file-text'],
      [t('dialog.place.downloads'), `${sys.vfs.home}/Downloads`, 'download'],
      [t('dialog.place.pictures'), `${sys.vfs.home}/Pictures`, 'image'],
      [t('dialog.place.projects'), `${sys.vfs.home}/Projects`, 'code'],
    ]) {
      places.append(
        h(
          'li',
          {},
          h(
            'button',
            { class: 'nx-dlg-place', type: 'button', onclick: () => go(path) },
            icon(iconName, { size: 16 }),
            label,
          ),
        ),
      );
    }

    /** @param {string} path */
    async function go(path) {
      dir = path;
      selected.clear();
      await render();
      list.focus();
    }

    async function render() {
      const parts = dir.split('/').filter(Boolean);
      replace(
        crumbs,
        ...parts.map((part, i) => {
          const path = `/${parts.slice(0, i + 1).join('/')}`;
          return h('button', { class: 'nx-dlg-crumb', type: 'button', text: part, onclick: () => go(path) });
        }),
      );
      const nodes = (await sys.vfs.list(dir, { hidden: false }).catch(() => [])).filter(accepted);
      if (!nodes.length) {
        replace(
          list,
          h('li', {
            class: 'nx-empty',
            role: 'presentation',
            text: t(mode === 'folder' ? 'dialog.noSubfolders' : 'dialog.emptyFolder'),
          }),
        );
        return;
      }
      replace(
        list,
        ...nodes.map((n) =>
          h(
            'li',
            {
              class: `nx-dlg-file${selected.has(n.path) ? ' is-selected' : ''}`,
              role: 'option',
              'aria-selected': String(selected.has(n.path)),
              tabindex: '-1',
              dataset: { path: n.path },
              onclick: (/** @type {MouseEvent} */ e) => pick(n, e.ctrlKey || e.metaKey),
              ondblclick: () => (n.type === 'folder' ? go(n.path) : confirmPick(n)),
              onkeydown: (/** @type {KeyboardEvent} */ e) => {
                if (e.key === 'Enter') n.type === 'folder' ? go(n.path) : confirmPick(n);
              },
            },
            icon(fileIconName(n.mime, n.name), { size: 18 }),
            h('span', { class: 'nx-dlg-name', text: n.name }),
            h('small', { text: n.type === 'file' ? sys.i18n.format.bytes(n.size) : '' }),
          ),
        ),
      );
    }

    /** @param {import('../../services/vfs/vfs.js').VfsNode} n @param {boolean} add */
    function pick(n, add) {
      if (n.type === 'folder') return;
      if (!(multiple && add)) selected.clear();
      if (selected.has(n.path)) selected.delete(n.path);
      else selected.add(n.path);
      if (mode === 'save') nameInput.value = n.name;
      list.querySelectorAll('.nx-dlg-file').forEach((el) => {
        const on = selected.has(/** @type {HTMLElement} */ (el).dataset.path ?? '');
        el.classList.toggle('is-selected', on);
        el.setAttribute('aria-selected', String(on));
      });
    }

    /** @param {import('../../services/vfs/vfs.js').VfsNode} n */
    function confirmPick(n) {
      if (mode === 'open') return finish(multiple ? [n.path] : n.path);
      nameInput.value = n.name;
      void submitSave();
    }

    /** @returns {Promise<string | null>} the target path, or null if the name is invalid or replacing was declined */
    async function savePath() {
      const name = nameInput.value.trim();
      if (!name || /[/\\]/.test(name) || name === '.' || name === '..') {
        nameInput.focus();
        return null;
      }
      const path = `${dir === '/' ? '' : dir}/${name}`;
      if (
        (await sys.vfs.stat(path)) &&
        !(await confirm(t('dialog.overwrite', { name }), { danger: true, okLabel: t('dialog.replace') }))
      )
        return null;
      return path;
    }

    async function submitSave() {
      const path = await savePath();
      if (path) finish(path);
    }

    // Arrow keys in the list.
    list.addEventListener('keydown', (e) => {
      const items = /** @type {HTMLElement[]} */ ([...list.querySelectorAll('.nx-dlg-file')]);
      if (!items.length) return;
      const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))] ?? items[0];
        next.focus();
        next.click();
      } else if (e.key === 'Backspace' && dir !== '/') {
        e.preventDefault();
        void go(dir.slice(0, dir.lastIndexOf('/')) || '/');
      }
    });
    upload.addEventListener('change', async () => {
      if (!upload.files?.length) return;
      const written = await importEntries(sys.vfs, entriesFromFileList(upload.files), dir);
      if (mode === 'open') finish(multiple ? written : written[0]);
      else await render();
    });

    await render();
    const body = h(
      'div',
      { class: 'nx-dlg-browser' },
      places,
      h(
        'div',
        { class: 'nx-dlg-main' },
        crumbs,
        list,
        mode === 'save'
          ? h('label', { class: 'nx-field' }, h('span', { text: t('dialog.fileName') }), nameInput)
          : null,
        h(
          'label',
          { class: 'nx-btn is-ghost nx-dlg-upload' },
          upload,
          icon('upload', { size: 16 }),
          t(mode === 'open' ? 'dialog.importFromComputer' : 'dialog.importHere'),
        ),
      ),
    );
    const result = await openModal({
      title:
        title ?? t(mode === 'open' ? 'dialog.openFile' : mode === 'folder' ? 'dialog.chooseFolder' : 'dialog.saveFile'),
      body,
      size: 'md',
      actions: [
        cancel(),
        {
          label: t(mode === 'open' ? 'dialog.open' : mode === 'folder' ? 'dialog.selectFolder' : 'dialog.save'),
          value: 'submit',
          variant: 'primary',
          accept: async () => {
            if (mode === 'folder') return true;
            if (mode === 'open') return selected.size > 0;
            saved = await savePath();
            return !!saved;
          },
        },
      ],
      dismissValue: false,
      onOpen: (done) => {
        finish = (value) => done(value);
        if (mode === 'save') {
          nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && void submitSave());
          setTimeout(() => {
            nameInput.focus();
            const dot = nameInput.value.lastIndexOf('.');
            nameInput.setSelectionRange(0, dot > 0 ? dot : nameInput.value.length);
          });
        }
      },
    });
    if (result === 'submit') {
      if (mode === 'folder') return dir;
      if (mode === 'save') return saved;
      return multiple ? [...selected] : ([...selected][0] ?? null);
    }
    return result || null;
  }

  /** @param {{ title?: string, value?: string }} [options] @returns {Promise<string | null>} */
  async function color({ title, value = sys.theme.token('accent') || '#3ef0ff' } = {}) {
    const picker = h('input', { type: 'color', class: 'nx-dlg-color', 'aria-label': t('dialog.color') });
    picker.value = value;
    const hex = h('input', {
      class: 'nx-input',
      type: 'text',
      maxlength: '7',
      'aria-label': 'Hex',
      pattern: '#[0-9a-fA-F]{6}',
    });
    hex.value = value;
    const set = (/** @type {string} */ v) => {
      picker.value = v;
      hex.value = v;
    };
    picker.addEventListener('input', () => set(picker.value));
    hex.addEventListener('input', () => /^#[0-9a-f]{6}$/i.test(hex.value) && set(hex.value.toLowerCase()));
    const swatches = sys.theme
      .themes()
      .flatMap((th) => [th.colors.accent, th.colors.accent2])
      .filter((c, i, all) => all.indexOf(c) === i)
      .map((c) =>
        h('button', {
          class: 'nx-dlg-swatch',
          type: 'button',
          style: { background: c },
          'aria-label': c,
          onclick: () => set(c),
        }),
      );
    const accepted = await openModal({
      title: title ?? t('dialog.color'),
      body: h(
        'div',
        { class: 'nx-dlg-stack' },
        h('div', { class: 'nx-dlg-color-row' }, picker, hex),
        h('div', { class: 'nx-dlg-swatches' }, ...swatches),
      ),
      actions: [cancel(), ok()],
      dismissValue: false,
    });
    return accepted ? hex.value.toLowerCase() : null;
  }

  /**
   * @param {{ candidates: { id: string, name?: string }[], title?: string }} request
   * @returns {Promise<{ appId: string, always: boolean } | null>}
   */
  async function pickApp({ candidates, title }) {
    const always = h('input', { type: 'checkbox' });
    let chosen = candidates[0]?.id ?? '';
    const list = h(
      'div',
      { class: 'nx-dlg-apps', role: 'radiogroup', 'aria-label': t('dialog.chooseApp') },
      ...candidates.map((c, i) => {
        const m = sys.registry.get(c.id);
        const radio = h('input', { type: 'radio', name: 'nx-pick-app', value: c.id });
        radio.checked = i === 0;
        radio.addEventListener('change', () => (chosen = c.id));
        return h(
          'label',
          { class: 'nx-dlg-app' },
          radio,
          m ? appIcon(m, 28) : '',
          h('span', { text: c.name ?? appName(sys, c.id) }),
        );
      }),
    );
    const accepted = await openModal({
      title: title ?? t('dialog.openWith'),
      body: h(
        'div',
        { class: 'nx-dlg-stack' },
        list,
        h('label', { class: 'nx-dlg-always' }, always, t('dialog.always')),
      ),
      actions: [cancel(), ok()],
      dismissValue: false,
    });
    return accepted && chosen ? { appId: chosen, always: always.checked } : null;
  }

  return {
    alert,
    confirm,
    prompt,
    /** @param {{ title?: string, accept?: string[], multiple?: boolean, startIn?: string }} [options] */
    openFile: (options = {}) => browse({ ...options, mode: 'open' }),
    /** @param {{ title?: string, suggestedName?: string, startIn?: string }} [options] */
    saveFile: (options = {}) => browse({ ...options, mode: 'save' }),
    /** Picks a folder (the one shown when the user confirms). @param {{ title?: string, startIn?: string }} [options] */
    openFolder: (options = {}) => browse({ ...options, mode: 'folder' }),
    color,
    pickApp,
  };
}
