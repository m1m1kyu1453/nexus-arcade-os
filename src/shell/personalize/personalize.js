// @ts-check
// Personalize panel: appearance (theme, accent, text size, transparency, animations),
// wallpaper (live, gradients, your pictures, fit, dim, blur, slideshow) and dock options.
// Opened by "Change wallpaper" / "Display settings" on the desktop and from the profile menu.
import { importEntries, entriesFromFileList } from '../../services/vfs/transfer.js';
import { h, icon, replace, toggle } from '../../ui/dom.js';
import { openModal } from '../../ui/overlay.js';
import { GRADIENTS, LIVE_WALLPAPERS } from '../desktop/live-wallpapers.js';
import { registerCommand } from '../util.js';
import './personalize.css';

/** @param {import('../shell.js').ShellContext} shell */
export function createPersonalize(shell) {
  const sys = shell.system();
  const { t } = shell;
  const get = (/** @type {string} */ key) => sys.settings.get('system', key);
  const set = (/** @type {string} */ key, /** @type {unknown} */ value) =>
    sys.settings.set('system', key, value).catch(() => {});
  /** @type {string[]} */
  let urls = [];

  /**
   * @param {string} label
   * @param {string} key
   * @param {{ min: number, max: number, step: number, format?: (v: number) => string }} range
   */
  function slider(label, key, { min, max, step, format = (v) => String(v) }) {
    const out = h('output', { text: format(Number(get(key))) });
    const input = h('input', {
      class: 'nx-slider',
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
      'aria-label': label,
    });
    input.value = String(get(key));
    input.addEventListener('input', () => {
      out.textContent = format(Number(input.value));
      void set(key, Number(input.value));
    });
    return h('label', { class: 'nx-pz-row' }, h('span', { text: label }), input, out);
  }

  /** @param {string} label @param {string} key @param {{ value: string, label: string }[]} options */
  function select(label, key, options) {
    const el = h(
      'select',
      { class: 'nx-select', 'aria-label': label },
      ...options.map((o) => h('option', { value: o.value, text: o.label })),
    );
    el.value = String(get(key));
    el.addEventListener('change', () => void set(key, el.value));
    return h('label', { class: 'nx-pz-row' }, h('span', { text: label }), el);
  }

  function appearanceTab() {
    const current = String(get('theme'));
    const themes = h(
      'div',
      { class: 'nx-pz-themes', role: 'radiogroup', 'aria-label': t('personalize.theme') },
      themeCard('auto', t('palette.themeAuto'), null, current === 'auto'),
      ...sys.theme.themes().map((th) => themeCard(th.id, sys.localize(th.name), th.colors, current === th.id)),
    );
    const accent = h('input', { type: 'color', class: 'nx-pz-color', 'aria-label': t('personalize.accent') });
    accent.value = String(get('accent')) || sys.theme.token('accent') || '#3ef0ff';
    accent.addEventListener('input', () => void set('accent', accent.value.toLowerCase()));
    const reset = h('button', {
      class: 'nx-btn is-ghost',
      type: 'button',
      text: t('personalize.themeAccent'),
      onclick: () => void set('accent', ''),
    });
    const warning = h('p', {
      class: 'nx-pz-warning',
      hidden: !sys.theme.accentAdjusted,
      text: t('personalize.accentAdjusted'),
    });
    return h(
      'div',
      { class: 'nx-pz-section' },
      themes,
      h('div', { class: 'nx-pz-row' }, h('span', { text: t('personalize.accent') }), accent, reset),
      warning,
      slider(t('personalize.textSize'), 'fontScale', {
        min: 0.8,
        max: 1.5,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)} %`,
      }),
      slider(t('personalize.transparency'), 'transparency', {
        min: 0,
        max: 1,
        step: 0.1,
        format: (v) => `${Math.round(v * 100)} %`,
      }),
      select(
        t('personalize.animations'),
        'animation',
        ['auto', 'full', 'reduced', 'off'].map((v) => ({ value: v, label: t(`personalize.motion.${v}`) })),
      ),
      toggle({
        label: t('personalize.batterySaver'),
        checked: !!get('batterySaver'),
        onChange: (on) => void set('batterySaver', on),
      }),
    );
  }

  /**
   * @param {string} id
   * @param {string} name
   * @param {import('../../services/theme/themes.js').ThemePalette | null} colors
   * @param {boolean} selected
   */
  function themeCard(id, name, colors, selected) {
    const swatch = colors
      ? h(
          'span',
          { class: 'nx-pz-swatch', style: { background: colors.bg } },
          h('i', { style: { background: colors.surface2 } }),
          h('b', { style: { background: colors.accent } }),
          h('b', { style: { background: colors.accent2 } }),
        )
      : h('span', { class: 'nx-pz-swatch is-auto' }, icon('contrast', { size: 22 }));
    return h(
      'button',
      {
        class: `nx-pz-theme${selected ? ' is-selected' : ''}`,
        type: 'button',
        role: 'radio',
        'aria-checked': String(selected),
        onclick: async (/** @type {MouseEvent} */ e) => {
          await set('theme', id);
          const group = /** @type {HTMLElement} */ (e.currentTarget).parentElement;
          group?.querySelectorAll('.nx-pz-theme').forEach((b) => {
            const on = b === e.currentTarget;
            b.classList.toggle('is-selected', on);
            b.setAttribute('aria-checked', String(on));
          });
        },
      },
      swatch,
      h('span', { text: name }),
    );
  }

  async function wallpaperTab() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    const current = String(get('wallpaper'));
    /** @param {string} value @param {string} label @param {Node} preview */
    const choice = (value, label, preview) =>
      h(
        'button',
        {
          class: `nx-pz-wp${current === value ? ' is-selected' : ''}`,
          type: 'button',
          role: 'radio',
          'aria-checked': String(current === value),
          'aria-label': label,
          'data-tooltip': label,
          onclick: (/** @type {MouseEvent} */ e) => {
            void set('wallpaper', value);
            /** @type {HTMLElement} */ (e.currentTarget)
              .closest('.nx-pz-wps')
              ?.querySelectorAll('.nx-pz-wp')
              .forEach((b) => {
                b.classList.toggle('is-selected', b === e.currentTarget);
                b.setAttribute('aria-checked', String(b === e.currentTarget));
              });
          },
        },
        preview,
      );
    const palette = {
      accent: sys.theme.token('accent'),
      accent2: sys.theme.token('accent-2'),
      bg: sys.theme.token('bg'),
    };
    const liveChoices = Object.keys(LIVE_WALLPAPERS).map((id) => {
      const canvas = h('canvas', { width: '160', height: '100' });
      const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
      const live = LIVE_WALLPAPERS[id](c, palette);
      live.resize(160, 100);
      live.draw(4000, 0);
      return choice(
        `live:${id}`,
        t(`personalize.live.${id}`),
        h('span', { class: 'nx-pz-wp-preview' }, canvas, h('em', { text: t('personalize.liveBadge') })),
      );
    });
    const gradientChoices = Object.entries(GRADIENTS).map(([id, css]) =>
      choice(
        `gradient:${id}`,
        t(`personalize.gradient.${id}`),
        h('span', { class: 'nx-pz-wp-preview', style: { background: css } }),
      ),
    );
    const pictures = await sys.vfs
      .search({ under: `${sys.vfs.home}/Pictures`, type: 'file', limit: 40 })
      .catch(() => []);
    const pictureChoices = [];
    for (const p of pictures.filter((n) => n.mime.startsWith('image/')).slice(0, 24)) {
      const blob = /** @type {Blob} */ (await sys.vfs.readFile(p.path, { as: 'blob' }));
      const url = URL.createObjectURL(blob);
      urls.push(url);
      pictureChoices.push(
        choice(
          `image:${p.path}`,
          p.name,
          h('span', { class: 'nx-pz-wp-preview', style: { backgroundImage: `url("${url}")` } }),
        ),
      );
    }
    const upload = h('input', { type: 'file', accept: 'image/*', class: 'nx-visually-hidden' });
    upload.addEventListener('change', async () => {
      if (!upload.files?.length) return;
      const [path] = await importEntries(
        sys.vfs,
        entriesFromFileList(upload.files),
        `${sys.vfs.home}/Pictures/Wallpapers`,
      );
      await set('wallpaper', `image:${path}`);
      void renderTab('wallpaper');
    });
    const folders = (
      await sys.vfs.search({ under: `${sys.vfs.home}/Pictures`, type: 'folder', limit: 40 }).catch(() => [])
    ).map((f) => f.path);
    folders.unshift(`${sys.vfs.home}/Pictures`);
    const folderSelect = h(
      'select',
      { class: 'nx-select', 'aria-label': t('personalize.slideshowFolder') },
      ...folders.map((f) => h('option', { value: f, text: f.replace(sys.vfs.home, '~') })),
    );
    folderSelect.value = String(get('slideshowFolder')) || folders[0];
    return h(
      'div',
      { class: 'nx-pz-section' },
      h('h3', { text: t('personalize.live.title') }),
      h('div', { class: 'nx-pz-wps', role: 'radiogroup' }, ...liveChoices),
      h('h3', { text: t('personalize.gradients') }),
      h('div', { class: 'nx-pz-wps', role: 'radiogroup' }, ...gradientChoices),
      h('h3', { text: t('personalize.pictures') }),
      h(
        'div',
        { class: 'nx-pz-wps', role: 'radiogroup' },
        ...pictureChoices,
        h(
          'label',
          { class: 'nx-pz-wp nx-pz-add' },
          upload,
          icon('plus', { size: 22 }),
          h('span', { text: t('personalize.addPicture') }),
        ),
      ),
      select(
        t('personalize.fit'),
        'wallpaperFit',
        ['fill', 'fit', 'center', 'tile'].map((v) => ({ value: v, label: t(`personalize.fitMode.${v}`) })),
      ),
      slider(t('personalize.dim'), 'wallpaperDim', {
        min: 0,
        max: 0.8,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)} %`,
      }),
      slider(t('personalize.blur'), 'wallpaperBlur', { min: 0, max: 30, step: 1, format: (v) => `${v} px` }),
      h('h3', { text: t('personalize.slideshow') }),
      h('label', { class: 'nx-pz-row' }, h('span', { text: t('personalize.slideshowFolder') }), folderSelect),
      slider(t('personalize.slideshowMinutes'), 'slideshowMinutes', {
        min: 1,
        max: 120,
        step: 1,
        format: (v) => t('personalize.minutes', { count: v }),
      }),
      h('button', {
        class: 'nx-btn',
        type: 'button',
        text: t('personalize.startSlideshow'),
        onclick: async () => {
          await set('slideshowFolder', folderSelect.value);
          await set('wallpaper', 'slideshow');
        },
      }),
    );
  }

  function dockTab() {
    return h(
      'div',
      { class: 'nx-pz-section' },
      select(
        t('personalize.dockPosition'),
        'dockPosition',
        ['bottom', 'left', 'right'].map((v) => ({ value: v, label: t(`personalize.side.${v}`) })),
      ),
      slider(t('personalize.dockSize'), 'dockSize', { min: 32, max: 72, step: 2, format: (v) => `${v} px` }),
      toggle({
        label: t('personalize.dockAutoHide'),
        checked: !!get('dockAutoHide'),
        onChange: (on) => void set('dockAutoHide', on),
      }),
      toggle({
        label: t('personalize.dockMagnification'),
        checked: !!get('dockMagnification'),
        onChange: (on) => void set('dockMagnification', on),
      }),
    );
  }

  const panel = h('div', { class: 'nx-pz-panel', role: 'tabpanel' });
  const tabs = ['appearance', 'wallpaper', 'dock'];
  /** @param {string} id */
  async function renderTab(id) {
    panel.setAttribute('aria-labelledby', `nx-pz-tab-${id}`);
    replace(panel, h('p', { class: 'nx-empty', text: '…' }));
    replace(panel, id === 'appearance' ? appearanceTab() : id === 'wallpaper' ? await wallpaperTab() : dockTab());
  }

  /** @param {string} [tab] */
  async function open(tab = 'appearance') {
    const tablist = h('div', { class: 'nx-pz-tabs', role: 'tablist', 'aria-label': t('shell.personalize') });
    const select = (/** @type {string} */ id, focus = false) => {
      tablist.querySelectorAll('[role="tab"]').forEach((b) => {
        const on = /** @type {HTMLElement} */ (b).dataset.tab === id;
        b.setAttribute('aria-selected', String(on));
        b.setAttribute('tabindex', on ? '0' : '-1');
        if (on && focus) /** @type {HTMLElement} */ (b).focus();
      });
      void renderTab(id);
    };
    for (const id of tabs) {
      tablist.append(
        h('button', {
          id: `nx-pz-tab-${id}`,
          class: 'nx-pz-tab',
          type: 'button',
          role: 'tab',
          'aria-controls': 'nx-pz-panel',
          dataset: { tab: id },
          text: t(`personalize.tab.${id}`),
          onclick: () => select(id),
        }),
      );
    }
    tablist.addEventListener('keydown', (e) => {
      const i = tabs.findIndex(
        (id) => tablist.querySelector(`[data-tab="${id}"]`)?.getAttribute('aria-selected') === 'true',
      );
      if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length], true);
      if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length], true);
    });
    panel.id = 'nx-pz-panel';
    select(tab);
    await openModal({
      title: t('shell.personalize'),
      body: h('div', { class: 'nx-pz' }, tablist, panel),
      actions: [{ label: t('personalize.done'), value: true, variant: 'primary' }],
      dismissValue: false,
      size: 'lg',
    });
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  }

  registerCommand(sys, { id: 'shell.personalize', title: 'shell.personalize', icon: 'palette', run: () => open() });
  registerCommand(sys, {
    id: 'shell.wallpaper',
    title: 'personalize.changeWallpaper',
    icon: 'wallpaper',
    run: () => open('wallpaper'),
  });
  return { open };
}
