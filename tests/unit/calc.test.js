import { describe, expect, it } from 'vitest';
import { evaluate, formatResult } from '../../src/ui/calc.js';

describe('palette calculator', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['2 ** 10', 1024],
    ['-2 ^ 2', -4], // like maths notation: -(2²)
    ['10 / 4', 2.5],
    ['10 % 4', 2],
    ['200 * 15%', 30],
    ['1,5 * 2', 3],
    ['0xff + 0b101 + 0o10', 268],
    ['1e3 / 8', 125],
    ['sqrt(16) + abs(-3)', 7],
    ['max(1; 7; 3)', 7],
    ['2pi', 2 * Math.PI],
    ['3(4 + 1)', 15],
    ['round(2.5)', 3],
    ['12 × 3 ÷ 4', 9],
  ])('%s = %s', (expr, expected) => {
    expect(evaluate(expr)).toBeCloseTo(expected, 10);
  });

  it.each(['', '1 +', '(1', 'foo(2)', 'alert(1)', '1/0', 'constructor', '2 3 +'])('rejects %j', (expr) => {
    expect(evaluate(expr)).toBeNull();
  });

  it('formats results without floating-point noise', () => {
    const fmt = (n, o) => new Intl.NumberFormat('en', o).format(n);
    expect(formatResult(0.1 + 0.2, fmt)).toBe('0.3');
    expect(formatResult(1234567.891, fmt)).toBe('1,234,567.891');
    expect(formatResult(1e20, fmt)).toBe('1.000000e+20');
    expect(formatResult(evaluate('1/3'), (n, o) => new Intl.NumberFormat('de', o).format(n))).toBe('0,3333333333');
  });
});
