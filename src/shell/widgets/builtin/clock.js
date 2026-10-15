// @ts-check
// Clock widget: digital, analog or a world clock (several time zones).
import { h, replace } from '../../../ui/dom.js';

/** @param {string} zone */
function validZone(zone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Hour/minute/second of `date` in a time zone. @param {Date} date @param {string | undefined} timeZone */
function partsIn(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (/** @type {string} */ type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get('hour'), m: get('minute'), s: get('second') };
}

/** @param {string} zone */
const cityOf = (zone) => zone.slice(zone.lastIndexOf('/') + 1).replaceAll('_', ' ');

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const { t } = shell;
  const locale = shell.system().i18n.locale;
  container.classList.add('nx-wclock');

  const zones = () =>
    String(ctx.widget.config.get('zones') ?? '')
      .split(',')
      .map((z) => z.trim())
      .filter(Boolean);
  const style = () => String(ctx.widget.config.get('style'));
  const seconds = () => !!ctx.widget.config.get('seconds');

  /** @param {Date} now @param {string | undefined} timeZone */
  const time = (now, timeZone) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: seconds() ? '2-digit' : undefined,
    }).format(now);

  function render() {
    const now = new Date();
    const list = zones();
    const bad = list.filter((z) => !validZone(z));
    const good = list.filter(validZone);
    const zone = good[0];
    const warning = bad.length
      ? h('p', { class: 'nx-w-warn', text: t('widgets.clock.badZone', { zones: bad.join(', ') }) })
      : null;

    if (style() === 'world') {
      const rows = (good.length ? good : [undefined]).map((z) => {
        const local = partsIn(now, undefined);
        const there = partsIn(now, z);
        const diffH = Math.round(((there.h * 60 + there.m - (local.h * 60 + local.m) + 1440 * 1.5) % 1440) / 60 - 12);
        return h(
          'li',
          {},
          h('span', { class: 'nx-wclock-city', text: z ? cityOf(z) : t('widgets.clock.local') }),
          h('small', { text: diffH ? `${diffH > 0 ? '+' : ''}${diffH} h` : '' }),
          h('strong', { text: time(now, z) }),
        );
      });
      replace(container, h('ul', { class: 'nx-wclock-world' }, ...rows), warning ?? '');
      return;
    }

    if (style() === 'analog') {
      const p = partsIn(now, zone);
      const hand = (/** @type {number} */ deg, /** @type {number} */ len, /** @type {string} */ cls) =>
        `<line class="${cls}" x1="50" y1="50" x2="50" y2="${50 - len}" transform="rotate(${deg} 50 50)"/>`;
      const ticks = Array.from(
        { length: 12 },
        (_, i) =>
          `<line class="tick" x1="50" y1="6" x2="50" y2="${i % 3 ? 10 : 13}" transform="rotate(${i * 30} 50 50)"/>`,
      ).join('');
      const svg = h('div', {
        class: 'nx-wclock-face',
        role: 'img',
        'aria-label': time(now, zone),
        html: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47"/>${ticks}${hand((p.h % 12) * 30 + p.m / 2, 24, 'hour')}${hand(p.m * 6 + p.s / 10, 34, 'minute')}${seconds() ? hand(p.s * 6, 38, 'second') : ''}<circle class="pin" cx="50" cy="50" r="2.5"/></svg>`,
      });
      replace(container, svg, zone ? h('small', { class: 'nx-wclock-zone', text: cityOf(zone) }) : '', warning ?? '');
      return;
    }

    replace(
      container,
      h('strong', { class: 'nx-wclock-time', text: time(now, zone) }),
      h('span', {
        class: 'nx-wclock-date',
        text: new Intl.DateTimeFormat(locale, {
          timeZone: zone,
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }).format(now),
      }),
      zone ? h('small', { class: 'nx-wclock-zone', text: cityOf(zone) }) : '',
      warning ?? '',
    );
  }

  render();
  ctx.timers.setInterval(render, 1000);
  ctx.widget.config.onChange(render);
}
