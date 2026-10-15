// Developer test app UI. Nothing happens at import time (Lite evaluates all modules at load).

/** @type {import('../../kernel/types').AppModule['mount']} */
export async function mount(container, ctx) {
  const { t } = ctx.i18n;
  const items = ctx.storage.collection('items');
  container.innerHTML = `
    <div class="nx-devtest" style="display:grid;gap:8px;padding:12px">
      <strong data-testid="devtest-title"></strong>
      <span data-testid="devtest-count"></span>
      <span data-testid="devtest-ticks"></span>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        <button type="button" data-action="add"></button>
        <button type="button" data-action="notify"></button>
        <button type="button" data-action="crash"></button>
        <button type="button" data-action="crash-async"></button>
      </div>
    </div>`;
  const $ = (s) => container.querySelector(s);
  const render = async () => {
    $('[data-testid="devtest-title"]').textContent = `${t('title')} — ${ctx.settings.get('greeting')}`;
    $('[data-testid="devtest-count"]').textContent = t('items', { count: await items.count() });
    $('[data-action="add"]').textContent = t('add');
    $('[data-action="notify"]').textContent = t('notify');
    $('[data-action="crash"]').textContent = t('crash');
    $('[data-action="crash-async"]').textContent = t('crashAsync');
  };

  let ticks = 0;
  ctx.timers.setInterval(() => {
    ticks++;
    $('[data-testid="devtest-ticks"]').textContent = t('ticks', { count: ticks });
  }, 1000);

  const on = (action, fn) =>
    $(`[data-action="${action}"]`).addEventListener('click', ctx.guard(fn), { signal: ctx.signal });
  on('add', async () => {
    const n = (await items.count()) + 1;
    const path = `${ctx.fs.home}/Documents/kernel-test-${n}.nexustest`;
    await ctx.fs.writeFile(path, `Item ${n}`);
    await items.create({ title: t('itemTitle', { n }), path, created: Date.now() });
    await ctx.achievements.unlock('first-item');
    ctx.notify({ title: t('saved', { path }), transient: true, timeoutMs: 2000 });
  });
  on('notify', () => ctx.notify({ title: t('title'), body: t('items', { count: ticks }) }));
  on('crash', () => {
    throw new Error('Deliberate crash from the kernel test app');
  });
  on('crash-async', async () => {
    await Promise.resolve();
    throw new Error('Deliberate async crash from the kernel test app');
  });

  ctx.storage.collection('items').onChange(() => render());
  ctx.i18n.onChange(() => render());
  ctx.settings.onChange('greeting', () => render());
  await render();
  return {};
}

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'devtest.ping': async (ctx) => {
    await ctx.notify({ title: 'pong' });
    return 'pong';
  },
};
