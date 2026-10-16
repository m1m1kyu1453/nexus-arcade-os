// @ts-check
// One terminal tab: the screen (scrollback with ANSI colours), the prompt and input line,
// history (↑/↓, Ctrl+R), Tab completion, Ctrl+C/Ctrl+L, multi-line paste and the `less` pager.
import { h } from '../../ui/dom.js';
import { tildePath } from '../../ui/paths.js';
import { parseAnsi, plainStyle, runNode } from './ansi.js';
import { builtins } from './commands/index.js';
import { columns, ansi } from './commands/util.js';
import { complete, expandHistory, searchHistory } from './input.js';
import { Shell } from './shell/shell.js';

const SCROLLBACK = 5000;

/**
 * @typedef {object} SessionHost
 * @property {import('../../kernel/types').AppContext} ctx
 * @property {() => string[]} history              shared across tabs, oldest first
 * @property {(line: string) => void} remember
 * @property {() => void} clearHistory
 * @property {Record<string, string>} aliases       shared across tabs
 * @property {() => void} saveAliases
 * @property {() => void} onTitle                   cwd changed (tab title)
 * @property {() => void} closeTab
 * @property {() => void} stateChanged
 */

/**
 * @param {SessionHost} host
 * @param {{ cwd?: string }} [options]
 */
export function createSession(host, { cwd } = {}) {
  const { ctx } = host;
  const t = (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars) => ctx.i18n.t(key, vars);
  const fs = /** @type {any} */ (ctx.fs);
  const home = /** @type {string} */ (fs.home);
  const user = home.split('/').pop() ?? 'user';

  const output = h('div', { class: 'nx-term-output', dataset: { testid: 'term-output' } });
  const promptEl = h('span', { class: 'nx-term-prompt' });
  const input = h('input', {
    class: 'nx-term-input',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-label': t('input'),
    dataset: { testid: 'term-input' },
  });
  const inputLine = h('div', { class: 'nx-term-line is-input' }, promptEl, input);
  const screen = h('div', { class: 'nx-term-screen', role: 'log', 'aria-live': 'polite' }, output, inputLine);
  const el = h('div', { class: 'nx-term-session' }, screen);

  let style = plainStyle();
  /** @type {HTMLElement} */
  let line = newLine();
  /** @type {AbortController | null} */
  let running = null;
  let historyIndex = -1;
  let draft = '';
  /** @type {{ query: string, index: number } | null} */
  let search = null;
  let lastTab = { line: '', at: 0 };

  const shell = new Shell({
    fs,
    home,
    user,
    cwd: cwd ?? home,
    builtins,
    t,
    os: ctx,
    external: (name) => {
      const decl = ctx.system?.apps.terminalCommands().find((c) => c.name === name);
      if (!decl) return null;
      return (io) =>
        /** @type {NonNullable<typeof ctx.system>} */ (ctx.system).apps.runTerminal(decl.app, name, {
          args: io.args,
          stdin: io.stdin,
          cwd: io.shell.cwd,
          env: { ...io.shell.env },
          out: io.out,
          err: io.err,
          signal: io.signal,
        });
    },
    ui: {
      clear,
      columns: () => cols(),
      pager: (/** @type {string} */ text, /** @type {string} */ title, /** @type {AbortSignal} */ signal) =>
        pager(text, title, signal),
      history: host.history,
      clearHistory: host.clearHistory,
      saveAliases: host.saveAliases,
      closeTab: host.closeTab,
    },
  });
  shell.aliases = host.aliases;

  // ─── Output ────────────────────────────────────────────────────────────
  function newLine() {
    const div = h('div', { class: 'nx-term-line' });
    output.append(div);
    while (output.childElementCount > SCROLLBACK) output.firstElementChild?.remove();
    return div;
  }

  /** Writes text (with ANSI codes) to the screen. @param {string} text @param {string} [extraClass] */
  function write(text, extraClass) {
    const parsed = parseAnsi(text.replace(/\r\n?/g, '\n'), style);
    style = parsed.style;
    for (const run of parsed.runs) {
      const parts = run.text.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) line = newLine();
        if (!part) return;
        const node = runNode({ text: part, style: run.style });
        if (extraClass) {
          const span = h('span', { class: extraClass });
          span.append(node);
          line.append(span);
        } else line.append(node);
      });
    }
    scrollDown();
  }
  const scrollDown = () => requestAnimationFrame(() => (screen.scrollTop = screen.scrollHeight));
  /** Ends the current line unless it is empty (so the prompt starts on a fresh line). */
  const freshLine = () => {
    if (line.childNodes.length) line = newLine();
  };

  function clear() {
    output.replaceChildren();
    line = newLine();
    style = plainStyle();
  }

  /** Characters per line, for `ls` columns. */
  function cols() {
    const probe = h('span', { class: 'nx-term-probe', text: 'M'.repeat(10) });
    output.append(probe);
    const w = probe.getBoundingClientRect().width / 10 || 8;
    probe.remove();
    return Math.max(20, Math.floor((screen.clientWidth - 16) / w));
  }

  function renderPrompt() {
    promptEl.replaceChildren();
    if (search) {
      const match = search.index >= 0 ? (host.history()[search.index] ?? '') : '';
      promptEl.append(t(search.index < 0 && search.query ? 'searchFailed' : 'search', { query: search.query }));
      input.value = match;
      return;
    }
    for (const run of parseAnsi(promptText()).runs) promptEl.append(runNode(run));
  }
  const promptText = () =>
    `${ansi.bold(ansi.green(`${user}@nexus`))}:${ansi.bold(ansi.blue(tildePath(shell.cwd, home)))}${shell.status ? ansi.red(` [${shell.status}]`) : ''}$ `;

  // ─── Running commands ──────────────────────────────────────────────────
  /** Runs one line as if typed. @param {string} raw */
  async function submit(raw) {
    freshLine();
    write(`${promptText()}${raw}\n`, 'nx-term-echo');
    input.value = '';
    historyIndex = -1;
    draft = '';
    let lineToRun;
    try {
      lineToRun = expandHistory(raw, host.history());
    } catch (error) {
      write(`${ansi.red(/** @type {Error} */ (error).message)}\n`);
      return;
    }
    if (lineToRun !== raw) write(`${ansi.dim(lineToRun)}\n`);
    if (!lineToRun.trim()) return;
    host.remember(lineToRun);
    running = new AbortController();
    inputLine.hidden = true;
    // Keep keyboard focus in the window so Ctrl+C reaches the screen while the command runs.
    screen.focus({ preventScroll: true });
    const before = shell.cwd;
    try {
      await shell.run(lineToRun, {
        out: (text) => write(text),
        err: (text) => write(text, 'nx-term-err'),
        signal: running.signal,
      });
    } catch (error) {
      write(`${ansi.red(String(/** @type {Error} */ (error)?.message ?? error))}\n`);
    }
    running = null;
    style = plainStyle();
    freshLine();
    inputLine.hidden = false;
    renderPrompt();
    if (shell.cwd !== before) {
      host.onTitle();
      host.stateChanged();
    }
    focus();
    scrollDown();
  }

  function interrupt() {
    if (running) {
      running.abort();
      write('^C\n');
      return;
    }
    freshLine();
    write(`${promptText()}${input.value}^C\n`, 'nx-term-echo');
    input.value = '';
    search = null;
    renderPrompt();
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────
  input.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // Let window-level combinations (Alt+…, Ctrl+Shift+…) reach the app and the shell.
    if (e.altKey) return;
    if (mod && key === 'c' && !e.shiftKey) {
      if (hasSelection()) return; // copy as usual
      e.preventDefault();
      return interrupt();
    }
    if (mod && e.shiftKey && key === 'c') {
      e.preventDefault();
      const text = getSelection()?.toString();
      if (text) void ctx.clipboard.writeText(text).catch(() => {});
      return;
    }
    // Ctrl+L, Ctrl+R and Ctrl+W are window shortcuts (index.js), so they win over the system's.
    if (search) {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key.startsWith('Arrow') || (mod && key === 'g')) {
        const accepted = e.key !== 'Escape' && !(mod && key === 'g') ? input.value : '';
        search = null;
        renderPrompt();
        input.value = accepted;
        if (e.key === 'Enter') {
          e.preventDefault();
          void submit(accepted);
        } else if (e.key === 'Escape') e.preventDefault();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        search.query = search.query.slice(0, -1);
      } else if (e.key.length === 1 && !mod) {
        e.preventDefault();
        search.query += e.key;
      } else return;
      search.index = searchHistory(host.history(), search.query);
      renderPrompt();
      return;
    }
    if (running) {
      if (!mod) e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit(input.value);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      browseHistory(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      void tabComplete();
    } else if (mod && key === 'u') {
      e.preventDefault();
      const at = input.selectionStart ?? 0;
      input.value = input.value.slice(at);
      input.setSelectionRange(0, 0);
    } else if (mod && key === 'a' && !e.shiftKey) {
      e.preventDefault();
      input.setSelectionRange(0, 0);
    } else if (mod && key === 'e') {
      e.preventDefault();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });

  /** Ctrl+R: start a reverse search, or find the next older match. */
  function reverseSearch() {
    if (running) return;
    if (!search) search = { query: '', index: -1 };
    else if (search.query)
      search.index = searchHistory(host.history(), search.query, search.index < 0 ? undefined : search.index);
    renderPrompt();
    input.focus();
  }

  /** Ctrl+W: delete the word before the cursor. */
  function deleteWord() {
    if (running || search) return;
    const at = input.selectionStart ?? 0;
    const head = input.value.slice(0, at).replace(/\S+\s*$/, '');
    input.value = head + input.value.slice(at);
    input.setSelectionRange(head.length, head.length);
  }

  /** @param {number} dir -1 older, +1 newer */
  function browseHistory(dir) {
    const list = host.history();
    if (!list.length) return;
    if (historyIndex === -1) {
      if (dir > 0) return;
      draft = input.value;
      historyIndex = list.length - 1;
    } else {
      historyIndex += dir;
      if (historyIndex >= list.length) {
        historyIndex = -1;
        input.value = draft;
        return;
      }
      historyIndex = Math.max(0, historyIndex);
    }
    input.value = list[historyIndex] ?? '';
    input.setSelectionRange(input.value.length, input.value.length);
  }

  async function tabComplete() {
    const cursor = input.selectionStart ?? input.value.length;
    const value = input.value;
    const result = await complete(value, cursor, {
      commands: [
        ...Object.keys(builtins),
        ...Object.keys(shell.aliases),
        ...(ctx.system?.apps.terminalCommands().map((c) => c.name) ?? []),
      ],
      apps: ctx.system?.apps.list().map((a) => a.id) ?? [],
      kindOf: (name) => builtins[name]?.complete ?? (name in shell.aliases ? 'path' : undefined),
      list: (p) => fs.list(p),
      cwd: shell.cwd,
      home,
    });
    if (input.value !== value) return; // typed on meanwhile
    const typed = value.slice(result.start, cursor);
    if (result.insert !== typed) {
      input.value = value.slice(0, result.start) + result.insert + value.slice(cursor);
      const at = result.start + result.insert.length;
      input.setSelectionRange(at, at);
      lastTab = { line: '', at: 0 };
      return;
    }
    // Second Tab without progress: list the candidates.
    const now = Date.now();
    if (result.candidates.length > 1 && lastTab.line === value && now - lastTab.at < 1500) {
      freshLine();
      write(`${promptText()}${value}\n`, 'nx-term-echo');
      write(columns(result.candidates, cols()));
      lastTab = { line: '', at: 0 };
    } else lastTab = { line: value, at: now };
  }

  // Multi-line paste runs each line.
  input.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!text.includes('\n') || running) return;
    e.preventDefault();
    const pasted = text.replace(/\r\n?/g, '\n').split('\n');
    const lastLine = pasted.pop() ?? '';
    void (async () => {
      const head = input.value;
      for (const [i, l] of pasted.entries()) await submit(i === 0 ? head + l : l);
      input.value = lastLine;
    })();
  });

  const hasSelection = () => {
    const sel = getSelection();
    return !!sel && !sel.isCollapsed && screen.contains(sel.anchorNode);
  };
  // Clicking the screen focuses the input, unless the user is selecting text.
  screen.addEventListener('mouseup', () => {
    if (!hasSelection()) focus();
  });
  const focus = () => {
    if (!inputLine.hidden) input.focus({ preventScroll: true });
    else screen.focus({ preventScroll: true });
  };
  screen.tabIndex = -1;
  screen.addEventListener('keydown', (e) => {
    // While a command runs the input is hidden; Ctrl+C still interrupts.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && running && !hasSelection()) {
      e.preventDefault();
      interrupt();
    }
  });

  // ─── Pager (less) ──────────────────────────────────────────────────────
  /**
   * @param {string} text
   * @param {string} title
   * @param {AbortSignal} signal
   */
  function pager(text, title, signal) {
    return new Promise((resolve) => {
      const lines = text.replace(/\n$/, '').split('\n');
      const body = h('div', {
        class: 'nx-term-pager-body',
        tabindex: '0',
        role: 'document',
        'aria-label': title || t('pager'),
      });
      const status = h('div', { class: 'nx-term-pager-status' });
      const view = h('div', { class: 'nx-term-pager', dataset: { testid: 'term-pager' } }, body, status);
      let s = plainStyle();
      for (const l of lines) {
        const div = h('div', { class: 'nx-term-line' });
        const parsed = parseAnsi(l, s);
        s = parsed.style;
        for (const run of parsed.runs) div.append(runNode(run));
        body.append(div);
      }
      const lineHeight = () => /** @type {HTMLElement} */ (body.firstElementChild)?.offsetHeight || 18;
      const update = () => {
        const first = Math.floor(body.scrollTop / lineHeight()) + 1;
        const last = Math.min(lines.length, Math.floor((body.scrollTop + body.clientHeight) / lineHeight()));
        const end = body.scrollTop + body.clientHeight >= body.scrollHeight - 2;
        status.textContent = `${title ? `${title} · ` : ''}${t('pagerStatus', { first, last, total: lines.length })}${end ? ` ${t('pagerEnd')}` : ''}`;
      };
      const close = () => {
        view.remove();
        resolve(undefined);
      };
      body.addEventListener('scroll', update);
      body.addEventListener('keydown', (e) => {
        const page = body.clientHeight - lineHeight();
        const k = e.key;
        if (k === 'q' || k === 'Q' || k === 'Escape') close();
        else if (k === ' ' || k === 'PageDown' || k === 'f') body.scrollTop += page;
        else if (k === 'b' || k === 'PageUp') body.scrollTop -= page;
        else if (k === 'j' || k === 'ArrowDown' || k === 'Enter') body.scrollTop += lineHeight();
        else if (k === 'k' || k === 'ArrowUp') body.scrollTop -= lineHeight();
        else if (k === 'g' || k === 'Home') body.scrollTop = 0;
        else if (k === 'G' || k === 'End') body.scrollTop = body.scrollHeight;
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
      signal.addEventListener('abort', close, { once: true });
      el.append(view);
      body.focus();
      requestAnimationFrame(update);
    });
  }

  renderPrompt();

  return {
    el,
    shell,
    focus,
    write,
    /** Tab title: the current folder. */
    title: () => (shell.cwd === home ? '~' : shell.cwd.split('/').pop() || '/'),
    get cwd() {
      return shell.cwd;
    },
    /** Runs a line (scripts, ~/.nexusrc). @param {string} line */
    run: submit,
    dispose() {
      running?.abort();
    },
    refreshPrompt: renderPrompt,
    clear,
    reverseSearch,
    deleteWord,
  };
}
