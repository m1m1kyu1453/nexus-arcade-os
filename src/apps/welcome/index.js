// Welcome: a short tour of the shell. Nothing runs at import time.
import { h, icon } from '../../ui/dom.js';
import './styles.css';

const TOUR = [
  ['windows', 'window'],
  ['workspaces', 'layers'],
  ['search', 'search'],
  ['personalize', 'palette'],
];

/** @type {import('../../kernel/types').AppModule['mount']} */
export function mount(container, ctx) {
  const apple = /mac|iphone|ipad/i.test(navigator.platform);
  const mod = apple ? '⌘' : 'Ctrl';
  const keys = [
    ['palette', [mod, 'K']],
    ['launcher', [mod, 'Space']],
    ['snap', [mod, '←↑→↓']],
    ['overview', [mod, '⇧', 'Space']],
    ['switcher', ['Alt', '`']],
    ['lock', [mod, 'L']],
    ['help', [mod, '/']],
  ];

  const render = () => {
    const { t } = ctx.i18n;
    container.replaceChildren(
      h(
        'div',
        { class: 'nx-welcome' },
        h('div', { class: 'nx-welcome-head' }, h('h1', { text: t('title') }), h('p', { text: t('lead') })),
        h(
          'div',
          { class: 'nx-welcome-actions' },
          h(
            'button',
            {
              class: 'nx-btn is-primary',
              type: 'button',
              onclick: ctx.guard(() => ctx.commands.execute('shell.palette')),
            },
            icon('search', { size: 16 }),
            t('actions.palette'),
          ),
          h(
            'button',
            { class: 'nx-btn', type: 'button', onclick: ctx.guard(() => ctx.commands.execute('shell.personalize')) },
            icon('palette', { size: 16 }),
            t('actions.personalize'),
          ),
          h(
            'button',
            {
              class: 'nx-btn',
              type: 'button',
              onclick: ctx.guard(() => ctx.commands.execute('shell.launchApp', { appId: ctx.app.id })),
            },
            icon('plus', { size: 16 }),
            t('actions.another'),
          ),
        ),
        h(
          'ul',
          { class: 'nx-welcome-tour' },
          ...TOUR.map(([key, iconName]) =>
            h(
              'li',
              {},
              icon(iconName, { size: 22 }),
              h('div', {}, h('strong', { text: t(`tour.${key}.title`) }), h('p', { text: t(`tour.${key}.body`) })),
            ),
          ),
        ),
        h('h2', { text: t('shortcuts') }),
        h(
          'dl',
          { class: 'nx-welcome-keys' },
          ...keys.flatMap(([key, combo]) => [
            h('dt', {}, ...combo.map((k) => h('kbd', { class: 'nx-kbd', text: k }))),
            h('dd', { text: t(`keys.${key}`) }),
          ]),
        ),
      ),
    );
    const n = Number(ctx.app.instanceId.split('#')[1] ?? 1);
    if (n > 1) ctx.window?.setTitle(`${t('title')} — ${t('opened', { n })}`);
  };
  ctx.i18n.onChange(render);
  render();
  return {};
}
