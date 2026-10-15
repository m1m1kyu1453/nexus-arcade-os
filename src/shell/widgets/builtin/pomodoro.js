// @ts-check
// Pomodoro widget: focus and break phases. The running state lives in the widget's config (end
// time), so it survives a reload; the end of a phase is a scheduler job, so the notification
// arrives even when the widget isn't on screen.
import { h, icon, replace } from '../../../ui/dom.js';

/**
 * @typedef {object} PomodoroState
 * @property {'work' | 'break'} phase
 * @property {number | null} endAt      running until this time
 * @property {number | null} remaining  paused with this many ms left
 * @property {string | null} job        scheduler job id of the running phase
 * @property {number} done             focus phases completed
 */

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const { t } = shell;
  container.classList.add('nx-wpomo');
  const minutes = (/** @type {'work' | 'break'} */ phase) =>
    Math.max(1, Number(ctx.widget.config.get(phase)) || 1) * 60_000;
  /** @returns {PomodoroState} */
  const read = () => ({
    phase: 'work',
    endAt: null,
    remaining: null,
    job: null,
    done: 0,
    .../** @type {object} */ (ctx.widget.config.get('state') ?? {}),
  });
  /** @param {PomodoroState} s */
  const write = (s) => ctx.widget.config.set('state', s);

  /** @param {PomodoroState} s */
  const left = (s) => (s.endAt ? Math.max(0, s.endAt - Date.now()) : (s.remaining ?? minutes(s.phase)));

  async function start() {
    const s = read();
    const endAt = Date.now() + left(s);
    const job = await ctx.scheduler
      .schedule({
        title: t(s.phase === 'work' ? 'widgets.pomodoro.workDone' : 'widgets.pomodoro.breakDone'),
        at: endAt,
      })
      .catch(() => null);
    write({ ...s, endAt, remaining: null, job });
    render();
  }

  async function pause() {
    const s = read();
    if (s.job) await ctx.scheduler.cancel(s.job).catch(() => {});
    write({ ...s, remaining: left(s), endAt: null, job: null });
    render();
  }

  async function reset() {
    const s = read();
    if (s.job) await ctx.scheduler.cancel(s.job).catch(() => {});
    write({ phase: 'work', endAt: null, remaining: null, job: null, done: s.done });
    render();
  }

  async function skip() {
    const s = read();
    if (s.job) await ctx.scheduler.cancel(s.job).catch(() => {});
    next(s);
  }

  /** Moves to the other phase (stopped). @param {PomodoroState} s */
  function next(s) {
    write({
      phase: s.phase === 'work' ? 'break' : 'work',
      endAt: null,
      remaining: null,
      job: null,
      done: s.phase === 'work' ? s.done + 1 : s.done,
    });
    render();
  }

  function render() {
    const s = read();
    const ms = left(s);
    const total = minutes(s.phase);
    const mm = String(Math.floor(ms / 60_000)).padStart(2, '0');
    const ss = String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0');
    const running = s.endAt !== null;
    const ring = 2 * Math.PI * 44;
    replace(
      container,
      h('div', {
        class: `nx-wpomo-ring is-${s.phase}`,
        html: `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44"/><circle class="progress" cx="50" cy="50" r="44" stroke-dasharray="${ring}" stroke-dashoffset="${ring * (ms / total)}"/></svg>`,
      }),
      h(
        'div',
        { class: 'nx-wpomo-center' },
        h('strong', { role: 'timer', 'aria-live': 'off', text: `${mm}:${ss}` }),
        h('small', { text: t(s.phase === 'work' ? 'widgets.pomodoro.work' : 'widgets.pomodoro.break') }),
        h('small', { text: t('widgets.pomodoro.count', { count: s.done }) }),
      ),
      h(
        'div',
        { class: 'nx-wpomo-actions' },
        h(
          'button',
          {
            class: 'nx-icon-btn',
            type: 'button',
            'aria-label': t(running ? 'widgets.pomodoro.pause' : 'widgets.pomodoro.start'),
            onclick: ctx.guard(running ? pause : start),
          },
          icon(running ? 'pause' : 'play', { size: 16 }),
        ),
        h(
          'button',
          { class: 'nx-icon-btn', type: 'button', 'aria-label': t('widgets.pomodoro.skip'), onclick: ctx.guard(skip) },
          icon('skip-forward', { size: 16 }),
        ),
        h(
          'button',
          {
            class: 'nx-icon-btn',
            type: 'button',
            'aria-label': t('widgets.pomodoro.reset'),
            onclick: ctx.guard(reset),
          },
          icon('refresh', { size: 16 }),
        ),
      ),
    );
  }

  ctx.timers.setInterval(() => {
    const s = read();
    if (s.endAt !== null && s.endAt <= Date.now())
      next(s); // the scheduler job sends the notification
    else if (s.endAt !== null) render();
  }, 1000);
  ctx.widget.config.onChange((key) => key !== 'state' && render());
  render();
}
