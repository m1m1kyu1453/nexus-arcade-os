// @ts-check
// Shell and OS commands: help, man, clear, whoami, uptime, date, cal, env, export, unset, alias,
// unalias, history, open, apps, ps, kill, theme, wallpaper, notify, calc, nexusfetch, sleep,
// which, true, false, exit.
import { evaluate, formatResult } from '../../../ui/calc.js';
import { ShellError } from '../shell/shell.js';
import { quote } from '../shell/parse.js';
import { ansi, padEnd, parseArgs, shortSize, UsageError } from './util.js';

/** @typedef {import('../shell/shell.js').CommandIo} Io */
/** @typedef {import('../shell/shell.js').CommandDef} CommandDef */

/** @param {Io} io @param {string} key @param {Record<string, unknown>} [vars] */
const fail = (io, key, vars) => new ShellError(`${io.name}: ${io.shell.t(`err.${key}`, vars)}`);

/** The OS ctx (the Terminal always has one; tests may leave parts out). @param {Io} io */
const os = (io) => {
  if (!io.shell.os) throw fail(io, 'noOs');
  return io.shell.os;
};

/** @param {Io} io @param {import('../../../kernel/types').L10n | string} text */
const local = (io, text) =>
  typeof text === 'string' ? text : (text[/** @type {'en' | 'de'} */ (io.shell.locale)] ?? text.en);

/** "2 h 5 min" from milliseconds. @param {Io} io @param {number} ms */
function duration(io, ms) {
  const m = Math.floor(ms / 60_000);
  const parts = [];
  if (m >= 1440) parts.push(io.shell.t('out.days', { count: Math.floor(m / 1440) }));
  if (m >= 60) parts.push(io.shell.t('out.hours', { count: Math.floor(m / 60) % 24 }));
  parts.push(io.shell.t('out.minutes', { count: m % 60 }));
  return parts.join(', ');
}

/** Finds an app by id or (localized, case-insensitive) name. @param {Io} io @param {string} query */
function findApp(io, query) {
  const apps = os(io).system.apps.list();
  const q = query.toLowerCase();
  return (
    apps.find((/** @type {any} */ a) => a.id === query) ??
    apps.find((/** @type {any} */ a) => a.id.split('.').pop() === q) ??
    apps.find((/** @type {any} */ a) => local(io, a.name).toLowerCase() === q) ??
    null
  );
}

const LOGO = ['  ███╗   ██╗ ', '  ████╗  ██║ ', '  ██╔██╗ ██║ ', '  ██║╚██╗██║ ', '  ██║ ╚████║ ', '  ╚═╝  ╚═══╝ '];

/** @type {Record<string, CommandDef>} */
export const systemCommands = {
  help: {
    complete: 'command',
    run(io) {
      const t = io.shell.t;
      if (io.args[0]) return systemCommands.man?.run({ ...io, name: 'man' });
      const names = Object.keys(io.shell.builtins).sort();
      const width = Math.max(...names.map((n) => n.length)) + 2;
      io.out(`${ansi.bold(t('out.helpTitle'))}\n\n`);
      for (const name of names) io.out(`  ${ansi.cyan(padEnd(name, width))}${t(`man.${name}.summary`)}\n`);
      const external = io.shell.os?.system?.apps.terminalCommands() ?? [];
      if (external.length) {
        io.out(`\n${ansi.bold(t('out.helpApps'))}\n\n`);
        for (const c of external) io.out(`  ${ansi.cyan(padEnd(c.name, width))}${local(io, c.description)}\n`);
      }
      io.out(`\n${ansi.dim(t('out.helpFooter'))}\n`);
    },
  },

  man: {
    complete: 'command',
    run(io) {
      const t = io.shell.t;
      const name = io.args[0];
      if (!name) throw new UsageError(t('err.manUsage'));
      if (name in io.shell.builtins) {
        io.out(`${ansi.bold(name)} — ${t(`man.${name}.summary`)}\n\n`);
        io.out(`${ansi.bold(t('out.usage'))}\n  ${t(`man.${name}.usage`)}\n`);
        const details = t(`man.${name}.details`);
        if (details !== `man.${name}.details`) io.out(`\n${details}\n`);
        return 0;
      }
      const external = (io.shell.os?.system?.apps.terminalCommands() ?? []).find(
        (/** @type {any} */ c) => c.name === name,
      );
      if (external) {
        io.out(`${ansi.bold(name)} — ${local(io, external.description)}\n`);
        if (external.usage) io.out(`\n${ansi.bold(t('out.usage'))}\n  ${external.usage}\n`);
        io.out(`\n${ansi.dim(t('out.fromApp', { app: io.shell.os.system.apps.name(external.app) }))}\n`);
        return 0;
      }
      if (name in io.shell.aliases) {
        io.out(`${name}: ${t('out.aliasFor', { value: io.shell.aliases[name] })}\n`);
        return 0;
      }
      throw fail(io, 'noManual', { name });
    },
  },

  clear: { complete: 'none', run: (io) => void io.shell.ui.clear?.() },

  whoami: { complete: 'none', run: (io) => io.out(`${io.shell.user}\n`) },

  uptime: {
    complete: 'none',
    run(io) {
      const info = os(io).system.info();
      const windows = os(io).system.windows.list().length;
      io.out(`${io.shell.t('out.uptime', { time: duration(io, Date.now() - info.bootedAt), windows })}\n`);
    },
  },

  date: {
    complete: 'none',
    run(io) {
      const { opts } = parseArgs(io.args, { flags: { u: 'utc', utc: 'utc', I: 'iso', iso: 'iso', R: 'rfc' } });
      const now = new Date();
      if (opts.iso) io.out(`${now.toISOString().slice(0, 10)}\n`);
      else if (opts.rfc) io.out(`${now.toUTCString()}\n`);
      else
        io.out(
          `${new Intl.DateTimeFormat(io.shell.locale, {
            dateStyle: 'full',
            timeStyle: 'long',
            timeZone: opts.utc ? 'UTC' : undefined,
          }).format(now)}\n`,
        );
    },
  },

  cal: {
    complete: 'none',
    run(io) {
      const now = new Date();
      const month = io.args[0] ? Number(io.args[0]) - 1 : now.getMonth();
      const year = io.args[1] ? Number(io.args[1]) : now.getFullYear();
      if (!(month >= 0 && month < 12) || !Number.isInteger(year)) throw new UsageError(io.shell.t('err.calUsage'));
      const locale = io.shell.locale;
      const first = new Date(year, month, 1);
      const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(first);
      // Weeks start on Monday in German, Sunday in English.
      const start = locale === 'de' ? 1 : 0;
      const days = [...Array(7)].map((_, i) =>
        new Intl.DateTimeFormat(locale, { weekday: 'short' })
          .format(new Date(2024, 0, 7 + ((i + start) % 7)))
          .slice(0, 2),
      );
      const width = 20;
      io.out(`${' '.repeat(Math.max(0, Math.floor((width - title.length) / 2)))}${ansi.bold(title)}\n`);
      io.out(`${days.map((d) => d.padStart(2)).join(' ')}\n`);
      const offset = (first.getDay() - start + 7) % 7;
      const count = new Date(year, month + 1, 0).getDate();
      let line = '   '.repeat(offset);
      for (let d = 1; d <= count; d++) {
        const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
        const cell = String(d).padStart(2);
        line += isToday && io.tty ? `\x1b[7m${cell}\x1b[27m` : cell;
        if ((offset + d) % 7 === 0 || d === count) {
          io.out(`${line}\n`);
          line = '';
        } else line += ' ';
      }
    },
  },

  env: {
    complete: 'none',
    run(io) {
      for (const [k, v] of Object.entries(io.shell.env).sort(([a], [b]) => a.localeCompare(b)))
        if (k !== '?') io.out(`${k}=${v}\n`);
    },
  },

  export: {
    complete: 'none',
    run(io) {
      if (!io.args.length) return systemCommands.env?.run(io);
      for (const arg of io.args) {
        const m = /^([A-Za-z_][A-Za-z0-9_]*)(?:=(.*))?$/s.exec(arg);
        if (!m) throw fail(io, 'badName', { name: arg });
        if (m[2] !== undefined) io.shell.env[/** @type {string} */ (m[1])] = m[2];
        else io.shell.env[/** @type {string} */ (m[1])] ??= '';
      }
    },
  },

  unset: {
    complete: 'none',
    run(io) {
      for (const name of io.args) delete io.shell.env[name];
    },
  },

  alias: {
    complete: 'command',
    run(io) {
      if (!io.args.length) {
        for (const [k, v] of Object.entries(io.shell.aliases).sort(([a], [b]) => a.localeCompare(b)))
          io.out(`alias ${k}=${quote(v)}\n`);
        return 0;
      }
      for (const arg of io.args) {
        const eq = arg.indexOf('=');
        if (eq < 0) {
          const value = io.shell.aliases[arg];
          if (value === undefined) throw fail(io, 'noAlias', { name: arg });
          io.out(`alias ${arg}=${quote(value)}\n`);
        } else {
          const name = arg.slice(0, eq);
          if (!/^[\w.-]+$/.test(name)) throw fail(io, 'badName', { name });
          io.shell.aliases[name] = arg.slice(eq + 1);
        }
      }
      io.shell.ui.saveAliases?.();
      return 0;
    },
  },

  unalias: {
    complete: 'command',
    run(io) {
      for (const name of io.args) {
        if (!(name in io.shell.aliases)) throw fail(io, 'noAlias', { name });
        delete io.shell.aliases[name];
      }
      io.shell.ui.saveAliases?.();
    },
  },

  history: {
    complete: 'none',
    run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { c: 'clear' } });
      if (opts.clear) return void io.shell.ui.clearHistory?.();
      /** @type {string[]} */
      const list = io.shell.ui.history?.() ?? [];
      const n = rest[0] ? Number(rest[0]) : list.length;
      const width = String(list.length).length;
      list
        .slice(-n)
        .forEach((line, i) =>
          io.out(`${String(list.length - Math.min(n, list.length) + i + 1).padStart(width + 2)}  ${line}\n`),
        );
    },
  },

  open: {
    complete: 'app',
    async run(io) {
      if (!io.args.length) throw fail(io, 'missingOperand');
      const ctx = os(io);
      let status = 0;
      for (const arg of io.args) {
        const path = io.shell.resolve(arg);
        const node = await io.shell.fs.stat(path);
        try {
          if (node) await ctx.intents.open({ path: node.path, type: node.type, mime: node.mime });
          else {
            const app = findApp(io, arg);
            if (!app) throw fail(io, 'noAppOrFile', { name: arg });
            await ctx.system.windows.launch(app.id, {});
          }
        } catch (error) {
          io.err(
            `${/** @type {Error} */ (error).message.startsWith('open:') ? '' : 'open: '}${/** @type {Error} */ (error).message}\n`,
          );
          status = 1;
        }
      }
      return status;
    },
  },

  apps: {
    complete: 'none',
    run(io) {
      const { opts } = parseArgs(io.args, { flags: { a: 'all', l: 'long' } });
      const list = os(io).system.apps.list({ includeDisabled: !!opts.all });
      const width = Math.max(...list.map((/** @type {any} */ a) => a.id.length)) + 2;
      for (const a of list) {
        const name = local(io, a.name);
        const hidden = a.enabled ? '' : ansi.dim(` (${io.shell.t('out.hidden')})`);
        io.out(
          `${ansi.cyan(padEnd(a.id, width))}${name}${hidden}${opts.long ? ansi.dim(`  ${a.category} ${a.version}`) : ''}\n`,
        );
      }
    },
  },

  ps: {
    complete: 'none',
    run(io) {
      const list = os(io).system.windows.list();
      if (!list.length) return void io.out(`${io.shell.t('out.noWindows')}\n`);
      const t = io.shell.t;
      const w = Math.max(4, ...list.map((/** @type {any} */ x) => x.id.length)) + 2;
      io.out(
        `${ansi.bold(`${padEnd('#', 4)}${padEnd(t('out.psWindow'), w)}${padEnd(t('out.psState'), 12)}${t('out.psTitle')}`)}\n`,
      );
      list.forEach((/** @type {any} */ x, i) => {
        const state = x.state === 'running' ? (x.suspended ? t('out.suspended') : t('out.running')) : x.state;
        io.out(
          `${padEnd(String(i + 1), 4)}${padEnd(x.id, w)}${padEnd(state, 12)}${x.title}${x.focused ? ansi.dim(' *') : ''}\n`,
        );
      });
    },
  },

  kill: {
    complete: 'none',
    async run(io) {
      if (!io.args.length) throw new UsageError(io.shell.t('err.killUsage'));
      const windows = os(io).system.windows;
      const list = windows.list();
      let status = 0;
      for (const arg of io.args) {
        const byIndex = /^\d+$/.test(arg) ? list[Number(arg) - 1] : null;
        const targets = byIndex
          ? [byIndex]
          : list.filter((/** @type {any} */ w) => w.id === arg || w.appId === arg || w.appId.split('.').pop() === arg);
        if (!targets.length) {
          io.err(`kill: ${io.shell.t('err.noWindow', { name: arg })}\n`);
          status = 1;
        }
        for (const w of targets) await windows.kill(w.id);
      }
      return status;
    },
  },

  theme: {
    complete: 'none',
    async run(io) {
      const system = os(io).system;
      const themes = system.theme.list();
      if (!io.args.length) {
        const current = system.theme.current;
        for (const th of themes)
          io.out(`${th.id === current ? ansi.green('● ') : '  '}${padEnd(th.id, 16)}${local(io, th.name)}\n`);
        return 0;
      }
      const q = io.args.join(' ').toLowerCase();
      const match =
        q === 'auto'
          ? { id: 'auto' }
          : themes.find((/** @type {any} */ th) => th.id === q || local(io, th.name).toLowerCase() === q);
      if (!match) throw fail(io, 'noTheme', { name: io.args.join(' ') });
      await system.settings.set('theme', match.id);
      return 0;
    },
  },

  wallpaper: {
    complete: 'path',
    async run(io) {
      const settings = os(io).system.settings;
      if (!io.args.length) return void io.out(`${settings.get('wallpaper')}\n`);
      const arg = /** @type {string} */ (io.args[0]);
      if (/^(live|gradient):/.test(arg)) {
        await settings.set('wallpaper', arg);
        return 0;
      }
      const node = await io.shell.fs.stat(io.shell.resolve(arg));
      if (!node) throw fail(io, 'noEntry', { path: arg });
      if (node.type !== 'file' || !node.mime.startsWith('image/')) throw fail(io, 'notImage', { path: arg });
      await settings.set('wallpaper', `image:${node.path}`);
      return 0;
    },
  },

  notify: {
    complete: 'none',
    run(io) {
      const text = io.args.join(' ') || io.stdin?.trim();
      if (!text) throw fail(io, 'missingOperand');
      os(io).notify({ title: text });
    },
  },

  calc: {
    complete: 'none',
    run(io) {
      const expr = io.args.join(' ') || io.stdin?.trim() || '';
      if (!expr) throw new UsageError(io.shell.t('err.calcUsage'));
      const value = evaluate(expr);
      if (value === null || !Number.isFinite(value)) throw fail(io, 'calc', { expr });
      io.out(`${formatResult(value, (n, o) => new Intl.NumberFormat(io.shell.locale, o).format(n))}\n`);
    },
  },

  nexusfetch: {
    complete: 'none',
    async run(io) {
      const ctx = os(io);
      const t = io.shell.t;
      const info = ctx.system.info();
      const usage = await io.shell.fs.usage().catch(() => null);
      const estimate = await navigator.storage?.estimate?.().catch(() => null);
      const theme = ctx.system.theme.list().find((/** @type {any} */ th) => th.id === ctx.system.theme.current);
      const rows = [
        [ansi.bold(ansi.cyan(`${io.shell.user}@nexus`)), ''],
        ['-'.repeat(io.shell.user.length + 6), ''],
        [t('fetch.os'), `Nexus Arcade OS ${info.version} (${info.edition === 'lite' ? 'Lite' : 'Web'})`],
        [t('fetch.uptime'), duration(io, Date.now() - info.bootedAt)],
        [t('fetch.shell'), 'nsh'],
        [t('fetch.apps'), String(ctx.system.apps.list().length)],
        [t('fetch.windows'), String(ctx.system.windows.list().length)],
        [t('fetch.theme'), theme ? local(io, theme.name) : String(ctx.system.theme.current)],
        [t('fetch.language'), ctx.i18n.locale],
        [t('fetch.display'), `${screen.width}×${screen.height}`],
        [t('fetch.files'), usage ? t('out.filesCount', { count: usage.files }) : '?'],
        [
          t('fetch.storage'),
          estimate?.quota ? `${shortSize(estimate.usage ?? 0)} / ${shortSize(estimate.quota)}` : '?',
        ],
      ];
      const palette = `${[40, 41, 42, 43, 44, 45, 46, 47].map((c) => `\x1b[${c}m   `).join('')}\x1b[0m`;
      const out = [];
      for (let i = 0; i < Math.max(LOGO.length, rows.length + 2); i++) {
        const logo = ansi.cyan(LOGO[i] ?? ' '.repeat(13));
        const row = rows[i];
        const right = row
          ? row[1]
            ? `${ansi.bold(ansi.cyan(row[0]))}: ${row[1]}`
            : row[0]
          : i === rows.length + 1
            ? palette
            : '';
        out.push(`${logo} ${right}`);
      }
      io.out(`${out.join('\n')}\n`);
    },
  },

  sleep: {
    complete: 'none',
    async run(io) {
      const seconds = Number(io.args[0]);
      if (!(seconds >= 0)) throw new UsageError(io.shell.t('err.sleepUsage'));
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, seconds * 1000);
        io.signal.addEventListener('abort', () => (clearTimeout(timer), resolve(null)), { once: true });
      });
      return io.signal.aborted ? 130 : 0;
    },
  },

  which: {
    complete: 'command',
    run(io) {
      let status = 0;
      for (const name of io.args) {
        if (name in io.shell.aliases)
          io.out(`${name}: ${io.shell.t('out.aliasFor', { value: io.shell.aliases[name] })}\n`);
        else if (name in io.shell.builtins) io.out(`${name}: ${io.shell.t('out.builtin')}\n`);
        else {
          const external = (io.shell.os?.system?.apps.terminalCommands() ?? []).find(
            (/** @type {any} */ c) => c.name === name,
          );
          if (external)
            io.out(`${name}: ${io.shell.t('out.fromApp', { app: io.shell.os.system.apps.name(external.app) })}\n`);
          else {
            io.err(`which: ${io.shell.t('err.noCommand', { name })}\n`);
            status = 1;
          }
        }
      }
      return status;
    },
  },

  true: { complete: 'none', run: () => 0 },
  false: { complete: 'none', run: () => 1 },

  exit: { complete: 'none', run: (io) => void io.shell.ui.closeTab?.() },
};
