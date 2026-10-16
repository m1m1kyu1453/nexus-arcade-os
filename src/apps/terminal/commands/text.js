// @ts-check
// Text commands: echo, grep, wc, sort, uniq.
import { ShellError } from '../shell/shell.js';
import { ansi, lines, padStart, parseArgs, unlines, UsageError } from './util.js';

/** @typedef {import('../shell/shell.js').CommandIo} Io */
/** @typedef {import('../shell/shell.js').CommandDef} CommandDef */

/** @param {Io} io @param {string} key @param {Record<string, unknown>} [vars] */
const fail = (io, key, vars) => new ShellError(`${io.name}: ${io.shell.t(`err.${key}`, vars)}`);

/**
 * Reads the named files (or stdin) as text.
 * @param {Io} io
 * @param {string[]} paths
 */
async function readAll(io, paths) {
  if (!paths.length) return [{ name: '', text: io.stdin ?? '' }];
  const out = [];
  for (const p of paths) {
    const node = await io.shell.fs.stat(io.shell.resolve(p));
    if (!node) throw fail(io, 'noEntry', { path: p });
    if (node.type === 'folder') throw fail(io, 'isFolder', { path: p });
    out.push({ name: p, text: /** @type {string} */ (await io.shell.fs.readFile(node.path, { as: 'text' })) });
  }
  return out;
}

/** echo -e escapes. @param {string} s */
function unescape(s) {
  return s.replace(/\\(n|t|e|\\|0)/g, (_, c) => ({ n: '\n', t: '\t', e: '\x1b', '\\': '\\', 0: '' })[c] ?? c);
}

/** @type {Record<string, CommandDef>} */
export const textCommands = {
  echo: {
    complete: 'path',
    run(io) {
      let args = io.args;
      let newline = true;
      let escapes = false;
      while (args[0] && /^-[ne]+$/.test(args[0])) {
        if (args[0].includes('n')) newline = false;
        if (args[0].includes('e')) escapes = true;
        args = args.slice(1);
      }
      const text = args.join(' ');
      io.out((escapes ? unescape(text) : text) + (newline ? '\n' : ''));
    },
  },

  grep: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, {
        flags: {
          i: 'ignoreCase',
          'ignore-case': 'ignoreCase',
          n: 'lineNumber',
          'line-number': 'lineNumber',
          r: 'recursive',
          R: 'recursive',
          recursive: 'recursive',
          v: 'invert',
          'invert-match': 'invert',
          c: 'count',
          count: 'count',
          l: 'filesOnly',
          'files-with-matches': 'filesOnly',
          w: 'word',
          F: 'fixed',
          E: 'extended',
        },
      });
      const [pattern, ...paths] = rest;
      if (pattern === undefined) throw new UsageError(io.shell.t('err.grepUsage'));
      let source = opts.fixed ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern;
      if (opts.word) source = `\\b(?:${source})\\b`;
      let re;
      try {
        re = new RegExp(source, opts.ignoreCase ? 'gi' : 'g');
      } catch (error) {
        throw fail(io, 'badRegex', { reason: /** @type {Error} */ (error).message });
      }

      /** @type {{ name: string, text: string }[]} */
      let sources;
      if (opts.recursive) {
        sources = [];
        for (const p of paths.length ? paths : ['.']) {
          const root = await io.shell.fs.stat(io.shell.resolve(p));
          if (!root) throw fail(io, 'noEntry', { path: p });
          for (const n of root.type === 'folder' ? await io.shell.fs.walk(root.path) : [root]) {
            if (io.signal.aborted) return 130;
            if (n.type !== 'file' || !/^text\/|json|xml|yaml|javascript|typescript|x-sh|sql/.test(n.mime)) continue;
            const shown =
              p === '.'
                ? n.path.slice(io.shell.cwd.length + 1) || n.name
                : `${p.replace(/\/$/, '')}${n.path.slice(root.path.length)}`;
            sources.push({
              name: shown || n.name,
              text: /** @type {string} */ (await io.shell.fs.readFile(n.path, { as: 'text' })),
            });
          }
        }
      } else sources = await readAll(io, paths);

      const showName = opts.recursive || sources.length > 1;
      let matched = false;
      for (const { name, text } of sources) {
        let count = 0;
        for (const [i, line] of lines(text).entries()) {
          if (io.signal.aborted) return 130;
          re.lastIndex = 0;
          const hit = re.test(line);
          if (hit === !!opts.invert) continue;
          count++;
          matched = true;
          if (opts.count || opts.filesOnly) continue;
          re.lastIndex = 0;
          const shown = io.tty && !opts.invert ? line.replace(re, (m) => ansi.bold(ansi.red(m))) : line;
          const prefix = `${showName ? `${io.tty ? ansi.magenta(name) : name}:` : ''}${opts.lineNumber ? `${io.tty ? ansi.green(String(i + 1)) : i + 1}:` : ''}`;
          io.out(`${prefix}${shown}\n`);
        }
        if (opts.count) io.out(`${showName ? `${name}:` : ''}${count}\n`);
        else if (opts.filesOnly && count) io.out(`${name}\n`);
      }
      return matched ? 0 : 1;
    },
  },

  wc: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { l: 'lines', w: 'words', c: 'bytes', m: 'chars' } });
      const all = !opts.lines && !opts.words && !opts.bytes && !opts.chars;
      const totals = [0, 0, 0];
      const files = await readAll(io, rest);
      const rows = files.map(({ name, text }) => {
        const counts = [
          (text.match(/\n/g) ?? []).length,
          text.split(/\s+/).filter(Boolean).length,
          opts.chars ? [...text].length : new TextEncoder().encode(text).byteLength,
        ];
        counts.forEach((c, i) => (totals[i] = /** @type {number} */ (totals[i]) + c));
        return { name, counts };
      });
      if (files.length > 1) rows.push({ name: io.shell.t('out.total'), counts: totals });
      const pick = (/** @type {number[]} */ c) =>
        [
          all || opts.lines ? c[0] : null,
          all || opts.words ? c[1] : null,
          all || opts.bytes || opts.chars ? c[2] : null,
        ].filter((v) => v !== null);
      const width = Math.max(...rows.flatMap((r) => pick(r.counts).map((v) => String(v).length)));
      for (const r of rows)
        io.out(
          `${pick(r.counts)
            .map((v) => padStart(String(v), width))
            .join(' ')}${r.name ? ` ${r.name}` : ''}\n`,
        );
    },
  },

  sort: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, {
        flags: { r: 'reverse', n: 'numeric', u: 'unique', f: 'ignoreCase' },
      });
      let list = (await readAll(io, rest)).flatMap(({ text }) => lines(text));
      const collator = new Intl.Collator(io.shell.locale, {
        sensitivity: opts.ignoreCase ? 'base' : 'variant',
        numeric: false,
      });
      list.sort(
        opts.numeric
          ? (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || collator.compare(a, b)
          : collator.compare,
      );
      if (opts.reverse) list.reverse();
      if (opts.unique)
        list = list.filter((l, i) => i === 0 || collator.compare(l, /** @type {string} */ (list[i - 1])) !== 0);
      io.out(unlines(list));
    },
  },

  uniq: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { c: 'count', i: 'ignoreCase', d: 'repeated', u: 'unique' } });
      const list = (await readAll(io, rest)).flatMap(({ text }) => lines(text));
      const same = (/** @type {string} */ a, /** @type {string} */ b) =>
        opts.ignoreCase ? a.toLowerCase() === b.toLowerCase() : a === b;
      /** @type {{ line: string, n: number }[]} */
      const groups = [];
      for (const line of list) {
        const last = groups.at(-1);
        if (last && same(last.line, line)) last.n++;
        else groups.push({ line, n: 1 });
      }
      const kept = groups.filter((g) => (opts.repeated ? g.n > 1 : opts.unique ? g.n === 1 : true));
      io.out(unlines(kept.map((g) => (opts.count ? `${padStart(String(g.n), 7)} ${g.line}` : g.line))));
    },
  },
};
