// @ts-check
// The Nexus shell interpreter. One instance per terminal tab: its own working folder,
// variables, aliases and last exit status. Commands are async functions that read `stdin`
// (a string, or null) and write text with `out`/`err`; pipes buffer the whole output of one
// command and hand it to the next.
import { baseName, parentOf, resolvePath } from '../../../ui/paths.js';
import { expandWord, expandWords } from './expand.js';
import { parse, ParseError } from './parse.js';

/**
 * @typedef {object} Fs  the part of ctx.fs the shell needs (commands may use more)
 * @property {(path: string) => Promise<any>} stat
 * @property {(path: string, options?: object) => Promise<any[]>} list
 * @property {(path: string, options?: object) => Promise<any>} readFile
 * @property {(path: string, data: any, options?: object) => Promise<any>} writeFile
 */

/**
 * @typedef {object} CommandIo
 * @property {string} name          the command name as typed
 * @property {string[]} args
 * @property {string | null} stdin
 * @property {(text: string) => void} out
 * @property {(text: string) => void} err
 * @property {boolean} tty          output goes to the screen (not a pipe or file)
 * @property {AbortSignal} signal
 * @property {Shell} shell
 */

/**
 * @typedef {object} CommandDef
 * @property {(io: CommandIo) => Promise<number | void> | number | void} run
 * @property {'path' | 'folder' | 'command' | 'app' | 'none'} [complete]  what Tab completes for arguments
 */

/**
 * @typedef {object} ShellOptions
 * @property {Fs & Record<string, any>} fs
 * @property {string} home
 * @property {string} user
 * @property {string} [cwd]
 * @property {Record<string, CommandDef>} builtins
 * @property {(name: string) => ((io: CommandIo) => Promise<number>) | null} [external]  app-provided commands
 * @property {Record<string, any>} [ui]  terminal UI hooks (clear, pager, history, closeTab …) for commands
 * @property {Record<string, string>} [env]
 * @property {(key: string, vars?: Record<string, unknown>) => string} [t]  messages (app i18n)
 * @property {any} [os]  the app's ctx, for commands that talk to the OS (open, apps, theme …)
 */

export class ShellError extends Error {
  name = 'ShellError';
}

export class Shell {
  /** @param {ShellOptions} options */
  constructor({
    fs,
    home,
    user,
    cwd = home,
    builtins,
    external = () => null,
    ui = {},
    env = {},
    t = (k) => k,
    os = null,
  }) {
    this.fs = fs;
    this.t = t;
    this.os = os;
    this.home = home;
    this.user = user;
    this.cwd = cwd;
    this.builtins = builtins;
    this.external = external;
    this.ui = ui;
    /** @type {Record<string, string>} */
    this.env = { HOME: home, USER: user, SHELL: 'nsh', TERM: 'nexus-256color', PWD: cwd, ...env };
    /** @type {Record<string, string>} */
    this.aliases = { ll: 'ls -la', la: 'ls -a', '..': 'cd ..' };
    this.status = 0;
  }

  /** Language for formatting (dates, numbers): the OS language, English without one. */
  get locale() {
    return this.os?.i18n.locale ?? 'en';
  }

  /** Absolute path for something the user typed. @param {string} path */
  resolve(path) {
    return resolvePath(path, this.cwd, this.home);
  }

  /** @param {string} path */
  async cd(path) {
    const target = path === '-' ? (this.env.OLDPWD ?? this.cwd) : this.resolve(path || this.home);
    const node = await this.fs.stat(target);
    if (!node) throw new ShellError(`cd: ${this.t('err.noEntry', { path })}`);
    if (node.type !== 'folder') throw new ShellError(`cd: ${this.t('err.notFolder', { path })}`);
    this.env.OLDPWD = this.cwd;
    this.cwd = target;
    this.env.PWD = target;
  }

  /** @param {string} name */
  hasCommand(name) {
    return name in this.builtins || name in this.aliases || !!this.external(name);
  }

  /**
   * Runs a command line. Errors are printed to `err`; resolves to the exit status.
   * @param {string} line
   * @param {{ out: (text: string) => void, err: (text: string) => void, signal?: AbortSignal }} io
   */
  async run(line, { out, err, signal = new AbortController().signal }) {
    let script;
    try {
      script = parse(line);
    } catch (error) {
      if (!(error instanceof ParseError)) throw error;
      err(`nsh: ${this.t('err.syntax', { reason: error.message })}\n`);
      return (this.status = 2);
    }
    for (const chain of script) {
      if (signal.aborted) break;
      let status = await this.pipeline(
        /** @type {import('./parse.js').Pipeline} */ (chain.pipelines[0]),
        out,
        err,
        signal,
      );
      for (const [i, op] of chain.ops.entries()) {
        if (signal.aborted) break;
        if ((op === '&&' && status !== 0) || (op === '||' && status === 0)) continue;
        status = await this.pipeline(
          /** @type {import('./parse.js').Pipeline} */ (chain.pipelines[i + 1]),
          out,
          err,
          signal,
        );
      }
      this.status = signal.aborted ? 130 : status;
      this.env['?'] = String(this.status);
    }
    return this.status;
  }

  /**
   * @param {import('./parse.js').Pipeline} pipeline
   * @param {(text: string) => void} out
   * @param {(text: string) => void} err
   * @param {AbortSignal} signal
   */
  async pipeline(pipeline, out, err, signal) {
    /** @type {string | null} */
    let input = null;
    let status = 0;
    for (const [i, command] of pipeline.commands.entries()) {
      const last = i === pipeline.commands.length - 1;
      let buffer = '';
      status = await this.command(command, {
        stdin: input,
        out: last ? out : (text) => void (buffer += text),
        err,
        tty: last,
        signal,
      });
      input = last ? null : buffer;
      if (signal.aborted) return 130;
    }
    return status;
  }

  /**
   * Runs one simple command with its redirections.
   * @param {import('./parse.js').Command} command
   * @param {{ stdin: string | null, out: (t: string) => void, err: (t: string) => void, tty: boolean, signal: AbortSignal }} io
   * @returns {Promise<number>} exit status
   */
  async command(command, io) {
    const env = {
      vars: this.env,
      home: this.home,
      cwd: this.cwd,
      list: (/** @type {string} */ p) => this.fs.list(p),
    };
    let argv;
    try {
      argv = await expandWords(command.words, env);
    } catch (error) {
      io.err(`nsh: ${/** @type {Error} */ (error).message}\n`);
      return 1;
    }

    // NAME=value on its own sets a variable.
    if (argv.length && argv.every((a) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) && !command.redirects.length) {
      for (const a of argv) {
        const eq = a.indexOf('=');
        this.env[a.slice(0, eq)] = a.slice(eq + 1);
      }
      return 0;
    }

    // Aliases (not recursive: an alias can use a command of the same name).
    const seen = new Set();
    while (argv[0] && this.aliases[argv[0]] !== undefined && !seen.has(argv[0])) {
      seen.add(argv[0]);
      const expansion = parse(/** @type {string} */ (this.aliases[argv[0]]));
      const words = expansion[0]?.pipelines[0]?.commands[0]?.words ?? [];
      argv = [...words.map((w) => expandWord(w, env).value), ...argv.slice(1)];
    }

    // Redirections.
    let stdin = io.stdin;
    let out = io.out;
    let err = io.err;
    let tty = io.tty;
    /** @type {{ path: string, append: boolean, text: string }[]} */
    const files = [];
    try {
      for (const r of command.redirects) {
        if (r.op === '2>&1') {
          err = (t) => out(t);
          continue;
        }
        const target = this.resolve(expandWord(/** @type {import('./parse.js').Word} */ (r.target), env).value);
        if (r.op === '<') {
          const node = await this.fs.stat(target);
          if (!node) throw new ShellError(this.t('err.noEntry', { path: baseName(target) }));
          if (node.type === 'folder') throw new ShellError(this.t('err.isFolder', { path: baseName(target) }));
          stdin = /** @type {string} */ (await this.fs.readFile(target, { as: 'text' }));
        } else {
          const parent = await this.fs.stat(parentOf(target));
          if (!parent || parent.type !== 'folder')
            throw new ShellError(this.t('err.noEntry', { path: parentOf(target) }));
          const file = { path: target, append: r.op.endsWith('>>'), text: '' };
          files.push(file);
          if (r.op.startsWith('2')) err = (t) => void (file.text += t);
          else {
            out = (t) => void (file.text += t);
            tty = false;
          }
        }
      }
    } catch (error) {
      io.err(`nsh: ${/** @type {Error} */ (error).message}\n`);
      return 1;
    }

    let status = 0;
    if (argv.length) status = await this.exec(argv, { stdin, out, err, tty, signal: io.signal });

    for (const file of files) {
      try {
        let text = file.text;
        if (file.append) {
          const existing = await this.fs.stat(file.path);
          if (existing?.type === 'file')
            text = /** @type {string} */ (await this.fs.readFile(file.path, { as: 'text' })) + text;
        }
        await this.fs.writeFile(file.path, text);
      } catch (error) {
        io.err(`nsh: ${file.path}: ${/** @type {Error} */ (error).message}\n`);
        status = 1;
      }
    }
    return status;
  }

  /**
   * Runs argv[0] with the rest as arguments.
   * @param {string[]} argv
   * @param {{ stdin: string | null, out: (t: string) => void, err: (t: string) => void, tty: boolean, signal: AbortSignal }} io
   */
  async exec(argv, io) {
    const [name, ...args] = /** @type {[string, ...string[]]} */ (argv);
    /** @type {CommandIo} */
    const commandIo = {
      name,
      args,
      stdin: io.stdin,
      out: io.out,
      err: io.err,
      tty: io.tty,
      signal: io.signal,
      shell: this,
    };
    if (io.signal.aborted) return 130;
    try {
      const builtin = this.builtins[name];
      if (builtin) return (await builtin.run(commandIo)) ?? 0;
      const external = this.external(name);
      if (external) return await external(commandIo);
      io.err(`nsh: ${this.t('err.notFound', { name })}\n`);
      return 127;
    } catch (error) {
      if (io.signal.aborted) return 130;
      const message = /** @type {Error} */ (error)?.message ?? String(error);
      io.err(error instanceof ShellError ? `${message}\n` : `${name}: ${message}\n`);
      return 1;
    }
  }
}
