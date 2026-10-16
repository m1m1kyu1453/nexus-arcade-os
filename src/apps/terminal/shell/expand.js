// @ts-check
// Word expansion: ~ (home), $VAR / ${VAR} / $? / $$, and globs (* ? [abc]) against the VFS.
// Variables are not split into several words (as if always quoted), which avoids the classic
// "file name with spaces" surprises. A glob that matches nothing stays as typed (like bash).

/** @typedef {import('./parse.js').Word} Word */

/**
 * @typedef {object} ExpandEnv
 * @property {Record<string, string>} vars
 * @property {string} home
 * @property {string} cwd
 * @property {(path: string) => Promise<{ name: string, type: string }[]>} list  folder contents
 */

/** A glob character that came from unquoted text. */
const GLOB = /[*?[]/;

/**
 * Expands one word into its value and (when it has unquoted glob characters) a glob pattern.
 * @param {Word} word
 * @param {ExpandEnv} env
 * @returns {{ value: string, pattern: string | null }}
 */
export function expandWord(word, env) {
  let value = '';
  /** Pattern with quoted glob characters escaped by "\". */
  let pattern = '';
  let globbing = false;
  word.parts.forEach((part, index) => {
    if (part.kind === 'var') {
      const v = env.vars[part.name] ?? '';
      value += v;
      pattern += escapeGlob(v);
      return;
    }
    let text = part.text;
    if (index === 0 && !part.quoted && (text === '~' || text.startsWith('~/'))) {
      value += env.home;
      pattern += escapeGlob(env.home);
      text = text.slice(1);
    }
    value += text;
    if (part.quoted) pattern += escapeGlob(text);
    else {
      pattern += text;
      if (GLOB.test(text)) globbing = true;
    }
  });
  return { value, pattern: globbing ? pattern : null };
}

/** @param {string} text */
const escapeGlob = (text) => text.replace(/[*?[\]\\]/g, '\\$&');

/**
 * Expands all words of a command into argv (globs become sorted matches).
 * @param {Word[]} words
 * @param {ExpandEnv} env
 */
export async function expandWords(words, env) {
  /** @type {string[]} */
  const argv = [];
  for (const word of words) {
    const { value, pattern } = expandWord(word, env);
    if (pattern === null) {
      argv.push(value);
      continue;
    }
    const matches = await glob(pattern, env);
    if (matches.length) argv.push(...matches);
    else argv.push(value);
  }
  return argv;
}

/**
 * Matches a glob pattern against the VFS. Relative patterns give relative results.
 * @param {string} pattern
 * @param {ExpandEnv} env
 * @returns {Promise<string[]>}
 */
export async function glob(pattern, env) {
  const absolute = pattern.startsWith('/');
  const segments = pattern.split('/').filter((s, i) => s !== '' || i === 0);
  if (absolute) segments.shift();
  /** @type {{ abs: string, shown: string }[]} */
  let current = [{ abs: absolute ? '/' : env.cwd, shown: absolute ? '/' : '' }];
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1;
    /** @type {{ abs: string, shown: string }[]} */
    const next = [];
    const join = (/** @type {string} */ base, /** @type {string} */ name) =>
      base === '/' ? `/${name}` : `${base}/${name}`;
    const show = (/** @type {string} */ base, /** @type {string} */ name) =>
      base === '' ? name : base === '/' ? `/${name}` : `${base}/${name}`;
    if (!GLOB.test(segment.replace(/\\./g, ''))) {
      // A literal segment: keep the candidates where it exists.
      const name = segment.replace(/\\(.)/g, '$1');
      for (const c of current) {
        const entries = await env.list(c.abs).catch(() => []);
        const entry = entries.find((e) => e.name === name);
        if (entry && (last || entry.type === 'folder'))
          next.push({ abs: join(c.abs, name), shown: show(c.shown, name) });
      }
    } else {
      const re = globToRegExp(segment);
      for (const c of current) {
        const entries = await env.list(c.abs).catch(() => []);
        for (const entry of entries) {
          if (entry.name.startsWith('.') && !segment.startsWith('.')) continue;
          if (!last && entry.type !== 'folder') continue;
          if (re.test(entry.name)) next.push({ abs: join(c.abs, entry.name), shown: show(c.shown, entry.name) });
        }
      }
    }
    current = next;
    if (!current.length) return [];
  }
  return current.map((c) => c.shown).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * One path segment of a glob as a RegExp (* ? [abc] [!abc] [a-z]; "\" escapes).
 * @param {string} segment
 */
export function globToRegExp(segment) {
  let re = '';
  for (let i = 0; i < segment.length; i++) {
    const c = /** @type {string} */ (segment[i]);
    if (c === '\\' && i + 1 < segment.length) {
      re += escapeRe(/** @type {string} */ (segment[++i]));
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const end = segment.indexOf(']', i + 2);
      if (end < 0) {
        re += '\\[';
        continue;
      }
      let set = segment.slice(i + 1, end);
      const negate = set.startsWith('!') || set.startsWith('^');
      if (negate) set = set.slice(1);
      re += `[${negate ? '^' : ''}${set.replace(/[\\\]]/g, '\\$&')}]`;
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
}

/** @param {string} c */
const escapeRe = (c) => c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
