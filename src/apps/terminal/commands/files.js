// @ts-check
// File commands: ls, cd, pwd, cat, less, head, tail, touch, mkdir, rm, mv, cp, find, tree, du, df.
import { baseName, joinPath, parentOf } from '../../../ui/paths.js';
import { globToRegExp } from '../shell/expand.js';
import { ShellError } from '../shell/shell.js';
import { ansi, columns, lines, padStart, parseArgs, shortSize, unlines, UsageError } from './util.js';

/** @typedef {import('../shell/shell.js').CommandIo} Io */
/** @typedef {import('../shell/shell.js').CommandDef} CommandDef */

/** @param {Io} io @param {string} key @param {Record<string, unknown>} [vars] */
const fail = (io, key, vars) => new ShellError(`${io.name}: ${io.shell.t(`err.${key}`, vars)}`);

/** @param {Io} io @param {string} path */
async function mustStat(io, path) {
  const node = await io.shell.fs.stat(io.shell.resolve(path));
  if (!node) throw fail(io, 'noEntry', { path });
  return node;
}

/** Colour for a name in listings (only on screen). @param {any} node @param {boolean} tty */
function colored(node, tty) {
  const name = node.type === 'folder' ? `${node.name}/` : node.name;
  if (!tty) return node.name;
  if (node.type === 'folder') return ansi.bold(ansi.blue(name));
  if (node.mime.startsWith('image/')) return ansi.magenta(name);
  if (/javascript|typescript|json|python|x-sh|sql|html|css/.test(node.mime)) return ansi.green(name);
  if (node.mime.startsWith('audio/') || node.mime.startsWith('video/')) return ansi.cyan(name);
  return name;
}

/**
 * Text content of the arguments (files) or stdin.
 * @param {Io} io
 * @param {string[]} paths
 * @returns {AsyncGenerator<{ name: string, text: string }>}
 */
async function* inputs(io, paths) {
  if (!paths.length) {
    yield { name: '-', text: io.stdin ?? '' };
    return;
  }
  for (const path of paths) {
    if (path === '-') {
      yield { name: '-', text: io.stdin ?? '' };
      continue;
    }
    const node = await mustStat(io, path);
    if (node.type === 'folder') throw fail(io, 'isFolder', { path });
    if (!isText(node)) throw fail(io, 'binary', { path });
    yield { name: path, text: /** @type {string} */ (await io.shell.fs.readFile(node.path, { as: 'text' })) };
  }
}

/** Text-like files (dot-files without an extension, like .nexusrc, count as text). @param {any} node */
const isText = (node) =>
  /^text\/|json|xml|yaml|javascript|typescript|x-sh|sql|svg/.test(node.mime) ||
  node.size === 0 ||
  (node.mime === 'application/octet-stream' && node.name.startsWith('.') && node.size < 1_000_000);

/** @type {Record<string, CommandDef>} */
export const fileCommands = {
  pwd: { complete: 'none', run: (io) => io.out(`${io.shell.cwd}\n`) },

  cd: {
    complete: 'folder',
    async run(io) {
      if (io.args.length > 1) throw fail(io, 'tooMany');
      await io.shell.cd(io.args[0] ?? '');
    },
  },

  ls: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, {
        flags: { l: 'long', a: 'all', all: 'all', h: 'human', 1: 'one', t: 'time', S: 'size', r: 'reverse' },
      });
      const targets = rest.length ? rest : ['.'];
      const width = io.shell.ui.columns?.() ?? 80;
      let status = 0;
      for (const [i, target] of targets.entries()) {
        const node = await io.shell.fs.stat(io.shell.resolve(target));
        if (!node) {
          io.err(`ls: ${io.shell.t('err.noEntry', { path: target })}\n`);
          status = 1;
          continue;
        }
        let list = node.type === 'folder' ? await io.shell.fs.list(node.path) : [node];
        if (!opts.all) list = list.filter((n) => !n.name.startsWith('.'));
        if (opts.time) list.sort((a, b) => b.modified - a.modified);
        if (opts.size) list.sort((a, b) => b.size - a.size);
        if (opts.reverse) list.reverse();
        if (targets.length > 1 && node.type === 'folder') io.out(`${i ? '\n' : ''}${target}:\n`);
        if (opts.long) {
          const sizes = list.map((n) => (n.type === 'folder' ? '-' : opts.human ? shortSize(n.size) : String(n.size)));
          const w = Math.max(1, ...sizes.map((s) => s.length));
          for (const [j, n] of list.entries()) {
            const kind = n.type === 'folder' ? 'd' : '-';
            const mode = n.readOnly ? 'r-' : 'rw';
            const date =
              io.shell.os?.i18n.date(n.modified, { dateStyle: 'medium', timeStyle: 'short' }) ??
              new Date(n.modified).toISOString();
            const tags = n.tags?.length ? ansi.dim(` #${n.tags.join(' #')}`) : '';
            io.out(
              `${kind}${mode}  ${padStart(/** @type {string} */ (sizes[j]), w)}  ${date}  ${colored(n, io.tty)}${tags}\n`,
            );
          }
        } else if (opts.one || !io.tty) io.out(unlines(list.map((n) => colored(n, io.tty))));
        else
          io.out(
            columns(
              list.map((n) => colored(n, true)),
              width,
            ),
          );
      }
      return status;
    },
  },

  cat: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { n: 'number' } });
      let n = 0;
      for await (const { text } of inputs(io, rest)) {
        if (!opts.number) io.out(text);
        else io.out(unlines(lines(text).map((l) => `${padStart(String(++n), 6)}  ${l}`)));
      }
    },
  },

  less: {
    complete: 'path',
    async run(io) {
      let all = '';
      let title = '';
      for await (const { name, text } of inputs(io, io.args)) {
        all += text;
        title ||= name === '-' ? '' : name;
      }
      if (io.tty && io.shell.ui.pager) await io.shell.ui.pager(all, title, io.signal);
      else io.out(all);
    },
  },

  head: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { values: { n: 'lines', lines: 'lines' }, numberAs: 'lines' });
      const count = Number(opts.lines ?? 10);
      if (!Number.isInteger(count) || count < 0)
        throw new UsageError(io.shell.t('err.badNumber', { value: opts.lines }));
      for await (const { name, text } of inputs(io, rest)) {
        if (rest.length > 1) io.out(`==> ${name} <==\n`);
        io.out(unlines(lines(text).slice(0, count)));
      }
    },
  },

  tail: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { values: { n: 'lines', lines: 'lines' }, numberAs: 'lines' });
      const count = Number(opts.lines ?? 10);
      if (!Number.isInteger(count) || count < 0)
        throw new UsageError(io.shell.t('err.badNumber', { value: opts.lines }));
      for await (const { name, text } of inputs(io, rest)) {
        if (rest.length > 1) io.out(`==> ${name} <==\n`);
        io.out(unlines(count ? lines(text).slice(-count) : []));
      }
    },
  },

  touch: {
    complete: 'path',
    async run(io) {
      if (!io.args.length) throw fail(io, 'missingOperand');
      for (const arg of io.args) {
        const path = io.shell.resolve(arg);
        const node = await io.shell.fs.stat(path);
        if (node) await io.shell.fs.setMeta(path, {});
        else await io.shell.fs.writeFile(path, '');
      }
    },
  },

  mkdir: {
    complete: 'folder',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { p: 'parents', parents: 'parents' } });
      if (!rest.length) throw fail(io, 'missingOperand');
      for (const arg of rest) {
        const path = io.shell.resolve(arg);
        const node = await io.shell.fs.stat(path);
        if (node && opts.parents && node.type === 'folder') continue;
        if (node) throw fail(io, 'exists', { path: arg });
        if (!opts.parents && !(await io.shell.fs.stat(parentOf(path))))
          throw fail(io, 'noEntry', { path: parentOf(arg) || arg });
        await io.shell.fs.mkdir(path, { recursive: !!opts.parents });
      }
    },
  },

  rm: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, {
        flags: {
          r: 'recursive',
          R: 'recursive',
          recursive: 'recursive',
          f: 'force',
          force: 'force',
          P: 'permanent',
          permanent: 'permanent',
        },
      });
      if (!rest.length && !opts.force) throw fail(io, 'missingOperand');
      let status = 0;
      for (const arg of rest) {
        const path = io.shell.resolve(arg);
        const node = await io.shell.fs.stat(path);
        try {
          if (!node) {
            if (opts.force) continue;
            throw fail(io, 'noEntry', { path: arg });
          }
          if (node.type === 'folder' && !opts.recursive) throw fail(io, 'isFolderUseR', { path: arg });
          if (opts.permanent || path.startsWith('/.trash/')) await io.shell.fs.deletePermanently(path);
          else await io.shell.fs.trash(path);
        } catch (error) {
          io.err(
            `${/** @type {Error} */ (error).message.startsWith('rm:') ? '' : 'rm: '}${/** @type {Error} */ (error).message}\n`,
          );
          status = 1;
        }
      }
      return status;
    },
  },

  mv: {
    complete: 'path',
    run: (io) => transfer(io, 'move'),
  },

  cp: {
    complete: 'path',
    run: (io) => transfer(io, 'copy'),
  },

  find: {
    complete: 'folder',
    async run(io) {
      const { opts, rest } = parseFindArgs(io);
      const roots = rest.length ? rest : ['.'];
      const nameRe = opts.name ? globToRegExp(/** @type {string} */ (opts.name)) : null;
      const inameRe = opts.iname ? new RegExp(globToRegExp(/** @type {string} */ (opts.iname)).source, 'i') : null;
      for (const root of roots) {
        const node = await mustStat(io, root);
        const nodes = depthFirst(await io.shell.fs.walk(node.path));
        for (const n of nodes) {
          if (io.signal.aborted) return 130;
          if (n.path.startsWith('/.trash') && !node.path.startsWith('/.trash')) continue;
          if (opts.type === 'f' && n.type !== 'file') continue;
          if (opts.type === 'd' && n.type !== 'folder') continue;
          if (nameRe && !nameRe.test(n.name)) continue;
          if (inameRe && !inameRe.test(n.name)) continue;
          const shown =
            n.path === node.path
              ? root
              : root === '/'
                ? n.path
                : `${root.replace(/\/$/, '')}${n.path.slice(node.path.length)}`;
          io.out(`${shown}\n`);
        }
      }
    },
  },

  tree: {
    complete: 'folder',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { a: 'all', d: 'dirs' }, values: { L: 'level' } });
      const root = await mustStat(io, rest[0] ?? '.');
      if (root.type !== 'folder') throw fail(io, 'notFolder', { path: rest[0] });
      const maxDepth = opts.level ? Number(opts.level) : Infinity;
      let folders = 0;
      let files = 0;
      io.out(`${io.tty ? ansi.bold(ansi.blue(rest[0] ?? '.')) : (rest[0] ?? '.')}\n`);
      /** @param {string} path @param {string} prefix @param {number} depth */
      const walk = async (path, prefix, depth) => {
        if (depth > maxDepth || io.signal.aborted) return;
        let list = await io.shell.fs.list(path);
        if (!opts.all) list = list.filter((n) => !n.name.startsWith('.'));
        if (opts.dirs) list = list.filter((n) => n.type === 'folder');
        for (const [i, n] of list.entries()) {
          const last = i === list.length - 1;
          io.out(`${prefix}${last ? '└── ' : '├── '}${colored(n, io.tty)}\n`);
          if (n.type === 'folder') {
            folders++;
            await walk(n.path, `${prefix}${last ? '    ' : '│   '}`, depth + 1);
          } else files++;
        }
      };
      await walk(root.path, '', 1);
      io.out(`\n${io.shell.t('out.treeSummary', { folders, files })}\n`);
    },
  },

  du: {
    complete: 'path',
    async run(io) {
      const { opts, rest } = parseArgs(io.args, { flags: { h: 'human', s: 'summary', a: 'all' } });
      const size = (/** @type {number} */ n) => (opts.human ? shortSize(n) : String(Math.ceil(n / 1024)));
      for (const target of rest.length ? rest : ['.']) {
        const root = await mustStat(io, target);
        const nodes = await io.shell.fs.walk(root.path);
        /** @type {Map<string, number>} folder path → bytes inside */
        const totals = new Map();
        for (const n of nodes) {
          if (n.type !== 'file') continue;
          for (let p = parentOf(n.path); ; p = parentOf(p)) {
            totals.set(p, (totals.get(p) ?? 0) + n.size);
            if (p === root.path || p === '/') break;
          }
        }
        const shown = (/** @type {string} */ p) =>
          p === root.path ? target : `${target.replace(/\/$/, '')}${p.slice(root.path.length)}`;
        if (root.type === 'file') {
          io.out(`${size(root.size)}\t${target}\n`);
          continue;
        }
        if (!opts.summary) {
          const folders = nodes.filter((n) => n.type === 'folder' && n.path !== root.path).reverse();
          for (const f of folders) io.out(`${size(totals.get(f.path) ?? 0)}\t${shown(f.path)}\n`);
          if (opts.all)
            for (const f of nodes.filter((n) => n.type === 'file')) io.out(`${size(f.size)}\t${shown(f.path)}\n`);
        }
        io.out(`${size(totals.get(root.path) ?? 0)}\t${target}\n`);
      }
    },
  },

  df: {
    complete: 'none',
    async run(io) {
      const { opts } = parseArgs(io.args, { flags: { h: 'human' } });
      const size = (/** @type {number} */ n) => (opts.human ? shortSize(n) : String(Math.round(n / 1024)));
      const estimate = await navigator.storage?.estimate?.().catch(() => null);
      const usage = await io.shell.fs.usage();
      const used = estimate?.usage ?? usage.bytes;
      const total = estimate?.quota ?? 0;
      const t = io.shell.t;
      const head = [
        t('out.dfFs'),
        t(opts.human ? 'out.dfSize' : 'out.dfBlocks'),
        t('out.dfUsed'),
        t('out.dfAvail'),
        t('out.dfUse'),
      ];
      const row = [
        'nexus',
        total ? size(total) : '?',
        size(used),
        total ? size(total - used) : '?',
        total ? `${Math.round((used / total) * 100)}%` : '?',
      ];
      const widths = head.map((h, i) => Math.max(h.length, /** @type {string} */ (row[i]).length));
      const fmt = (/** @type {string[]} */ cells) =>
        cells
          .map((c, i) =>
            i ? padStart(c, /** @type {number} */ (widths[i])) : c.padEnd(/** @type {number} */ (widths[i])),
          )
          .join('  ');
      io.out(`${fmt(head)}\n${fmt(row)}\n`);
      io.out(
        ansi.dim(
          `${t('out.dfFiles', { files: usage.files, folders: usage.folders, trash: shortSize(usage.trashBytes) })}\n`,
        ),
      );
    },
  },
};

/** Orders walk() results like `find` prints them: each folder followed by its contents. @param {any[]} nodes */
function depthFirst(nodes) {
  const key = (/** @type {any} */ n) => n.path.split('/');
  return [...nodes].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return x.length - y.length;
  });
}

/** find's own option style: -name, -iname, -type (single dash, long names). @param {Io} io */
function parseFindArgs(io) {
  /** @type {Record<string, string>} */
  const opts = {};
  /** @type {string[]} */
  const rest = [];
  for (let i = 0; i < io.args.length; i++) {
    const a = /** @type {string} */ (io.args[i]);
    if (a === '-name' || a === '-iname' || a === '-type') {
      const value = io.args[++i];
      if (value === undefined) throw new UsageError(io.shell.t('err.needsValue', { option: a }));
      if (a === '-type' && value !== 'f' && value !== 'd') throw new UsageError(io.shell.t('err.findType'));
      opts[a.slice(1)] = value;
    } else if (a.startsWith('-')) throw new UsageError(io.shell.t('err.unknownOption', { option: a }));
    else rest.push(a);
  }
  return { opts, rest };
}

/**
 * mv / cp: "SOURCE DEST" (rename or into a folder) or "SOURCE… FOLDER".
 * @param {Io} io
 * @param {'move' | 'copy'} mode
 */
async function transfer(io, mode) {
  const { opts, rest } = parseArgs(io.args, {
    flags:
      mode === 'copy'
        ? { r: 'recursive', R: 'recursive', recursive: 'recursive', n: 'noClobber' }
        : { n: 'noClobber', f: 'force' },
  });
  if (rest.length < 2) throw fail(io, 'missingDest');
  const dest = io.shell.resolve(/** @type {string} */ (rest.at(-1)));
  const sources = rest.slice(0, -1);
  const destNode = await io.shell.fs.stat(dest);
  if (sources.length > 1 && destNode?.type !== 'folder') throw fail(io, 'notFolder', { path: rest.at(-1) });
  let status = 0;
  for (const source of sources) {
    try {
      const node = await mustStat(io, source);
      if (mode === 'copy' && node.type === 'folder' && !opts.recursive)
        throw fail(io, 'isFolderUseR', { path: source });
      const target = destNode?.type === 'folder' ? joinPath(dest, baseName(node.path)) : dest;
      if (target === node.path) throw fail(io, 'same', { path: source });
      const existing = await io.shell.fs.stat(target);
      if (existing) {
        if (opts.noClobber) continue;
        if (existing.type === 'folder') throw fail(io, 'exists', { path: target });
        // Overwrite a file: the old one goes to the trash, so nothing is lost by accident.
        await io.shell.fs.trash(target);
      }
      if (mode === 'move') await io.shell.fs.move(node.path, target);
      else await io.shell.fs.copy(node.path, target);
    } catch (error) {
      const message = /** @type {Error} */ (error).message;
      io.err(`${message.startsWith(`${io.name}:`) ? '' : `${io.name}: `}${message}\n`);
      status = 1;
    }
  }
  return status;
}
