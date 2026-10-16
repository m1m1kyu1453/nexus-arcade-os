// System Monitor: what Nexus is doing right now. Processes (windows with CPU time and size,
// End task), Performance (FPS, frame time, memory, elements, loops, workers), Storage, Log and
// Network. Sampling runs through ctx.timers, so it pauses while the window is hidden.
// Nothing runs at import time.
import { h, icon } from '../../ui/dom.js';
import { createChart } from './chart.js';
import './styles.css';

const TABS = /** @type {const} */ (['processes', 'performance', 'storage', 'log', 'network']);
const LEVELS = /** @type {const} */ (['debug', 'info', 'warn', 'error']);

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'monitor.open': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.monitor' }),
};

/** @type {import('../../kernel/types').AppModule['mount']} */
export function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const system = /** @type {NonNullable<typeof ctx.system>} */ (ctx.system);
  const saved = /** @type {{ tab?: string } | undefined} */ (args.restoredState);
  /** @type {(typeof TABS)[number]} */
  let tab = /** @type {any} */ (TABS.includes(/** @type {any} */ (saved?.tab)) ? saved?.tab : 'processes');
  const num = (/** @type {number} */ n, /** @type {Intl.NumberFormatOptions} */ o) => ctx.i18n.number(n, o);

  const tabList = h('div', { class: 'nx-mon-tabs', role: 'tablist', 'aria-label': t('title') });
  const panel = h('div', { class: 'nx-mon-panel', role: 'tabpanel', tabindex: '0' });
  const root = h('div', { class: 'nx-mon', dataset: { testid: 'monitor' } }, tabList, panel);
  container.replaceChildren(root);

  // ─── Sampling (shared by Processes and Performance) ──────────────────────
  /** @type {Map<string, number>} window id → busy ms at the previous sample */
  let lastBusy = new Map();
  /** @type {Map<string, number>} window id → % of one second spent in its code */
  let cpu = new Map();
  let frames = 0;
  let worstFrame = 0;
  let frameSum = 0;
  let fps = 0;
  let avgFrame = 0;
  const fpsChart = createChart({
    label: t('perf.fps'),
    max: 60,
    color: () => ctx.theme.token('accent') || '#3ef0ff',
    format: (v) => num(Math.round(v)),
  });
  const frameChart = createChart({
    label: t('perf.frameTime'),
    max: 33,
    color: () => ctx.theme.token('accent-2') || '#b36bff',
    format: (v) => `${num(v, { maximumFractionDigits: 1 })} ms`,
  });
  const heapChart = createChart({
    label: t('perf.heap'),
    color: () => ctx.theme.token('success') || '#3ddc97',
    format: (v) => ctx.i18n.bytes(v),
  });

  ctx.timers.loop((dt) => {
    if (!dt) return;
    frames++;
    frameSum += dt;
    worstFrame = Math.max(worstFrame, dt);
  });
  ctx.timers.setInterval(() => {
    fps = frames;
    avgFrame = frames ? frameSum / frames : 0;
    fpsChart.push(fps);
    frameChart.push(worstFrame);
    const heap = system.performance.heap();
    if (heap) heapChart.push(heap.used);
    const windows = system.windows.list();
    const next = new Map();
    cpu = new Map();
    for (const w of windows) {
      const prev = lastBusy.get(w.id);
      next.set(w.id, w.busyMs);
      if (prev !== undefined) cpu.set(w.id, Math.min(100, (w.busyMs - prev) / 10));
    }
    lastBusy = next;
    frames = 0;
    frameSum = 0;
    worstFrame = 0;
    if (tab === 'processes' || tab === 'performance') render();
  }, 1000);

  // ─── Tabs ──────────────────────────────────────────────────────────────
  function renderTabs() {
    tabList.replaceChildren(
      ...TABS.map((id) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            id: `nx-mon-tab-${id}`,
            class: 'nx-mon-tab',
            'aria-selected': String(id === tab),
            tabindex: id === tab ? '0' : '-1',
            dataset: { tab: id, testid: 'monitor-tab' },
            onclick: () => select(id),
          },
          icon(
            { processes: 'apps', performance: 'activity', storage: 'hard-drive', log: 'file-text', network: 'globe' }[
              id
            ],
            { size: 16 },
          ),
          t(`tabs.${id}`),
        ),
      ),
    );
    panel.setAttribute('aria-labelledby', `nx-mon-tab-${tab}`);
  }
  tabList.addEventListener('keydown', (e) => {
    const i = TABS.indexOf(tab);
    const next =
      e.key === 'ArrowRight'
        ? i + 1
        : e.key === 'ArrowLeft'
          ? i - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    select(TABS[(next + TABS.length) % TABS.length] ?? 'processes');
    /** @type {HTMLElement | null} */ (tabList.querySelector(`[data-tab="${tab}"]`))?.focus();
  });

  /** @param {(typeof TABS)[number]} id */
  function select(id) {
    tab = id;
    renderTabs();
    render();
    ctx.window?.stateChanged();
  }

  function render() {
    // Keep keyboard focus on the same button across live refreshes.
    const focusKey = /** @type {HTMLElement | null} */ (document.activeElement)?.dataset?.key;
    if (tab === 'processes') panel.replaceChildren(processes());
    else if (tab === 'performance') panel.replaceChildren(performance());
    else if (tab === 'storage') void storage().then((el) => tab === 'storage' && panel.replaceChildren(el));
    else if (tab === 'log') renderLog();
    else panel.replaceChildren(network());
    if (focusKey) /** @type {HTMLElement | null} */ (panel.querySelector(`[data-key="${focusKey}"]`))?.focus();
  }

  // ─── Processes ─────────────────────────────────────────────────────────
  function processes() {
    const windows = system.windows.list().sort((a, b) => (cpu.get(b.id) ?? 0) - (cpu.get(a.id) ?? 0));
    if (!windows.length) return h('p', { class: 'nx-empty', text: t('proc.none') });
    const totalNodes = system.performance.domNodes();
    return h(
      'div',
      { class: 'nx-mon-scroll' },
      h(
        'table',
        { class: 'nx-mon-table', dataset: { testid: 'process-table' } },
        h('caption', { class: 'nx-visually-hidden', text: t('tabs.processes') }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            ...['window', 'app', 'state', 'cpu', 'elements', 'timers', 'uptime', ''].map((c) =>
              h('th', { scope: 'col', text: c ? t(`proc.${c}`) : '' }),
            ),
          ),
        ),
        h(
          'tbody',
          {},
          ...windows.map((w) => {
            const nodes = system.performance.windowNodes(w.id);
            const state =
              w.state === 'running'
                ? w.suspended
                  ? t('proc.suspended')
                  : t('proc.running')
                : t(`proc.states.${w.state}`);
            return h(
              'tr',
              { dataset: { window: w.id }, class: w.focused ? 'is-focused' : '' },
              h(
                'td',
                {},
                h('button', {
                  type: 'button',
                  class: 'nx-mon-link',
                  text: w.title,
                  title: t('proc.focus'),
                  dataset: { key: `focus-${w.id}` },
                  onclick: () => system.windows.focus(w.id),
                }),
              ),
              h('td', { text: w.appName }),
              h('td', { text: state }),
              h('td', {
                class: 'is-num',
                text: cpu.has(w.id) ? `${num(cpu.get(w.id) ?? 0, { maximumFractionDigits: 1 })} %` : '…',
              }),
              h('td', {
                class: 'is-num',
                text:
                  nodes === null
                    ? '—'
                    : `${num(nodes)} (${num(nodes / Math.max(1, totalNodes), { style: 'percent' })})`,
              }),
              h('td', { class: 'is-num', text: num(w.activeTimers) }),
              h('td', { class: 'is-num', text: duration(Date.now() - w.launchedAt) }),
              h(
                'td',
                {},
                h('button', {
                  type: 'button',
                  class: 'nx-btn is-danger nx-mon-kill',
                  text: t('proc.end'),
                  dataset: { key: `kill-${w.id}`, testid: 'end-task' },
                  'aria-label': t('proc.endLabel', { name: w.title }),
                  onclick: async () => {
                    await system.windows.kill(w.id);
                    render();
                  },
                }),
              ),
            );
          }),
        ),
      ),
      h('p', { class: 'nx-mon-note', text: t('proc.note') }),
    );
  }

  /** "1 h 5 min" / "42 s". @param {number} ms */
  function duration(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return t('time.seconds', { count: s });
    const m = Math.floor(s / 60);
    if (m < 60) return t('time.minutes', { count: m });
    return t('time.hours', { hours: Math.floor(m / 60), minutes: m % 60 });
  }

  // ─── Performance ───────────────────────────────────────────────────────
  function performance() {
    const heap = system.performance.heap();
    const windows = system.windows.list();
    const loops = windows.reduce((n, w) => n + (w.loops ?? 0), 0);
    const timers = windows.reduce((n, w) => n + w.activeTimers, 0);
    const workers = system.performance.workers();
    const stat = (/** @type {string} */ key, /** @type {string} */ value, /** @type {string} */ testid) =>
      h(
        'div',
        { class: 'nx-mon-stat', dataset: { testid } },
        h('span', { class: 'nx-mon-stat-label', text: t(key) }),
        h('strong', { text: value }),
      );
    const card = (/** @type {string} */ key, /** @type {Node} */ chart, /** @type {string} */ value) =>
      h(
        'section',
        { class: 'nx-mon-card' },
        h('header', {}, h('h3', { text: t(key) }), h('span', { text: value })),
        chart,
      );
    const view = h(
      'div',
      { class: 'nx-mon-perf' },
      h(
        'div',
        { class: 'nx-mon-stats' },
        stat('perf.fps', num(fps), 'stat-fps'),
        stat('perf.frameAvg', `${num(avgFrame, { maximumFractionDigits: 1 })} ms`, 'stat-frame'),
        stat('perf.elements', num(system.performance.domNodes()), 'stat-elements'),
        stat('perf.loops', num(loops), 'stat-loops'),
        stat('perf.timers', num(timers), 'stat-timers'),
        stat('perf.workers', num(workers.length), 'stat-workers'),
      ),
      h(
        'div',
        { class: 'nx-mon-charts' },
        card('perf.fps', fpsChart.el, num(fps)),
        card('perf.frameWorst', frameChart.el, ''),
        heap
          ? card(
              'perf.heap',
              heapChart.el,
              t('perf.heapValue', { used: ctx.i18n.bytes(heap.used), limit: ctx.i18n.bytes(heap.limit) }),
            )
          : h(
              'section',
              { class: 'nx-mon-card' },
              h('header', {}, h('h3', { text: t('perf.heap') })),
              h('p', { class: 'nx-mon-note', text: t('perf.noHeap') }),
            ),
      ),
      h(
        'section',
        { class: 'nx-mon-card' },
        h('header', {}, h('h3', { text: t('perf.workerList') })),
        workers.length
          ? h(
              'ul',
              { class: 'nx-mon-list' },
              ...workers.map((wk) =>
                h(
                  'li',
                  {},
                  h('span', { text: wk.name }),
                  h('span', { class: 'nx-mon-note', text: duration(Date.now() - wk.startedAt) }),
                ),
              ),
            )
          : h('p', { class: 'nx-mon-note', text: t('perf.noWorkers') }),
        h('p', { class: 'nx-mon-note', text: t('perf.workerNote') }),
      ),
    );
    requestAnimationFrame(() => {
      fpsChart.redraw();
      frameChart.redraw();
      heapChart.redraw();
    });
    return view;
  }

  // ─── Storage ───────────────────────────────────────────────────────────
  async function storage() {
    const [usage, estimate] = await Promise.all([system.storage.usage(), system.storage.estimate()]);
    const rows = [
      ...usage.apps.map((a) => ({ name: system.apps.name(a.id), bytes: a.bytes })),
      { name: t('storage.files'), bytes: usage.folders.reduce((s, f) => s + f.bytes, 0) },
      { name: t('storage.system'), bytes: usage.system },
    ].sort((a, b) => b.bytes - a.bytes);
    const top = Math.max(1, ...rows.map((r) => r.bytes));
    return h(
      'div',
      { class: 'nx-mon-scroll' },
      estimate
        ? h('p', {
            text: t('storage.total', { used: ctx.i18n.bytes(estimate.usage), quota: ctx.i18n.bytes(estimate.quota) }),
          })
        : null,
      h(
        'ul',
        { class: 'nx-mon-bars', dataset: { testid: 'storage-bars' } },
        ...rows.map((r) =>
          h(
            'li',
            {},
            h('span', { class: 'nx-mon-bar-label', text: r.name }),
            h(
              'span',
              { class: 'nx-mon-bar' },
              h('span', { style: { width: `${Math.max(1, (r.bytes / top) * 100)}%` } }),
            ),
            h('span', { class: 'nx-mon-bar-value', text: ctx.i18n.bytes(r.bytes) }),
          ),
        ),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'nx-btn',
          onclick: () => void ctx.commands.execute('settings.open', { page: 'storage' }).catch(() => {}),
        },
        t('storage.manage'),
      ),
    );
  }

  // ─── Log ───────────────────────────────────────────────────────────────
  const logFilter = { level: /** @type {(typeof LEVELS)[number]} */ ('info'), source: '', text: '' };
  const levelSelect = h(
    'select',
    { class: 'nx-select', 'aria-label': t('log.level') },
    ...LEVELS.map((l) => h('option', { value: l, text: t(`log.levels.${l}`) })),
  );
  levelSelect.value = logFilter.level;
  const sourceInput = h('input', {
    class: 'nx-input',
    type: 'search',
    placeholder: t('log.source'),
    'aria-label': t('log.source'),
  });
  const textInput = h('input', {
    class: 'nx-input',
    type: 'search',
    placeholder: t('log.search'),
    'aria-label': t('log.search'),
  });
  const logList = h('ol', { class: 'nx-mon-log', 'aria-live': 'off', dataset: { testid: 'log-list' } });
  const logView = h(
    'div',
    { class: 'nx-mon-logview' },
    h(
      'div',
      { class: 'nx-mon-toolbar' },
      levelSelect,
      sourceInput,
      textInput,
      h('button', {
        type: 'button',
        class: 'nx-btn',
        text: t('log.export'),
        dataset: { testid: 'log-export' },
        onclick: () => system.log.download({ minLevel: logFilter.level, source: logFilter.source || undefined }),
      }),
    ),
    logList,
  );
  const onFilter = () => {
    logFilter.level = /** @type {any} */ (levelSelect.value);
    logFilter.source = sourceInput.value.trim();
    logFilter.text = textInput.value.trim().toLowerCase();
    renderLog();
  };
  levelSelect.addEventListener('change', onFilter);
  sourceInput.addEventListener('input', onFilter);
  textInput.addEventListener('input', onFilter);

  /** @param {{ t: number, level: string, source: string, message: string, data?: unknown }} e */
  const logRow = (e) =>
    h(
      'li',
      { class: `nx-mon-entry is-${e.level}` },
      h('time', { text: new Date(e.t).toLocaleTimeString(ctx.i18n.locale, { hour12: false }) }),
      h('span', { class: 'nx-mon-level', text: e.level }),
      h('span', { class: 'nx-mon-source', text: e.source }),
      h('span', {
        class: 'nx-mon-message',
        text:
          e.data === undefined
            ? e.message
            : `${e.message} ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}`,
      }),
    );
  const matches = (/** @type {{ level: string, source: string, message: string }} */ e) =>
    LEVELS.indexOf(/** @type {any} */ (e.level)) >= LEVELS.indexOf(logFilter.level) &&
    (!logFilter.source || e.source.includes(logFilter.source)) &&
    (!logFilter.text || e.message.toLowerCase().includes(logFilter.text));

  function renderLog() {
    const entries = system.log.entries().filter(matches).slice(-500);
    logList.replaceChildren(
      ...(entries.length ? entries.map(logRow) : [h('li', { class: 'nx-empty', text: t('log.empty') })]),
    );
    if (panel.firstChild !== logView) panel.replaceChildren(logView);
    logList.scrollTop = logList.scrollHeight;
  }
  system.log.subscribe((entry) => {
    if (tab !== 'log' || !matches(entry)) return;
    logList.querySelector('.nx-empty')?.remove();
    const nearBottom = logList.scrollHeight - logList.scrollTop - logList.clientHeight < 40;
    logList.append(logRow(entry));
    while (logList.childElementCount > 500) logList.firstElementChild?.remove();
    if (nearBottom) logList.scrollTop = logList.scrollHeight;
  });

  // ─── Network ───────────────────────────────────────────────────────────
  function network() {
    const records = system.network.list();
    return h(
      'div',
      { class: 'nx-mon-scroll' },
      h(
        'p',
        {
          class: `nx-mon-online ${system.network.online ? 'is-online' : 'is-offline'}`,
          dataset: { testid: 'network-state' },
        },
        icon(system.network.online ? 'online' : 'offline', { size: 18 }),
        t(system.network.online ? 'net.online' : 'net.offline'),
      ),
      h('p', { class: 'nx-mon-note', text: t('net.explain') }),
      records.length
        ? h(
            'table',
            { class: 'nx-mon-table' },
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                ...['time', 'app', 'method', 'url', 'status', 'duration'].map((c) =>
                  h('th', { scope: 'col', text: t(`net.${c}`) }),
                ),
              ),
            ),
            h(
              'tbody',
              {},
              ...records.map((r) =>
                h(
                  'tr',
                  { class: r.error ? 'is-error' : '' },
                  h('td', { text: new Date(r.at).toLocaleTimeString(ctx.i18n.locale) }),
                  h('td', { text: system.apps.name(r.app) }),
                  h('td', { text: r.method }),
                  h('td', { class: 'is-url', text: r.url, title: r.url }),
                  h('td', { text: r.error ?? (r.status === null ? t('net.pending') : String(r.status)) }),
                  h('td', { class: 'is-num', text: r.ms === null ? '…' : `${num(r.ms)} ms` }),
                ),
              ),
            ),
          )
        : h('p', { class: 'nx-empty', text: t('net.none') }),
      records.length
        ? h('button', { type: 'button', class: 'nx-btn', text: t('net.clear'), onclick: () => system.network.clear() })
        : null,
    );
  }
  system.network.onChange(() => tab === 'network' && render());
  addEventListener('online', () => tab === 'network' && render(), { signal: ctx.signal });
  addEventListener('offline', () => tab === 'network' && render(), { signal: ctx.signal });

  ctx.i18n.onChange(() => {
    tabList.setAttribute('aria-label', t('title'));
    renderTabs();
    render();
  });
  ctx.window?.onResize(() => {
    fpsChart.redraw();
    frameChart.redraw();
    heapChart.redraw();
  });

  renderTabs();
  render();
  return {
    saveState: () => ({ tab }),
    onResume: () => render(),
  };
}
