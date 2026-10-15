import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger, toLogData } from '../../src/kernel/logger.js';

afterEach(() => vi.useRealTimers());

describe('logger', () => {
  it('records level, source, message and data with a timestamp', () => {
    const logger = createLogger({ now: () => 42 });
    logger.child('storage').warn('Quota low', { usedMb: 90 });
    expect(logger.entries()).toEqual([
      { t: 42, level: 'warn', source: 'storage', message: 'Quota low', data: { usedMb: 90 } },
    ]);
  });

  it('keeps only the newest entries (ring buffer)', () => {
    const logger = createLogger({ capacity: 3 });
    const log = logger.child('x');
    for (let i = 1; i <= 5; i++) log.info(`m${i}`);
    expect(logger.entries().map((e) => e.message)).toEqual(['m3', 'm4', 'm5']);
    expect(logger.size).toBe(3);
  });

  it('filters by minimum level, source (exact or prefix), time and limit', () => {
    let t = 0;
    const logger = createLogger({ now: () => ++t });
    logger.child('kernel').debug('a');
    logger.child('app:nexus.notes').info('b');
    logger.child('app:nexus.tasks').error('c');
    logger.child('kernel').warn('d');
    const msgs = (f) => logger.entries(f).map((e) => e.message);
    expect(msgs({ minLevel: 'warn' })).toEqual(['c', 'd']);
    expect(msgs({ source: 'kernel' })).toEqual(['a', 'd']);
    expect(msgs({ source: 'app:*' })).toEqual(['b', 'c']);
    expect(msgs({ since: 3 })).toEqual(['c', 'd']);
    expect(msgs({ limit: 2 })).toEqual(['c', 'd']);
  });

  it('notifies subscribers and survives a throwing one', () => {
    const logger = createLogger();
    const seen = vi.fn();
    logger.subscribe(() => {
      throw new Error('bad subscriber');
    });
    const unsub = logger.subscribe(seen);
    logger.child('x').info('hello');
    unsub();
    logger.child('x').info('again');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(logger.size).toBe(2);
  });

  it('persists debounced and restores saved entries before new ones', async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const logger = createLogger({ persist: { save, delayMs: 500 } });
    logger.child('x').info('one');
    logger.child('x').info('two');
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][0];
    expect(saved.map((e) => e.message)).toEqual(['one', 'two']);

    const next = createLogger({ capacity: 3 });
    next.child('x').info('three');
    next.restore([...saved, { bogus: true }]);
    expect(next.entries().map((e) => e.message)).toEqual(['one', 'two', 'three']);
  });

  it('flush() saves immediately', async () => {
    const save = vi.fn();
    const logger = createLogger({ persist: { save } });
    logger.child('x').error('crash');
    await logger.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('toLogData', () => {
  it('keeps Error details', () => {
    const data = toLogData({ error: new TypeError('nope') });
    expect(data.error).toMatchObject({ name: 'TypeError', message: 'nope' });
    expect(data.error.stack).toContain('nope');
  });

  it('handles circular references, bigint and very long strings', () => {
    const obj = { n: 10n, long: 'x'.repeat(5000) };
    obj.self = obj;
    const data = toLogData(obj);
    expect(data.self).toBe('[Circular]');
    expect(data.n).toBe('10n');
    expect(data.long.length).toBe(4001);
  });

  it('drops functions and returns undefined for undefined', () => {
    expect(toLogData({ fn() {}, a: 1 })).toEqual({ a: 1 });
    expect(toLogData(undefined)).toBeUndefined();
  });
});
