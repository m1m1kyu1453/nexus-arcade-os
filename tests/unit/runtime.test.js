import { describe, expect, it, vi } from 'vitest';
import { createBoundary, createCrashReport, formatCrashReport } from '../../src/kernel/error-boundary.js';
import { createRuntime } from '../../src/kernel/runtime.js';
import { createFakeClock } from '../helpers/fake-clock.js';

function setup() {
  const onCrash = vi.fn();
  const boundary = createBoundary({ onCrash });
  const clock = createFakeClock();
  const runtime = createRuntime({ boundary, clock });
  return { onCrash, boundary, clock, runtime };
}

describe('error boundary', () => {
  it('reports sync throws and async rejections once', async () => {
    const { boundary, onCrash } = setup();
    const sync = boundary.wrap(() => {
      throw new Error('sync');
    }, 'event');
    sync();
    const asyncFn = boundary.wrap(async () => {
      throw new Error('async');
    });
    await asyncFn();
    expect(onCrash).toHaveBeenCalledTimes(1);
    expect(onCrash).toHaveBeenCalledWith(expect.objectContaining({ message: 'sync' }), 'event');
    expect(boundary.tripped).toBe(true);
  });

  it('reports async rejections', async () => {
    const { boundary, onCrash } = setup();
    await boundary.wrap(async () => {
      throw new Error('later');
    }, 'event')();
    expect(onCrash).toHaveBeenCalledWith(expect.objectContaining({ message: 'later' }), 'event');
  });

  it('passes through return values and `this`', () => {
    const { boundary } = setup();
    const obj = {
      x: 2,
      double: boundary.wrap(function () {
        return this.x * 2;
      }),
    };
    expect(obj.double()).toBe(4);
  });

  it('run() returns ok/value or reports', async () => {
    const { boundary, onCrash } = setup();
    expect(await boundary.run(async () => 5, 'mount')).toEqual({ ok: true, value: 5 });
    expect(
      await boundary.run(() => {
        throw new Error('x');
      }, 'mount'),
    ).toEqual({ ok: false });
    expect(onCrash).toHaveBeenCalledWith(expect.any(Error), 'mount');
  });

  it('builds and formats crash reports', () => {
    const report = createCrashReport({
      manifest: { id: 'nexus.notes', version: '1.2.0' },
      instanceId: 'nexus.notes#1',
      error: new TypeError('x is undefined'),
      source: 'event',
      os: 'Nexus 0.1.0 (web)',
      now: Date.UTC(2026, 9, 15),
      recentLog: [{ t: Date.UTC(2026, 9, 15), level: 'warn', source: 'app:nexus.notes', message: 'hmm' }],
    });
    expect(report).toMatchObject({
      appId: 'nexus.notes',
      name: 'TypeError',
      message: 'x is undefined',
      source: 'event',
    });
    const text = formatCrashReport(report);
    expect(text).toContain('App: nexus.notes 1.2.0 (instance nexus.notes#1)');
    expect(text).toContain('TypeError: x is undefined');
    expect(text).toContain('WARN  [app:nexus.notes] hmm');
    expect(
      createCrashReport({ ...report, manifest: { id: 'a', version: '1' }, error: { code: 1 }, recentLog: [], os: '' })
        .message,
    ).toBe('{"code":1}');
  });
});

describe('instance runtime', () => {
  it('runs timeouts and pauses them with their remaining time', () => {
    const { runtime, clock } = setup();
    const fn = vi.fn();
    runtime.timers.setTimeout(fn, 100);
    clock.advance(60);
    runtime.suspend();
    clock.advance(1000);
    expect(fn).not.toHaveBeenCalled();
    runtime.resume();
    clock.advance(39);
    expect(fn).not.toHaveBeenCalled();
    clock.advance(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(runtime.activeCount).toBe(0);
  });

  it('cancels timers via the returned function', () => {
    const { runtime, clock } = setup();
    const fn = vi.fn();
    const cancel = runtime.timers.setTimeout(fn, 10);
    cancel();
    clock.advance(20);
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs intervals, stops them while suspended', () => {
    const { runtime, clock } = setup();
    const fn = vi.fn();
    const stop = runtime.timers.setInterval(fn, 10);
    clock.advance(35);
    expect(fn).toHaveBeenCalledTimes(3);
    runtime.suspend();
    clock.advance(100);
    expect(fn).toHaveBeenCalledTimes(3);
    runtime.resume();
    clock.advance(10);
    expect(fn).toHaveBeenCalledTimes(4);
    stop();
    clock.advance(100);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('runs frame loops with dt, resetting dt after resume', () => {
    const { runtime, clock } = setup();
    const dts = [];
    runtime.timers.loop((dt) => dts.push(dt));
    clock.frame(16);
    clock.frame(16);
    runtime.suspend();
    clock.frame(5000);
    runtime.resume();
    clock.frame(16);
    clock.frame(20);
    expect(dts).toEqual([0, 16, 0, 20]);
  });

  it('starts timers paused when created during suspension', () => {
    const { runtime, clock } = setup();
    runtime.suspend();
    const fn = vi.fn();
    runtime.timers.setTimeout(fn, 5);
    clock.advance(50);
    expect(fn).not.toHaveBeenCalled();
    runtime.resume();
    clock.advance(5);
    expect(fn).toHaveBeenCalled();
  });

  it('routes timer errors to the boundary', () => {
    const { runtime, clock, onCrash } = setup();
    runtime.timers.setTimeout(() => {
      throw new Error('tick failed');
    }, 1);
    clock.advance(1);
    expect(onCrash).toHaveBeenCalledWith(expect.objectContaining({ message: 'tick failed' }), 'timer');
  });

  it('dispose aborts the signal, clears timers and runs tracked cleanups once', () => {
    const { runtime, clock } = setup();
    const fn = vi.fn();
    const cleanup = vi.fn();
    const aborted = vi.fn();
    runtime.signal.addEventListener('abort', aborted);
    runtime.timers.setInterval(fn, 10);
    runtime.timers.loop(fn);
    runtime.track(cleanup);
    runtime.track(() => {
      throw new Error('bad cleanup');
    });
    runtime.dispose();
    runtime.dispose();
    clock.advance(100);
    clock.frame();
    expect(fn).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(clock.pending).toBe(0);
    const late = vi.fn();
    runtime.track(late);
    expect(late).toHaveBeenCalled();
  });

  it('untracking runs the cleanup immediately', () => {
    const { runtime } = setup();
    const cleanup = vi.fn();
    const untrack = runtime.track(cleanup);
    untrack();
    untrack();
    runtime.dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
