import { describe, expect, it } from 'vitest';
import { firstDayOfWeek, monthGrid } from '../../src/shell/widgets/builtin/calendar.js';
import { countdown } from '../../src/shell/widgets/builtin/countdown.js';

describe('calendar widget math', () => {
  it('builds full weeks starting on the locale’s first weekday', () => {
    // October 2026 starts on a Thursday.
    const monday = monthGrid(2026, 9, 1);
    expect(monday[0][0].toDateString()).toBe(new Date(2026, 8, 28).toDateString());
    expect(monday.at(-1)?.at(-1)?.toDateString()).toBe(new Date(2026, 10, 1).toDateString());
    expect(monday).toHaveLength(5);

    const sunday = monthGrid(2026, 9, 7);
    expect(sunday[0][0].toDateString()).toBe(new Date(2026, 8, 27).toDateString());
    expect(sunday.every((week) => week.length === 7)).toBe(true);
  });

  it('knows Monday-first and Sunday-first locales', () => {
    expect(firstDayOfWeek('de')).toBe(1);
    expect(firstDayOfWeek('en-US')).toBe(7);
  });
});

describe('countdown widget math', () => {
  const now = new Date(2026, 9, 15, 18, 0);
  it('counts whole days and hours to local midnight of the date', () => {
    expect(countdown('2026-10-20', now)).toEqual({ days: 4, hours: 6, past: false, today: false });
    expect(countdown('2026-10-16', now)).toEqual({ days: 0, hours: 6, past: false, today: false });
  });
  it('reports today and past dates', () => {
    expect(countdown('2026-10-15', now)).toMatchObject({ today: true });
    expect(countdown('2026-10-10', now)).toEqual({ days: 5, hours: 0, past: true, today: false });
  });
  it('rejects malformed dates', () => {
    expect(countdown('', now)).toBeNull();
    expect(countdown('15.10.2026', now)).toBeNull();
  });
});
