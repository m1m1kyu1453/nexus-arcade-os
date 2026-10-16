import { describe, expect, it } from 'vitest';
import { builtins } from '../../src/apps/terminal/commands/index.js';
import { columns, parseArgs, stripAnsi } from '../../src/apps/terminal/commands/util.js';
import { glob, globToRegExp } from '../../src/apps/terminal/shell/expand.js';
import { parse, ParseError, quote, tokenize } from '../../src/apps/terminal/shell/parse.js';
import { Shell } from '../../src/apps/terminal/shell/shell.js';
import { createEventBus } from '../../src/kernel/bus.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { createVfs, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';

const words = (line) =>
  tokenize(line).map((t) =>
    t.type === 'op' ? t.op : t.parts.map((p) => (p.kind === 'var' ? `$${p.name}` : p.text)).join(''),
  );

describe('shell parser', () => {
  it('splits words, honours quotes and escapes', () => {
    expect(words(`echo 'a b' "c $X d" e\\ f g'h'"i"`)).toEqual(['echo', 'a b', 'c $X d', 'e f', 'ghi']);
    expect(words(`echo '' ""`)).toEqual(['echo', '', '']);
    expect(words('echo a # comment')).toEqual(['echo', 'a']);
    expect(words('echo a#b')).toEqual(['echo', 'a#b']);
  });

  it('recognises operators, including 2> only at a word start', () => {
    expect(words('a|b&&c||d;e>f>>g<h 2>i 2>&1')).toEqual([
      'a',
      '|',
      'b',
      '&&',
      'c',
      '||',
      'd',
      ';',
      'e',
      '>',
      'f',
      '>>',
      'g',
      '<',
      'h',
      '2>',
      'i',
      '2>&1',
    ]);
    expect(words('echo x2>y')).toEqual(['echo', 'x2', '>', 'y']);
  });

  it('builds and-or chains of pipelines', () => {
    const [chain] = parse('ls -l | grep x && echo ok || echo no');
    expect(chain.pipelines).toHaveLength(3);
    expect(chain.ops).toEqual(['&&', '||']);
    expect(chain.pipelines[0].commands).toHaveLength(2);
    expect(parse('a; b\nc')).toHaveLength(3);
  });

  it('reports syntax errors', () => {
    expect(() => parse('echo "open')).toThrow(ParseError);
    expect(() => parse("echo 'open")).toThrow(ParseError);
    expect(() => parse('| grep')).toThrow(/Unexpected "\|"/);
    expect(() => parse('echo >')).toThrow(/file name/);
    expect(() => parse('echo ${1x}')).toThrow(/variable/);
  });

  it('quotes values so they read back as one word', () => {
    expect(quote('plain.txt')).toBe('plain.txt');
    expect(quote('my file')).toBe("'my file'");
    expect(words(`x ${quote("it's")}`)).toEqual(['x', "it's"]);
  });
});

describe('globs and option parsing', () => {
  it('turns glob segments into regexps', () => {
    expect(globToRegExp('*.md').test('a.md')).toBe(true);
    expect(globToRegExp('*.md').test('a.mdx')).toBe(false);
    expect(globToRegExp('file?.[ch]').test('file1.c')).toBe(true);
    expect(globToRegExp('[!a]*').test('apple')).toBe(false);
    expect(globToRegExp('\\*').test('*')).toBe(true);
  });

  it('parses combined, valued and long options', () => {
    expect(parseArgs(['-la', 'x'], { flags: { l: 'long', a: 'all' } })).toEqual({
      opts: { long: true, all: true },
      rest: ['x'],
    });
    expect(parseArgs(['-n5', '--lines=7', 'f'], { values: { n: 'n', lines: 'lines' } }).opts).toEqual({
      n: '5',
      lines: '7',
    });
    expect(parseArgs(['-3'], { numberAs: 'n' }).opts).toEqual({ n: '3' });
    expect(parseArgs(['--', '-x'], {}).rest).toEqual(['-x']);
    expect(() => parseArgs(['-z'], {})).toThrow(/unknown option -z/);
  });

  it('lays out columns', () => {
    expect(columns(['a', 'bb', 'ccc', 'd'], 12)).toBe('a   ccc\nbb  d\n');
    expect(columns(['a', 'b'], 80)).toBe('a  b\n');
  });
});

async function setup() {
  const db = await createIdbEngine().open('profile', VFS_STORE_SCHEMA);
  const vfs = createVfs({ db, bus: createEventBus(), user: 'ada' });
  await vfs.init();
  await vfs.writeFile('/home/ada/Documents/notes.md', '# Notes\nbuy milk\nbuy bread\ncall Bob\n');
  await vfs.writeFile('/home/ada/Documents/todo.txt', 'b\na\nc\na\n');
  await vfs.writeFile('/home/ada/Documents/sub/deep.md', 'Milk shake\n', { createParents: true });
  const cleared = [];
  const shell = new Shell({
    fs: vfs,
    home: '/home/ada',
    user: 'ada',
    builtins,
    ui: { clear: () => cleared.push(true), columns: () => 80, history: () => ['ls', 'pwd'] },
  });
  /** Runs a line, returning stdout, stderr and status. */
  const run = async (line) => {
    let out = '';
    let err = '';
    const status = await shell.run(line, { out: (t) => (out += t), err: (t) => (err += t) });
    return { out: stripAnsi(out), err, status };
  };
  return { vfs, shell, run, cleared };
}

describe('shell interpreter', () => {
  it('runs commands, pipes and redirections', async () => {
    const { run, vfs } = await setup();
    expect((await run('cd Documents && pwd')).out).toBe('/home/ada/Documents\n');
    expect((await run('cat todo.txt | sort | uniq -c')).out).toBe('      2 a\n      1 b\n      1 c\n');
    expect((await run('grep -i milk notes.md sub/deep.md')).out).toBe('notes.md:buy milk\nsub/deep.md:Milk shake\n');
    await run('echo hello > out.txt; echo world >> out.txt');
    expect(await vfs.readText('/home/ada/Documents/out.txt')).toBe('hello\nworld\n');
    expect((await run('wc -l < notes.md')).out.trim()).toBe('4');
    expect((await run('head -n 2 notes.md | tail -1')).out).toBe('buy milk\n');
  });

  it('expands variables, ~, $? and globs', async () => {
    const { run } = await setup();
    await run('export NAME="Ada L"');
    expect((await run('echo "hi $NAME" ~ ${NAME}x')).out).toBe('hi Ada L /home/ada Ada Lx\n');
    await run('false');
    expect((await run('echo $?')).out).toBe('1\n');
    expect((await run('cd Documents; echo *.md sub/*')).out).toBe('notes.md sub/deep.md\n');
    expect((await run('echo nomatch*')).out).toBe('nomatch*\n');
    expect((await run("echo '*.md'")).out).toBe('*.md\n');
  });

  it('chains with && and || by exit status', async () => {
    const { run } = await setup();
    expect((await run('false && echo no || echo yes')).out).toBe('yes\n');
    expect((await run('true && echo ok')).out).toBe('ok\n');
    const missing = await run('nope');
    expect(missing.status).toBe(127);
    expect(missing.err).toContain('err.notFound');
  });

  it('supports aliases and assignments', async () => {
    const { run, shell } = await setup();
    await run("alias greet='echo hello'");
    expect((await run('greet world')).out).toBe('hello world\n');
    await run('X=1 Y=2');
    expect(shell.env.X).toBe('1');
    expect((await run('alias greet')).out).toBe("alias greet='echo hello'\n");
  });

  it('manages files: mkdir -p, touch, cp -r, mv, rm (to trash), find, tree', async () => {
    const { run, vfs } = await setup();
    await run('mkdir -p a/b/c && touch a/b/c/x.txt');
    expect(await vfs.exists('/home/ada/a/b/c/x.txt')).toBe(true);
    expect((await run('cp a a2')).status).toBe(1); // folders need -r
    await run('cp -r a a2 && mv a2/b a2/renamed');
    expect(await vfs.exists('/home/ada/a2/renamed/c/x.txt')).toBe(true);
    expect((await run('find a2 -name "*.txt"')).out).toBe('a2/renamed/c/x.txt\n');
    expect((await run('find . -type d -name c')).out).toBe('./a/b/c\n./a2/renamed/c\n');
    await run('rm -r a2');
    expect(await vfs.exists('/home/ada/a2')).toBe(false);
    expect((await vfs.listTrash()).map((n) => n.trash.originalPath)).toContain('/home/ada/a2');
    expect((await run('tree a')).out).toBe('a\n└── b/\n    └── c/\n        └── x.txt\n\nout.treeSummary\n');
  });

  it('lists files with ls', async () => {
    const { run } = await setup();
    expect((await run('ls Documents')).out).toBe('sub/  notes.md  todo.txt\n');
    expect((await run('ls -1 Documents')).out).toBe('sub/\nnotes.md\ntodo.txt\n');
    const long = (await run('ls -l Documents')).out.split('\n');
    expect(long[1]).toMatch(/^-rw\s+\d+\s+.+notes\.md$/);
    expect((await run('ls missing')).status).toBe(1);
  });

  it('reports errors with a non-zero status', async () => {
    const { run } = await setup();
    const r = await run('cat nothing.txt');
    expect(r.status).toBe(1);
    expect(r.err).toContain('err.noEntry');
    expect((await run('cd Documents/notes.md')).err).toContain('err.notFolder');
    expect((await run('grep -z x')).err).toMatch(/unknown option -z/);
    expect((await run('grep "(" Documents/notes.md')).err).toContain('err.badRegex');
  });

  it('calculates, prints the calendar and clears', async () => {
    const { run, cleared } = await setup();
    expect((await run('calc 2^10 + 1')).out).toBe('1,025\n');
    expect((await run('cal 2 2026')).out.split('\n')[1].trim().split(/\s+/)).toHaveLength(7);
    await run('clear');
    expect(cleared).toHaveLength(1);
    expect((await run('history')).out).toBe('  1  ls\n  2  pwd\n');
  });

  it('stops a running command when aborted', async () => {
    const { shell } = await setup();
    const controller = new AbortController();
    const running = shell.run('sleep 30 && echo done', { out: () => {}, err: () => {}, signal: controller.signal });
    controller.abort();
    expect(await running).toBe(130);
  });
});

describe('glob against the VFS', () => {
  it('matches across folders and hides dot-files', async () => {
    const { vfs } = await setup();
    await vfs.writeFile('/home/ada/Documents/.hidden.md', '');
    const env = { vars: {}, home: '/home/ada', cwd: '/home/ada', list: (p) => vfs.list(p) };
    expect(await glob('Documents/*.md', env)).toEqual(['Documents/notes.md']);
    expect(await glob('Documents/.*', env)).toEqual(['Documents/.hidden.md']);
    expect(await glob('/home/ada/*/sub', env)).toEqual(['/home/ada/Documents/sub']);
  });
});
