// @ts-check
// Countdown widget: days (and hours) until a date set in the widget's settings.
import { h, replace } from '../../../ui/dom.js';

/**
 * Whole days and remaining hours from `now` until local midnight starting `date` (YYYY-MM-DD).
 * @param {string} date
 * @param {Date} [now]
 * @returns {{ days: number, hours: number, past: boolean, today: boolean } | null}
 */
export function countdown(date, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
  if (dayDiff === 0) return { days: 0, hours: 0, past: false, today: true };
  if (dayDiff < 0) return { days: -dayDiff, hours: 0, past: true, today: false };
  const ms = target.getTime() - now.getTime();
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    past: false,
    today: false,
  };
}

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const { t } = shell;
  container.classList.add('nx-wcount');

  function render() {
    const date = String(ctx.widget.config.get('date') ?? '');
    const label = String(ctx.widget.config.get('label') || '');
    const c = countdown(date);
    if (!c) {
      replace(container, h('p', { class: 'nx-w-empty', text: t('widgets.countdown.empty') }));
      return;
    }
    const value = c.today
      ? t('widgets.countdown.today')
      : c.past
        ? t('widgets.countdown.ago', { count: c.days })
        : c.days > 0
          ? t('widgets.countdown.days', { count: c.days })
          : t('widgets.countdown.hours', { count: c.hours });
    replace(
      container,
      h('strong', { text: value }),
      h('span', {
        text:
          label ||
          new Intl.DateTimeFormat(shell.system().i18n.locale, { dateStyle: 'long' }).format(new Date(`${date}T00:00`)),
      }),
    );
  }

  render();
  ctx.timers.setInterval(render, 60_000);
  ctx.widget.config.onChange(render);
}
