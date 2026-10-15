// @ts-check
// Calendar widget: a month view with today marked; arrows switch months.
import { h, icon, replace } from '../../../ui/dom.js';

/** First day of the week for a locale: 1 = Monday … 7 = Sunday. @param {string} locale */
export function firstDayOfWeek(locale) {
  try {
    const l = /** @type {any} */ (new Intl.Locale(locale));
    const info = l.getWeekInfo?.() ?? l.weekInfo;
    if (info?.firstDay) return /** @type {number} */ (info.firstDay);
  } catch {
    // Older engines: fall through.
  }
  return locale.startsWith('en-US') || locale === 'en' ? 7 : 1;
}

/**
 * Weeks of a month as rows of 7 dates (including days of the neighbouring months).
 * @param {number} year
 * @param {number} month 0-based
 * @param {number} firstDay 1 = Monday … 7 = Sunday
 */
export function monthGrid(year, month, firstDay) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() - (firstDay % 7) + 7) % 7;
  const start = new Date(year, month, 1 - offset);
  const days = new Date(year, month + 1, 0).getDate();
  const weeks = Math.ceil((offset + days) / 7);
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)),
  );
}

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const { t } = shell;
  const locale = shell.system().i18n.locale;
  const firstDay = firstDayOfWeek(locale);
  container.classList.add('nx-wcal');
  let shown = new Date();
  shown.setDate(1);
  let today = new Date().toDateString();

  /** @param {number} delta */
  const shift = (delta) => {
    shown = new Date(shown.getFullYear(), shown.getMonth() + delta, 1);
    render();
  };

  function render() {
    const weeks = monthGrid(shown.getFullYear(), shown.getMonth(), firstDay);
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow' });
    const long = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
    replace(
      container,
      h(
        'header',
        { class: 'nx-wcal-head' },
        h(
          'button',
          {
            class: 'nx-icon-btn',
            type: 'button',
            'aria-label': t('widgets.calendar.previous'),
            onclick: () => shift(-1),
          },
          icon('chevron-left', { size: 16 }),
        ),
        h('button', {
          class: 'nx-wcal-month',
          type: 'button',
          title: t('widgets.calendar.today'),
          text: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(shown),
          onclick: () => {
            shown = new Date();
            shown.setDate(1);
            render();
          },
        }),
        h(
          'button',
          { class: 'nx-icon-btn', type: 'button', 'aria-label': t('widgets.calendar.next'), onclick: () => shift(1) },
          icon('chevron-right', { size: 16 }),
        ),
      ),
      h(
        'table',
        { class: 'nx-wcal-grid' },
        h('thead', {}, h('tr', {}, ...weeks[0].map((d) => h('th', { scope: 'col', text: weekday.format(d) })))),
        h(
          'tbody',
          {},
          ...weeks.map((week) =>
            h(
              'tr',
              {},
              ...week.map((d) =>
                h('td', {
                  class:
                    [d.getMonth() !== shown.getMonth() ? 'is-other' : '', d.toDateString() === today ? 'is-today' : '']
                      .join(' ')
                      .trim() || undefined,
                  'aria-current': d.toDateString() === today ? 'date' : undefined,
                  title: long.format(d),
                  text: String(d.getDate()),
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }

  render();
  // Roll over at midnight.
  ctx.timers.setInterval(() => {
    if (new Date().toDateString() !== today) {
      today = new Date().toDateString();
      render();
    }
  }, 60_000);
}
