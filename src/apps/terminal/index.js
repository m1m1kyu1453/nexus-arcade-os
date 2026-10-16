// Terminal: tabs of Nexus shell sessions with a shared, persistent history and aliases.
// Nothing runs at import time.
import { h, icon, iconButton } from '../../ui/dom.js';
import { createSession } from './session.js';
import './styles.css';

const HISTORY_LIMIT = 1000;
const DEFAULT_ALIASES = { ll: 'ls -la', la: 'ls -a', '..': 'cd ..' };

/** @type {import('../../kernel/types').AppModule['commands']} */
export const commands = {
  'terminal.open': (ctx) => ctx.commands.execute('shell.launchApp', { appId: 'nexus.terminal' }),
};

/** @type {import('../../kernel/types').AppModule['mount']} */
export async function mount(container, ctx, args) {
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const saved = /** @type {{ tabs?: { cwd: string }[], active?: number } | undefined} */ (args.restoredState);
  /** @type {string[]} */
  let history = /** @type {string[]} */ ((await ctx.storage.kv.get('history')) ?? []);
  /** @type {Record<string, string>} */
  const aliases = /** @type {Record<string, string>} */ (
    (await ctx.storage.kv.get('aliases')) ?? { ...DEFAULT_ALIASES }
  );

  let saveTimer = 0;
  const saveHistory = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void ctx.storage.kv.set('history', history), 400);
  };

  const tabBar = h('div', { class: 'nx-term-tabs', role: 'tablist', 'aria-label': t('tabs') });
  const addBtn = iconButton({ icon: 'plus', label: t('newTab'), onClick: () => addTab() });
  const sessionsEl = h('div', { class: 'nx-term-sessions' });
  const root = h(
    'div',
    { class: 'nx-term', dataset: { testid: 'terminal' } },
    h('div', { class: 'nx-term-bar' }, tabBar, addBtn),
    sessionsEl,
  );
  container.replaceChildren(root);

  /** @type {ReturnType<typeof createSession>[]} */
  const sessions = [];
  let active = 0;

  /** @param {string} [cwd] */
  function addTab(cwd) {
    // A new tab starts where the current one is.
    const start = cwd ?? sessions[active]?.cwd;
    /** @type {ReturnType<typeof createSession>} */
    const session = createSession(
      {
        ctx,
        history: () => history,
        remember(line) {
          if (history.at(-1) !== line) history = [...history, line].slice(-HISTORY_LIMIT);
          saveHistory();
        },
        clearHistory() {
          history = [];
          saveHistory();
        },
        aliases,
        saveAliases: () => void ctx.storage.kv.set('aliases', { ...aliases }),
        onTitle: renderTabs,
        closeTab: () => closeTab(sessions.indexOf(session)),
        stateChanged: () => ctx.window?.stateChanged(),
      },
      { cwd: start },
    );
    sessions.push(session);
    sessionsEl.append(session.el);
    select(sessions.length - 1);
    if (sessions.length === 1 && !saved) session.write(`${t('welcome')}\n\n`);
    ctx.window?.stateChanged();
    return session;
  }

  /** @param {number} index */
  function closeTab(index) {
    const [session] = sessions.splice(index, 1);
    if (!session) return;
    session.dispose();
    session.el.remove();
    if (!sessions.length) {
      void ctx.window?.close();
      return;
    }
    select(Math.min(active, sessions.length - 1));
    ctx.window?.stateChanged();
  }

  /** @param {number} index */
  function select(index) {
    active = Math.max(0, Math.min(index, sessions.length - 1));
    sessions.forEach((s, i) => (s.el.hidden = i !== active));
    renderTabs();
    requestAnimationFrame(() => sessions[active]?.focus());
  }

  function renderTabs() {
    tabBar.replaceChildren(
      ...sessions.map((s, i) =>
        h(
          'div',
          { class: `nx-term-tab${i === active ? ' is-active' : ''}`, role: 'presentation' },
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              'aria-selected': String(i === active),
              class: 'nx-term-tab-label',
              onclick: () => select(i),
              title: s.cwd,
            },
            icon('terminal', { size: 14 }),
            s.title(),
          ),
          sessions.length > 1
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'nx-term-tab-close',
                  'aria-label': t('closeTab', { name: s.title() }),
                  onclick: () => closeTab(i),
                },
                icon('x', { size: 12 }),
              )
            : null,
        ),
      ),
    );
    ctx.window?.setTitle(`${sessions[active]?.title() ?? '~'} — ${t('title')}`);
  }

  // Window shortcuts: they win over system ones (Ctrl+L would lock, Ctrl+W would close).
  const current = () => sessions[active];
  ctx.shortcuts.register('Mod+L', () => current()?.clear(), { allowInInputs: true });
  ctx.shortcuts.register('Mod+R', () => current()?.reverseSearch(), { allowInInputs: true });
  ctx.shortcuts.register('Mod+W', () => current()?.deleteWord(), { allowInInputs: true });
  ctx.shortcuts.register('Alt+T', () => addTab(), { allowInInputs: true });
  for (let n = 1; n <= 9; n++)
    ctx.shortcuts.register(`Alt+${n}`, () => n <= sessions.length && select(n - 1), { allowInInputs: true });

  ctx.i18n.onChange(() => {
    tabBar.setAttribute('aria-label', t('tabs'));
    addBtn.setAttribute('aria-label', t('newTab'));
    addBtn.dataset.tooltip = t('newTab');
    renderTabs();
  });

  const startCwd = /** @type {string | undefined} */ (args.cwd);
  if (saved?.tabs?.length) {
    for (const tab of saved.tabs) addTab(tab.cwd);
    select(saved.active ?? 0);
  } else addTab(startCwd);
  if (saved?.tabs?.length && startCwd) addTab(startCwd);
  await runRc(sessions[active]);

  /** ~/.nexusrc runs once per window if it exists (aliases, variables …). @param {ReturnType<typeof createSession> | undefined} session */
  async function runRc(session) {
    const rc = `${ctx.fs.home}/.nexusrc`;
    const node = await /** @type {any} */ (ctx.fs).stat(rc);
    if (!session || node?.type !== 'file') return;
    const text = /** @type {string} */ (await /** @type {any} */ (ctx.fs).readFile(rc, { as: 'text' }));
    await session.shell.run(text, { out: (s) => session.write(s), err: (s) => session.write(s) });
    session.refreshPrompt();
  }

  return {
    saveState: () => ({ tabs: sessions.map((s) => ({ cwd: s.cwd })), active }),
    onIntent: (intent) => {
      if (intent.path) addTab(String(intent.path).slice(0, String(intent.path).lastIndexOf('/')) || '/');
    },
    unmount() {
      clearTimeout(saveTimer);
      void ctx.storage.kv.set('history', history);
      for (const s of sessions) s.dispose();
    },
  };
}
