// @ts-check
// `when` conditions for commands, e.g. "appFocused && focusedApp == 'nexus.notes' && !inputFocused".
// A tiny parser + evaluator (no eval). Grammar:
//   expr  := or
//   or    := and ('||' and)*
//   and   := not ('&&' not)*
//   not   := '!' not | cmp
//   cmp   := atom (('==' | '!=') atom)?
//   atom  := identifier | 'string' | number | true | false | '(' expr ')'

/** @typedef {Record<string, unknown>} WhenContext */
/** @typedef {(ctx: WhenContext) => unknown} Evaluator */

/** @param {string} source */
function tokenize(source) {
  /** @type {{ type: string, value: string }[]} */
  const tokens = [];
  const re = /\s*(?:(&&|\|\||==|!=|[!()])|'([^']*)'|"([^"]*)"|(-?\d+(?:\.\d+)?)|([A-Za-z_][\w.]*))/y;
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(source);
    if (!m) throw new SyntaxError(`Unexpected "${source.slice(i, i + 10)}" in when-clause "${source}"`);
    if (m[1]) tokens.push({ type: 'op', value: m[1] });
    else if (m[2] !== undefined || m[3] !== undefined) tokens.push({ type: 'str', value: m[2] ?? m[3] });
    else if (m[4]) tokens.push({ type: 'num', value: m[4] });
    else tokens.push({ type: 'id', value: m[5] });
    i = re.lastIndex;
  }
  return tokens;
}

/** @type {Map<string, Evaluator>} */
const cache = new Map();

/**
 * Compiles a when-clause (cached). Throws SyntaxError for invalid clauses.
 * @param {string} source
 * @returns {Evaluator}
 */
export function compileWhen(source) {
  const cached = cache.get(source);
  if (cached) return cached;
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  /** @param {string} value */
  const accept = (value) => {
    if (peek()?.type === 'op' && peek().value === value) {
      pos++;
      return true;
    }
    return false;
  };

  /** @returns {Evaluator} */
  function or() {
    let left = and();
    while (accept('||')) {
      const l = left;
      const r = and();
      left = (c) => l(c) || r(c);
    }
    return left;
  }
  /** @returns {Evaluator} */
  function and() {
    let left = not();
    while (accept('&&')) {
      const l = left;
      const r = not();
      left = (c) => l(c) && r(c);
    }
    return left;
  }
  /** @returns {Evaluator} */
  function not() {
    if (accept('!')) {
      const inner = not();
      return (c) => !inner(c);
    }
    return cmp();
  }
  /** @returns {Evaluator} */
  function cmp() {
    const left = atom();
    if (accept('==')) {
      const right = atom();
      return (c) => left(c) === right(c);
    }
    if (accept('!=')) {
      const right = atom();
      return (c) => left(c) !== right(c);
    }
    return left;
  }
  /** @returns {Evaluator} */
  function atom() {
    if (accept('(')) {
      const inner = or();
      if (!accept(')')) throw new SyntaxError(`Missing ")" in when-clause "${source}"`);
      return inner;
    }
    const token = tokens[pos++];
    if (!token) throw new SyntaxError(`Unexpected end of when-clause "${source}"`);
    if (token.type === 'str') return () => token.value;
    if (token.type === 'num') return () => Number(token.value);
    if (token.type === 'id') {
      if (token.value === 'true') return () => true;
      if (token.value === 'false') return () => false;
      return (c) => (Object.hasOwn(c, token.value) ? c[token.value] : undefined);
    }
    throw new SyntaxError(`Unexpected "${token.value}" in when-clause "${source}"`);
  }

  const evaluator = or();
  if (pos !== tokens.length) throw new SyntaxError(`Unexpected "${tokens[pos].value}" in when-clause "${source}"`);
  cache.set(source, evaluator);
  return evaluator;
}

/**
 * @param {string | undefined} source
 * @param {WhenContext} context
 */
export function evaluateWhen(source, context) {
  if (!source) return true;
  return !!compileWhen(source)(context);
}
