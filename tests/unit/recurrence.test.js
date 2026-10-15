import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  nextOccurrence,
  occurrences,
  occurrencesBetween,
  validateRule,
} from '../../src/services/scheduler/recurrence.js';

// Node applies TZ changes at runtime. Europe/Berlin switches to summer time on 2026-03-29
// (02:00 → 03:00) and back on 2026-10-25 (03:00 → 02:00).
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Europe/Berlin';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

/** Local wall-clock timestamp. */
const local = (y, m, d, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
/** Formats as local "YYYY-MM-DD HH:mm" for readable assertions. */
const fmt = (t) => {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const take = (rule, start, n) => {
  const out = [];
  for (const t of occurrences(rule, start)) {
    out.push(fmt(t));
    if (out.length === n) break;
  }
  return out;
};

describe('recurrence rules', () => {
  it('runs in the expected time zone', () => {
    expect(new Date(local(2026, 7, 1)).getTimezoneOffset()).toBe(-120);
    expect(new Date(local(2026, 1, 1)).getTimezoneOffset()).toBe(-60);
  });

  it('once', () => {
    expect(take({ freq: 'once' }, local(2026, 10, 15), 5)).toEqual(['2026-10-15 09:00']);
  });

  it('daily keeps the wall-clock time across both DST changes', () => {
    expect(take({ freq: 'daily' }, local(2026, 3, 28), 3)).toEqual([
      '2026-03-28 09:00',
      '2026-03-29 09:00',
      '2026-03-30 09:00',
    ]);
    expect(take({ freq: 'daily' }, local(2026, 10, 24, 23, 30), 3)).toEqual([
      '2026-10-24 23:30',
      '2026-10-25 23:30',
      '2026-10-26 23:30',
    ]);
    // Same wall-clock time, but only 23 real hours apart across the spring change.
    const gen = occurrences({ freq: 'daily' }, local(2026, 3, 28));
    const t1 = gen.next().value;
    const t2 = gen.next().value;
    expect((t2 - t1) / 3_600_000).toBe(23);
  });

  it('moves non-existent spring-forward times forward', () => {
    expect(take({ freq: 'daily' }, local(2026, 3, 28, 2, 30), 3)).toEqual([
      '2026-03-28 02:30',
      '2026-03-29 03:30',
      '2026-03-30 02:30',
    ]);
  });

  it('every N days, until and count', () => {
    expect(take({ freq: 'daily', interval: 3 }, local(2026, 1, 30), 3)).toEqual([
      '2026-01-30 09:00',
      '2026-02-02 09:00',
      '2026-02-05 09:00',
    ]);
    expect(take({ freq: 'daily', count: 2 }, local(2026, 1, 1), 10)).toHaveLength(2);
    expect(take({ freq: 'daily', until: local(2026, 1, 3) }, local(2026, 1, 1), 10)).toEqual([
      '2026-01-01 09:00',
      '2026-01-02 09:00',
      '2026-01-03 09:00',
    ]);
  });

  it('weekly on chosen weekdays, every other week', () => {
    // 2026-10-15 is a Thursday.
    expect(take({ freq: 'weekly', byWeekday: [1, 4] }, local(2026, 10, 15), 4)).toEqual([
      '2026-10-15 09:00',
      '2026-10-19 09:00',
      '2026-10-22 09:00',
      '2026-10-26 09:00',
    ]);
    expect(take({ freq: 'weekly', interval: 2 }, local(2026, 10, 15), 3)).toEqual([
      '2026-10-15 09:00',
      '2026-10-29 09:00',
      '2026-11-12 09:00',
    ]);
    expect(take({ freq: 'weekly', byWeekday: [2], count: 2 }, local(2026, 10, 15), 5)).toEqual([
      '2026-10-20 09:00',
      '2026-10-27 09:00',
    ]);
  });

  it('monthly clamps to the last day of shorter months', () => {
    expect(take({ freq: 'monthly' }, local(2026, 1, 31), 4)).toEqual([
      '2026-01-31 09:00',
      '2026-02-28 09:00',
      '2026-03-31 09:00',
      '2026-04-30 09:00',
    ]);
    expect(take({ freq: 'monthly', interval: 5 }, local(2026, 10, 15), 2)).toEqual([
      '2026-10-15 09:00',
      '2027-03-15 09:00',
    ]);
  });

  it('yearly on 29 February', () => {
    expect(take({ freq: 'yearly' }, local(2028, 2, 29), 5)).toEqual([
      '2028-02-29 09:00',
      '2029-02-28 09:00',
      '2030-02-28 09:00',
      '2031-02-28 09:00',
      '2032-02-29 09:00',
    ]);
  });

  it('finds the next occurrence after a time, or null when finished', () => {
    const rule = { freq: 'daily', count: 3 };
    const start = local(2026, 10, 1);
    expect(fmt(nextOccurrence(rule, start, local(2026, 10, 1, 12)))).toBe('2026-10-02 09:00');
    expect(fmt(nextOccurrence(rule, start, start - 1))).toBe('2026-10-01 09:00');
    expect(nextOccurrence(rule, start, local(2026, 10, 3, 9))).toBeNull();
    expect(occurrencesBetween({ freq: 'weekly' }, start, local(2026, 10, 7), local(2026, 10, 31)).map(fmt)).toEqual([
      '2026-10-08 09:00',
      '2026-10-15 09:00',
      '2026-10-22 09:00',
      '2026-10-29 09:00',
    ]);
  });

  it('validates rules', () => {
    expect(validateRule({ freq: 'daily' })).toBeNull();
    expect(validateRule({ freq: 'hourly' })).toMatch(/frequency/);
    expect(validateRule({ freq: 'daily', interval: 0 })).toMatch(/Interval/);
    expect(validateRule({ freq: 'daily', byWeekday: [1] })).toMatch(/weekly/);
    expect(validateRule({ freq: 'weekly', byWeekday: [7] })).toMatch(/Weekdays/);
    expect(validateRule({ freq: 'daily', count: 0 })).toMatch(/Count/);
    expect(() => occurrences({ freq: 'nope' }, 0).next()).toThrow();
  });

  it('works in a US time zone too (DST on 2026-03-08 and 2026-11-01)', () => {
    process.env.TZ = 'America/New_York';
    try {
      expect(take({ freq: 'daily' }, local(2026, 3, 7, 8), 3)).toEqual([
        '2026-03-07 08:00',
        '2026-03-08 08:00',
        '2026-03-09 08:00',
      ]);
      expect(take({ freq: 'weekly' }, local(2026, 10, 25, 8), 2)).toEqual(['2026-10-25 08:00', '2026-11-01 08:00']);
    } finally {
      process.env.TZ = 'Europe/Berlin';
    }
  });
});
