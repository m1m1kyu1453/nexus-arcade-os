// @ts-check
// Settings pages that are mostly system settings: Personalization, Desktop & Dock, Windows,
// Notifications, Language & Region, Accessibility.
import { h, icon } from '../../../ui/dom.js';
import { group, infoRow } from '../form.js';

/** @typedef {import('./types.js').PageContext} PageContext */
/** @typedef {import('./types.js').Page} Page */

/** @type {Page} */
export const personalization = {
  id: 'personalization',
  icon: 'palette',
  keys: [
    'theme',
    'themeAutoDark',
    'themeAutoLight',
    'accent',
    'wallpaper',
    'wallpaperFit',
    'wallpaperDim',
    'wallpaperBlur',
    'slideshowFolder',
    'slideshowMinutes',
    'fontScale',
    'transparency',
    'animation',
    'batterySaver',
    'soundMuted',
    'soundMaster',
    'soundUi',
    'soundNotifications',
    'soundGames',
    'soundMedia',
  ],
  render(pc) {
    const { t } = pc;
    const theme = String(pc.value('theme'));
    const wallpaper = String(pc.value('wallpaper'));
    return [
      group(
        t('group.theme'),
        pc.row('theme'),
        theme === 'auto' ? pc.row('themeAutoDark') : null,
        theme === 'auto' ? pc.row('themeAutoLight') : null,
        pc.row('accent'),
        pc.row('transparency'),
        pc.row('animation'),
        pc.row('batterySaver'),
      ),
      group(
        t('group.wallpaper'),
        infoRow(
          t('wallpaper.current'),
          describeWallpaper(pc, wallpaper),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('wallpaper.gallery'),
            onclick: () => void pc.command('shell.wallpaper'),
          }),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('wallpaper.image'),
            onclick: async () => {
              const path = await /** @type {any} */ (pc.ctx.dialog).openFile({
                title: t('wallpaper.image'),
                accept: ['image/*'],
                startIn: `${pc.ctx.fs.home}/Pictures`,
              });
              if (typeof path === 'string') await pc.set('wallpaper', `image:${path}`);
            },
          }),
        ),
        wallpaper.startsWith('image:') || wallpaper.startsWith('slideshow') ? pc.row('wallpaperFit') : null,
        pc.row('wallpaperDim'),
        pc.row('wallpaperBlur'),
        pc.row('slideshowFolder'),
        pc.value('slideshowFolder') ? pc.row('slideshowMinutes') : null,
      ),
      group(t('group.text'), pc.row('fontScale')),
      group(
        t('group.sound'),
        pc.row('soundMuted'),
        ...(pc.value('soundMuted')
          ? []
          : ['soundMaster', 'soundUi', 'soundNotifications', 'soundGames', 'soundMedia'].map((k) => pc.row(k))),
      ),
    ];
  },
};

/** @param {PageContext} pc @param {string} value */
function describeWallpaper(pc, value) {
  const [kind, id = ''] = value.split(/:(.*)/s);
  if (kind === 'image') return id.split('/').pop() ?? id;
  return pc.t(`wallpaper.kind.${kind}`, { id }) === `wallpaper.kind.${kind}`
    ? value
    : pc.t(`wallpaper.kind.${kind}`, { id });
}

/** @type {Page} */
export const desktop = {
  id: 'desktop',
  icon: 'dock',
  keys: ['dockPosition', 'dockAutoHide', 'dockMagnification', 'dockSize'],
  render(pc) {
    const { t } = pc;
    return [
      group(
        t('group.dock'),
        pc.row('dockPosition'),
        pc.row('dockSize'),
        pc.row('dockAutoHide'),
        pc.row('dockMagnification'),
      ),
      group(
        t('group.desktop'),
        infoRow(
          t('desktop.widgets'),
          t('desktop.widgetsHint'),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('desktop.addWidget'),
            onclick: () => void pc.command('shell.widgets.add'),
          }),
        ),
        infoRow(
          t('desktop.workspaces'),
          t('desktop.workspacesHint'),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('desktop.overview'),
            onclick: () => void pc.command('shell.overview'),
          }),
        ),
      ),
    ];
  },
};

/** @type {Page} */
export const windows = {
  id: 'windows',
  icon: 'window',
  keys: ['windowSnapping', 'windowSnapLayouts'],
  render(pc) {
    const { t } = pc;
    return [
      group(t('group.snapping'), pc.row('windowSnapping'), pc.row('windowSnapLayouts')),
      group(t('group.motion'), pc.row('animation')),
      group(
        t('group.windowKeys'),
        h(
          'dl',
          { class: 'nx-set-keys' },
          ...[
            ['Mod+ArrowLeft', 'keys.snapLeft'],
            ['Mod+ArrowRight', 'keys.snapRight'],
            ['Mod+ArrowUp', 'keys.maximize'],
            ['Mod+ArrowDown', 'keys.restore'],
            ['Alt+`', 'keys.switcher'],
            ['Mod+Shift+Space', 'keys.overview'],
          ].flatMap(([combo, key]) => [
            h('dt', {}, h('kbd', { class: 'nx-kbd', text: /** @type {any} */ (pc.system).shortcuts.format(combo) })),
            h('dd', { text: t(/** @type {string} */ (key)) }),
          ]),
        ),
      ),
    ];
  },
};

/** @type {Page} */
export const notifications = {
  id: 'notifications',
  icon: 'bell',
  keys: ['doNotDisturb', 'browserNotifications', 'soundNotifications'],
  async render(pc) {
    const { t, system } = pc;
    const permission = system.notifications.browserPermission();
    const apps = system.apps.list().filter((a) => a.permissions.includes('notifications') || a.category !== 'system');
    return [
      group(
        t('group.notifications'),
        pc.row('doNotDisturb'),
        pc.row('soundNotifications'),
        h('p', { class: 'nx-set-note' }, icon('info', { size: 16 }), system.text('scheduler.limits')),
        pc.row('browserNotifications'),
        pc.value('browserNotifications')
          ? infoRow(
              t('notify.permissionLabel'),
              t(`notify.permission.${permission}`),
              permission === 'default'
                ? h('button', {
                    type: 'button',
                    class: 'nx-btn',
                    text: t('notify.allow'),
                    onclick: async () => {
                      await system.notifications.requestBrowserPermission();
                      pc.refresh();
                    },
                  })
                : null,
            )
          : null,
      ),
      group(
        t('group.perApp'),
        ...(apps.length
          ? apps.map((a) => {
              const input = h('input', {
                type: 'checkbox',
                role: 'switch',
                'aria-label': t('notify.allowFrom', { app: pc.local(a.name) }),
              });
              input.checked = !system.notifications.isMuted(a.id);
              input.addEventListener('change', () => void system.notifications.mute(a.id, !input.checked));
              return infoRow(
                pc.local(a.name),
                null,
                h('label', { class: 'nx-toggle nx-set-switch' }, input, h('span')),
              );
            })
          : [h('p', { class: 'nx-set-desc', text: t('notify.noApps') })]),
      ),
      group(
        t('group.history'),
        infoRow(
          t('notify.history'),
          t('notify.historyHint'),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('notify.clear'),
            onclick: async () => {
              await system.privacy.clearNotifications();
              pc.toast(t('done.cleared'));
            },
          }),
        ),
      ),
    ];
  },
};

/** @type {Page} */
export const language = {
  id: 'language',
  icon: 'language',
  keys: ['language', 'region'],
  render(pc) {
    const { t, ctx } = pc;
    const sample = new Date(2026, 9, 16, 14, 30);
    return [
      group(t('group.language'), pc.row('language'), pc.row('region')),
      group(
        t('group.preview'),
        h(
          'dl',
          { class: 'nx-set-keys', dataset: { testid: 'format-preview' } },
          h('dt', { text: t('format.date') }),
          h('dd', { text: ctx.i18n.date(sample, { dateStyle: 'full' }) }),
          h('dt', { text: t('format.short') }),
          h('dd', { text: ctx.i18n.date(sample, { dateStyle: 'short', timeStyle: 'short' }) }),
          h('dt', { text: t('format.number') }),
          h('dd', { text: ctx.i18n.number(1234567.891) }),
          h('dt', { text: t('format.currency') }),
          h('dd', { text: ctx.i18n.currency(1234.5, ctx.i18n.locale === 'de' ? 'EUR' : 'USD') }),
        ),
      ),
    ];
  },
};

/** @type {Page} */
export const accessibility = {
  id: 'accessibility',
  icon: 'eye',
  keys: ['animation', 'fontScale', 'focusRing', 'screenReaderHints', 'largeTargets', 'soundMuted'],
  render(pc) {
    const { t, system } = pc;
    const high = String(pc.value('theme')) === 'high-contrast';
    const contrast = h('input', { type: 'checkbox', role: 'switch', id: 'nx-set-high-contrast' });
    contrast.checked = high;
    contrast.addEventListener('change', async () => {
      // Remember the theme to go back to when high contrast is turned off again.
      if (contrast.checked) {
        await pc.ctx.storage.kv.set('themeBeforeContrast', String(pc.value('theme')));
        await system.settings.set('theme', 'high-contrast');
      } else
        await system.settings.set(
          'theme',
          String((await pc.ctx.storage.kv.get('themeBeforeContrast')) ?? 'neon-night'),
        );
      pc.refresh();
    });
    return [
      group(
        t('group.vision'),
        infoRow(
          t('a11y.highContrast'),
          t('a11y.highContrastHint'),
          h('label', { class: 'nx-toggle nx-set-switch' }, contrast, h('span')),
        ),
        pc.row('fontScale'),
        pc.row('focusRing'),
        pc.row('largeTargets'),
      ),
      group(t('group.motion'), pc.row('animation')),
      group(t('group.hearing'), pc.row('soundMuted')),
      group(
        t('group.screenReader'),
        pc.row('screenReaderHints'),
        h('p', { class: 'nx-set-note' }, icon('info', { size: 16 }), t('a11y.keyboard')),
      ),
    ];
  },
};
