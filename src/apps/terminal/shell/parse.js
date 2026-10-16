// @ts-check
// Lexer and parser for the Nexus shell (a small POSIX-like language).
//
//   list     := andOr ((';' | newline) andOr)*
//   andOr    := pipeline (('&&' | '||') pipeline)*
//   pipeline := command ('|' command)*
//   command  := (word | redirect)+
//   redirect := ('>' | '>>' | '<' | '2>' | '2>>' | '2>&1') word
//
// Words keep how each part was quoted, so expansion (variables, ~, globs) can follow the usual
// rules: nothing expands inside '…', only $VAR inside "…", everything unquoted.

/**
 * @typedef {{ kind: 'text', text: string, quoted: boolean }
 *   | { kind: 'var', name: string, quoted: boolean }} Part
 * @typedef {{ type: 'word', parts: Part[] }} Word
 * @typedef {{ type: 'op', op: string }} Op
 * @typedef {Word | Op} Token
 *
 * @typedef {{ op: '>' | '>>' | '<' | '2>' | '2>>' | '2>&1', target: Word | null }} Redirect
 * @typedef {{ words: Word[], redirects: Redirect[] }} Command
 * @typedef {{ commands: Command[] }} Pipeline
 * @typedef {{ pipelines: Pipeline[], ops: ('&&' | '||')[] }} AndOr
 * @typedef {AndOr[]} Script
 */

export class ParseError extends Error {
  name = 'ParseError';
}

const OPERATORS = ['2>&1', '2>>', '&&', '||', '>>', '2>', '|', ';', '>', '<', '\n'];
const VAR_START = /[A-Za-z_]/;
const VAR_CHAR = /[A-Za-z0-9_]/;

/**
 * Splits a line into words and operators.
 * @param {string} source
 * @returns {Token[]}
 */
export function tokenize(source) {
  /** @type {Token[]} */
  const tokens = [];
  /** @type {Part[] | null} */
  let parts = null;
  let i = 0;

  const word = () => (parts ??= []);
  /** @param {string} text @param {boolean} quoted */
  const text = (text, quoted) => {
    const p = word();
    const last = p.at(-1);
    if (last?.kind === 'text' && last.quoted === quoted) last.text += text;
    else p.push({ kind: 'text', text, quoted });
  };
  const flush = () => {
    if (parts) tokens.push({ type: 'word', parts });
    parts = null;
  };
  /** Reads $NAME, ${NAME}, $? or $$ at `i` (pointing at '$'). @param {boolean} quoted */
  const variable = (quoted) => {
    const next = source[i + 1];
    if (next === '{') {
      const end = source.indexOf('}', i + 2);
      if (end < 0) throw new ParseError('Missing "}" after "${"');
      const name = source.slice(i + 2, end);
      if (!/^([A-Za-z_][A-Za-z0-9_]*|\?)$/.test(name)) throw new ParseError(`Bad variable name "\${${name}}"`);
      word().push({ kind: 'var', name, quoted });
      i = end + 1;
      return;
    }
    if (next === '?' || next === '$') {
      word().push({ kind: 'var', name: next, quoted });
      i += 2;
      return;
    }
    if (next && VAR_START.test(next)) {
      let j = i + 1;
      while (j < source.length && VAR_CHAR.test(/** @type {string} */ (source[j]))) j++;
      word().push({ kind: 'var', name: source.slice(i + 1, j), quoted });
      i = j;
      return;
    }
    text('$', quoted);
    i++;
  };

  while (i < source.length) {
    const c = /** @type {string} */ (source[i]);
    if (c === ' ' || c === '\t' || c === '\r') {
      flush();
      i++;
      continue;
    }
    if (c === '#' && !parts) {
      // Comment to the end of the line.
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '\\') {
      if (i + 1 >= source.length) throw new ParseError('Nothing to escape after "\\"');
      if (source[i + 1] === '\n')
        i += 2; // line continuation
      else {
        text(/** @type {string} */ (source[i + 1]), true);
        i += 2;
      }
      continue;
    }
    if (c === "'") {
      const end = source.indexOf("'", i + 1);
      if (end < 0) throw new ParseError('Missing closing single quote');
      text(source.slice(i + 1, end), true);
      word(); // '' is an empty word
      i = end + 1;
      continue;
    }
    if (c === '"') {
      word();
      i++;
      for (;;) {
        if (i >= source.length) throw new ParseError('Missing closing double quote');
        const d = /** @type {string} */ (source[i]);
        if (d === '"') {
          i++;
          break;
        }
        if (d === '\\' && i + 1 < source.length && '"\\$`\n'.includes(/** @type {string} */ (source[i + 1]))) {
          if (source[i + 1] !== '\n') text(/** @type {string} */ (source[i + 1]), true);
          i += 2;
        } else if (d === '$') variable(true);
        else {
          text(d, true);
          i++;
        }
      }
      continue;
    }
    if (c === '$') {
      variable(false);
      continue;
    }
    // "2>" is only an operator at the start of a word.
    const op = OPERATORS.find((o) => source.startsWith(o, i) && (!o.startsWith('2') || !parts));
    if (op) {
      flush();
      tokens.push({ type: 'op', op });
      i += op.length;
      continue;
    }
    text(c, false);
    i++;
  }
  flush();
  return tokens;
}

/**
 * Parses a line (or a whole script) into a list of and-or chains.
 * @param {string} source
 * @returns {Script}
 */
export function parse(source) {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (/** @type {string} */ op) => {
    const t = peek();
    return t?.type === 'op' && t.op === op;
  };

  /** @returns {Command} */
  function command() {
    /** @type {Command} */
    const cmd = { words: [], redirects: [] };
    for (;;) {
      const t = peek();
      if (!t) break;
      if (t.type === 'word') {
        cmd.words.push(t);
        pos++;
        continue;
      }
      if (['>', '>>', '<', '2>', '2>>', '2>&1'].includes(t.op)) {
        pos++;
        if (t.op === '2>&1') {
          cmd.redirects.push({ op: '2>&1', target: null });
          continue;
        }
        const target = peek();
        if (target?.type !== 'word') throw new ParseError(`Expected a file name after "${t.op}"`);
        pos++;
        cmd.redirects.push({ op: /** @type {Redirect['op']} */ (t.op), target });
        continue;
      }
      break;
    }
    if (!cmd.words.length && !cmd.redirects.length) {
      const t = peek();
      throw new ParseError(
        t?.type === 'op' ? `Unexpected "${t.op === '\n' ? 'newline' : t.op}"` : 'Expected a command',
      );
    }
    return cmd;
  }

  /** @returns {Pipeline} */
  function pipeline() {
    const commands = [command()];
    while (isOp('|')) {
      pos++;
      skipNewlines();
      commands.push(command());
    }
    return { commands };
  }

  /** @returns {AndOr} */
  function andOr() {
    const pipelines = [pipeline()];
    /** @type {AndOr['ops']} */
    const ops = [];
    while (isOp('&&') || isOp('||')) {
      ops.push(/** @type {'&&' | '||'} */ (/** @type {Op} */ (peek()).op));
      pos++;
      skipNewlines();
      pipelines.push(pipeline());
    }
    return { pipelines, ops };
  }

  function skipNewlines() {
    while (isOp('\n')) pos++;
  }

  /** @type {Script} */
  const script = [];
  for (;;) {
    while (isOp(';') || isOp('\n')) pos++;
    if (pos >= tokens.length) break;
    script.push(andOr());
    const t = peek();
    if (t && !(t.type === 'op' && (t.op === ';' || t.op === '\n'))) {
      throw new ParseError(`Unexpected "${t.type === 'op' ? t.op : wordText(t)}"`);
    }
  }
  return script;
}

/** Literal text of a word (variables shown as $NAME), for messages and completion. @param {Word} word */
export function wordText(word) {
  return word.parts.map((p) => (p.kind === 'text' ? p.text : `$${p.name}`)).join('');
}

/**
 * Quotes a string so the shell reads it back as one word (for completion and history).
 * @param {string} value
 */
export function quote(value) {
  if (value === '') return "''";
  if (/^[\w@%+=:,./~-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
