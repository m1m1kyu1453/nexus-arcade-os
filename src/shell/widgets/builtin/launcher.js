// @ts-check
// App launcher grid widget: dock apps, recent apps or all apps as a grid of icons.
import { h, replace } from '../../../ui/dom.js';
import { appIcon } from '../../app-icon.js';
import { appName } from '../../util.js';

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const sys = shell.system();
  container.classList.add('nx-wlaunch');

  function ids() {
    const source = ctx.widget.config.get('source');
    const session = shell.session.data;
    const list =
      source === 'recent'
        ? session.recentApps
        : source === 'all'
          ? sys.registry.list().map((m) => m.id)
          : session.pinned;
    return list.filter((id) => sys.registry.get(id));
  }

  function render() {
    const apps = ids();
    if (!apps.length) {
      replace(container, h('p', { class: 'nx-w-empty', text: shell.t('widgets.launcher.empty') }));
      return;
    }
    replace(
      container,
      h(
        'ul',
        { style: { '--cols': String(Math.max(1, ctx.widget.size()[0] * 2 - 1)) } },
        ...apps.map((id) =>
          h(
            'li',
            {},
            h(
              'button',
              {
                type: 'button',
                title: appName(sys, id),
                'aria-label': appName(sys, id),
                onclick: () => void shell.launch(id),
              },
              appIcon(/** @type {import('../../../kernel/types').AppManifest} */ (sys.registry.get(id)), 36),
            ),
          ),
        ),
      ),
    );
  }

  render();
  ctx.widget.config.onChange(render);
  ctx.widget.onResize(render);
  // Dock and recent apps change as the user works.
  ctx.events.on('app:launched', render);
  const offPinned = shell.session.onPinned(render);
  return { unmount: offPinned };
}
