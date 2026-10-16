// @ts-check
// Safe calculator (no eval), shared by the command palette's "=" mode and apps (Terminal `calc`).
// Supports numbers (decimal, 1e3, 0x/0b/0o), + - * / % ^ (power, right-associative), parentheses,
// unary minus, the constants pi, e, tau and the functions below. Returns null for anything it
// can't parse.

/** @type {Record<string, (...args: number[]) => number>} */
const FUNCTIONS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
};
/** @type {Record<string, number>} */
const CONSTANTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

/** @typedef {{ type: 'num', value: number } | { type: 'op', value: string } | { type: 'id', value: string } | { type: 'paren', value: '(' | ')' } | { type: 'comma' }} Token */

/** @param {string} source @returns {Token[] | null} */
function tokenize(source) {
  /** @type {Token[]} */
  const tokens = [];
  const re =
    /\s*(?:(0x[0-9a-f]+|0b[01]+|0o[0-7]+)|(\d+(?:[.,]\d+)?(?:e[+-]?\d+)?|[.,]\d+)|([a-z]\w*)|(\*\*|[-+*/%^×÷])|([()])|(;))/iy;
  let i = 0;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(source);
    if (!m) return null;
    if (m[1]) tokens.push({ type: 'num', value: Number(m[1].toLowerCase()) });
    else if (m[2]) tokens.push({ type: 'num', value: Number(m[2].replace(',', '.')) });
    else if (m[3]) tokens.push({ type: 'id', value: m[3].toLowerCase() });
    else if (m[4]) tokens.push({ type: 'op', value: { '**': '^', '×': '*', '÷': '/' }[m[4]] ?? m[4] });
    else if (m[5]) tokens.push({ type: 'paren', value: /** @type {'(' | ')'} */ (m[5]) });
    else tokens.push({ type: 'comma' });
    i = re.lastIndex;
  }
  return tokens;
}

/**
 * Evaluates an expression. Commas are decimal separators (German "1,5"); separate function
 * arguments with ";" ("max(1; 2)").
 * @param {string} source
 * @returns {number | null}
 */
export function evaluate(source) {
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];

  /** expr := term (('+' | '-') term)* */
  function expr() {
    let value = term();
    while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = /** @type {{ value: string }} */ (tokens[pos++]).value;
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }
  /** term := power (('*' | '/' | '%') power)* — also implicit multiplication: 2pi, 3(4) */
  function term() {
    let value = unary();
    for (;;) {
      const t = peek();
      if (t?.type === 'op' && ['*', '/', '%'].includes(/** @type {string} */ (t.value))) {
        pos++;
        const right = unary();
        value = t.value === '*' ? value * right : t.value === '/' ? value / right : value % right;
      } else if (t && (t.type === 'num' || t.type === 'id' || (t.type === 'paren' && t.value === '('))) {
        value *= unary();
      } else return value;
    }
  }
  /** unary := ('-' | '+') unary | power */
  function unary() {
    const t = peek();
    if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
      pos++;
      const v = unary();
      return t.value === '-' ? -v : v;
    }
    return power();
  }
  /** power := atom ('^' unary)? (right-associative) */
  function power() {
    const base = atom();
    const t = peek();
    if (t?.type === 'op' && t.value === '^') {
      pos++;
      return base ** unary();
    }
    return base;
  }
  function atom() {
    const t = tokens[pos++];
    if (!t) throw new Error('end');
    if (t.type === 'num') {
      // Postfix percent: "20%" → 0.2 when not followed by an operand.
      const next = peek();
      if (next?.type === 'op' && next.value === '%' && !isOperand(tokens[pos + 1])) {
        pos++;
        return t.value / 100;
      }
      return t.value;
    }
    if (t.type === 'paren' && t.value === '(') {
      const v = expr();
      expectParen(')');
      return v;
    }
    if (t.type === 'id') {
      if (t.value in CONSTANTS) return CONSTANTS[t.value];
      const fn = FUNCTIONS[t.value];
      if (!fn) throw new Error(`unknown ${t.value}`);
      expectParen('(');
      const args = [expr()];
      while (peek()?.type === 'comma') {
        pos++;
        args.push(expr());
      }
      expectParen(')');
      return fn(...args);
    }
    throw new Error('unexpected');
  }
  /** @param {Token | undefined} t */
  function isOperand(t) {
    return !!t && (t.type === 'num' || t.type === 'id' || (t.type === 'paren' && t.value === '('));
  }
  /** @param {'(' | ')'} p */
  function expectParen(p) {
    const t = tokens[pos++];
    if (t?.type !== 'paren' || t.value !== p) throw new Error(`expected ${p}`);
  }

  try {
    const value = expr();
    if (pos !== tokens.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Readable result: rounds floating-point noise (0.1 + 0.2 → 0.3).
 * @param {number} value
 * @param {(n: number, options?: Intl.NumberFormatOptions) => string} formatNumber
 */
export function formatResult(value, formatNumber) {
  const rounded = Number(value.toPrecision(12));
  return Math.abs(rounded) >= 1e15 || (rounded !== 0 && Math.abs(rounded) < 1e-9)
    ? rounded.toExponential(6)
    : formatNumber(rounded, { maximumFractionDigits: 10 });
}
