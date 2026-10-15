// @ts-check
// Recurrence rules in local wall-clock time. "Every day at 09:00" stays at 09:00 across DST
// changes because dates are built with local Date components, not by adding milliseconds.
//
// Edge cases (documented choices):
// - Monthly on the 29th–31st falls on the month's last day in shorter months.
// - Yearly on 29 February falls on 28 February in non-leap years.
// - A wall-clock time that doesn't exist (skipped by the spring DST change, e.g. 02:30) is
//   moved forward by the browser to the next valid time (03:30).

/**
 * @typedef {object} Rule
 * @property {'once' | 'daily' | 'weekly' | 'monthly' | 'yearly'} freq
 * @property {number} [interval]     every N days/weeks/months/years (default 1)
 * @property {number[]} [byWeekday]  weekly only: 0 = Sunday … 6 = Saturday (default: start's weekday)
 * @property {number} [until]        last allowed occurrence (timestamp, inclusive)
 * @property {number} [count]        total number of occurrences, counting the first
 */

const MAX_STEPS = 100_000;

/** @param {number} year @param {number} month 0-based */
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Validates a rule; returns an error message or null.
 * @param {Rule} rule
 */
export function validateRule(rule) {
  if (!rule || !['once', 'daily', 'weekly', 'monthly', 'yearly'].includes(rule.freq)) return 'Unknown frequency';
  if (
    rule.interval !== undefined &&
    !(Number.isInteger(rule.interval) && rule.interval >= 1 && rule.interval <= 1000)
  ) {
    return 'Interval must be a whole number from 1 to 1000';
  }
  if (rule.byWeekday !== undefined) {
    if (rule.freq !== 'weekly') return 'Weekdays only apply to weekly rules';
    if (
      !Array.isArray(rule.byWeekday) ||
      !rule.byWeekday.length ||
      rule.byWeekday.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      return 'Weekdays must be numbers from 0 (Sunday) to 6 (Saturday)';
    }
  }
  if (rule.count !== undefined && !(Number.isInteger(rule.count) && rule.count >= 1)) return 'Count must be at least 1';
  if (rule.until !== undefined && !Number.isFinite(rule.until)) return 'Until must be a date';
  return null;
}

/**
 * All occurrences in order (lazily), starting with `start` itself when it matches the rule.
 * @param {Rule} rule
 * @param {number} start timestamp of the first occurrence (defines the wall-clock time)
 * @returns {Generator<number>}
 */
export function* occurrences(rule, start) {
  const error = validateRule(rule);
  if (error) throw new Error(error);
  const s = new Date(start);
  const [y, mo, d, h, mi, sec, ms] = [
    s.getFullYear(),
    s.getMonth(),
    s.getDate(),
    s.getHours(),
    s.getMinutes(),
    s.getSeconds(),
    s.getMilliseconds(),
  ];
  const interval = rule.interval ?? 1;
  let produced = 0;
  /** @param {number} t */
  const accept = (t) =>
    (rule.until === undefined || t <= rule.until) && (rule.count === undefined || produced < rule.count);

  if (rule.freq === 'once') {
    if (accept(start)) yield start;
    return;
  }

  if (rule.freq === 'weekly') {
    const days = [...new Set(rule.byWeekday ?? [s.getDay()])].sort((a, b) => a - b);
    // Weeks start on Sunday here only for arithmetic; which days fire is set by `days`.
    const weekStart = d - s.getDay();
    for (let week = 0; week < MAX_STEPS; week += interval) {
      for (const day of days) {
        const t = new Date(y, mo, weekStart + week * 7 + day, h, mi, sec, ms).getTime();
        if (t < start) continue;
        if (!accept(t)) return;
        produced++;
        yield t;
      }
    }
    return;
  }

  for (let k = 0; k < MAX_STEPS; k++) {
    let t;
    if (rule.freq === 'daily') {
      t = new Date(y, mo, d + k * interval, h, mi, sec, ms).getTime();
    } else if (rule.freq === 'monthly') {
      const target = new Date(y, mo + k * interval, 1);
      const day = Math.min(d, daysInMonth(target.getFullYear(), target.getMonth()));
      t = new Date(target.getFullYear(), target.getMonth(), day, h, mi, sec, ms).getTime();
    } else {
      const year = y + k * interval;
      const day = Math.min(d, daysInMonth(year, mo));
      t = new Date(year, mo, day, h, mi, sec, ms).getTime();
    }
    if (!accept(t)) return;
    produced++;
    yield t;
  }
}

/**
 * First occurrence strictly after `after`, or null when the rule has ended.
 * @param {Rule} rule
 * @param {number} start
 * @param {number} after
 */
export function nextOccurrence(rule, start, after) {
  for (const t of occurrences(rule, start)) if (t > after) return t;
  return null;
}

/**
 * Occurrences within [from, to] (for calendars), at most `limit`.
 * @param {Rule} rule
 * @param {number} start
 * @param {number} from
 * @param {number} to
 * @param {number} [limit]
 */
export function occurrencesBetween(rule, start, from, to, limit = 1000) {
  /** @type {number[]} */
  const out = [];
  for (const t of occurrences(rule, start)) {
    if (t > to || out.length >= limit) break;
    if (t >= from) out.push(t);
  }
  return out;
}
