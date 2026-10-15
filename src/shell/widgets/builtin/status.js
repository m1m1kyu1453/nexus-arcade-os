// @ts-check
// System status widget: frame rate, storage use, online/offline and battery (where the browser
// reports it). Values the browser doesn't provide are left out rather than guessed.
import { estimateQuota } from '../../../services/storage/quota.js';
import { h, icon, replace } from '../../../ui/dom.js';

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const { t } = shell;
  const sys = shell.system();
  container.classList.add('nx-wstatus');
  /** @type {{ fps: number | null, storage: { usage: number, quota: number } | null, battery: { level: number, charging: boolean } | null }} */
  const state = { fps: null, storage: null, battery: null };

  /** @param {string} iconName @param {string} label @param {string} value @param {number} [ratio] */
  const row = (iconName, label, value, ratio) =>
    h(
      'li',
      {},
      icon(iconName, { size: 16 }),
      h('span', { text: label }),
      h('strong', { text: value }),
      ratio === undefined ? null : h('meter', { min: '0', max: '1', value: String(ratio), 'aria-label': label }),
    );

  function render() {
    replace(
      container,
      h(
        'ul',
        {},
        row('activity', t('widgets.status.fps'), state.fps === null ? '…' : String(state.fps)),
        state.storage
          ? row(
              'hard-drive',
              t('widgets.status.storage'),
              sys.i18n.format.bytes(state.storage.usage),
              state.storage.quota ? state.storage.usage / state.storage.quota : 0,
            )
          : null,
        navigator.onLine
          ? row('online', t('widgets.status.network'), t('widgets.status.online'))
          : row('offline', t('widgets.status.network'), t('widgets.status.offline')),
        state.battery
          ? row(
              'battery',
              t('widgets.status.battery'),
              `${Math.round(state.battery.level * 100)} %${state.battery.charging ? ` · ${t('widgets.status.charging')}` : ''}`,
              state.battery.level,
            )
          : null,
      ),
    );
  }

  // Frame rate: frames counted per second by an animation loop (pauses with the widget).
  let frames = 0;
  let elapsed = 0;
  ctx.timers.loop((dt) => {
    frames++;
    elapsed += dt;
    if (elapsed >= 1000) {
      state.fps = Math.round((frames * 1000) / elapsed);
      frames = 0;
      elapsed = 0;
      render();
    }
  });

  const refreshStorage = async () => {
    state.storage = await estimateQuota();
    render();
  };
  void refreshStorage();
  ctx.timers.setInterval(() => void refreshStorage(), 30_000);

  addEventListener('online', render, { signal: ctx.signal });
  addEventListener('offline', render, { signal: ctx.signal });

  const nav = /** @type {Navigator & { getBattery?: () => Promise<any> }} */ (navigator);
  nav
    .getBattery?.()
    .then(
      ctx.guard((/** @type {any} */ battery) => {
        const update = () => {
          state.battery = { level: battery.level, charging: battery.charging };
          render();
        };
        update();
        battery.addEventListener('levelchange', update, { signal: ctx.signal });
        battery.addEventListener('chargingchange', update, { signal: ctx.signal });
      }),
    )
    .catch(() => {});
  render();
}
