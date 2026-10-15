// Developer test widget: exercises the manifest widget path (ctx, timers, config, crash).

/** @type {import('../../kernel/types').WidgetModule['mount']} */
export function mount(container, ctx) {
  container.innerHTML = `<div style="display:flex;gap:8px;align-items:center;height:100%">
    <span data-testid="devtest-widget"></span><button type="button">${ctx.i18n.t('crash')}</button></div>`;
  let ticks = 0;
  const label = container.querySelector('span');
  const render = () => (label.textContent = `${ctx.widget.config.get('prefix')} ${ticks}`);
  ctx.timers.setInterval(() => {
    ticks++;
    render();
  }, 1000);
  ctx.widget.config.onChange(render);
  container.querySelector('button').addEventListener(
    'click',
    ctx.guard(() => {
      throw new Error('Deliberate crash from the test widget');
    }),
  );
  render();
}
