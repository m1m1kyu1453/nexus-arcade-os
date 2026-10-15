import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLifecycle } from '../../src/kernel/lifecycle.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createRegistry } from '../../src/kernel/registry.js';
import { createFakeClock } from '../helpers/fake-clock.js';
import { testManifest, testModule } from '../helpers/manifests.js';

function setup({ manifests = [testManifest()], document } = {}) {
  const bus = createEventBus();
  const logger = createLogger();
  const registry = createRegistry({ bus, log: logger.child('registry') });
  registry.registerAll(manifests);
  const frames = new Map();
  const crashes = [];
  const host = {
    open: vi.fn((manifest, { instanceId }) => {
      const frame = { container: { textContent: '' }, window: { title: manifest.name.en } };
      frames.set(instanceId, frame);
      return frame;
    }),
    close: vi.fn((id) => frames.delete(id)),
    focus: vi.fn(),
    showCrash: vi.fn((id, report, actions) => crashes.push({ id, report, actions })),
  };
  const clock = createFakeClock();
  const createContext = vi.fn((manifest, extras) => ({
    app: { id: manifest.id, version: manifest.version, instanceId: extras.instanceId },
    window: extras.window,
    timers: extras.runtime.timers,
    signal: extras.runtime.signal,
    guard: extras.runtime.guard,
  }));
  const lifecycle = createLifecycle({ registry, bus, logger, host, createContext, os: 'test', document, clock });
  const events = [];
  bus.on('app:*', (payload, type) => events.push([type, payload.id]));
  return { bus, logger, registry, host, frames, crashes, clock, lifecycle, events, createContext };
}

describe('lifecycle', () => {
  it('launches, mounts with args, focuses and closes', async () => {
    const calls = [];
    const mount = vi.fn(() => ({ unmount: () => calls.push('unmount') }));
    const { lifecycle, frames, host, events, createContext } = setup({
      manifests: [testManifest({ load: async () => ({ mount }) })],
    });
    const id = await lifecycle.launch('test.app', { file: '/a.txt' });
    expect(id).toBe('test.app#1');
    expect(mount).toHaveBeenCalledWith(frames.get(id).container, expect.objectContaining({ app: expect.any(Object) }), {
      file: '/a.txt',
    });
    expect(createContext.mock.calls[0][1]).toMatchObject({ instanceId: id, window: { title: 'Test App' } });
    expect(lifecycle.get(id)).toMatchObject({ state: 'running', focused: true, suspended: false });
    expect(host.focus).toHaveBeenCalledWith(id);

    await lifecycle.close(id);
    expect(calls).toEqual(['unmount']);
    expect(lifecycle.list()).toEqual([]);
    expect(host.close).toHaveBeenCalledWith(id);
    expect(events).toEqual([
      ['app:launching', id],
      ['app:launched', id],
      ['app:focused', id],
      ['app:blurred', id],
      ['app:closed', id],
    ]);
  });

  it('numbers multiple instances and moves focus between them', async () => {
    const { lifecycle, events } = setup();
    const a = await lifecycle.launch('test.app');
    const b = await lifecycle.launch('test.app');
    expect([a, b]).toEqual(['test.app#1', 'test.app#2']);
    expect(lifecycle.focusedId).toBe(b);
    lifecycle.focus(a);
    expect(events.slice(-2)).toEqual([
      ['app:blurred', b],
      ['app:focused', a],
    ]);
  });

  it('single-instance apps refocus and receive the intent instead of launching twice', async () => {
    const calls = [];
    const { lifecycle } = setup({
      manifests: [testManifest({ window: { singleInstance: true }, load: async () => testModule({ calls }) })],
    });
    const first = await lifecycle.launch('test.app');
    const again = await lifecycle.launch('test.app', {
      intent: { action: 'open', type: 'text/plain', path: '/b.txt' },
    });
    expect(again).toBe(first);
    expect(lifecycle.list()).toHaveLength(1);
    expect(calls).toEqual([`mount:${first}`, `intent:${first}:/b.txt`]);
  });

  it('refuses unknown and disabled apps', async () => {
    const { lifecycle, registry } = setup();
    await expect(lifecycle.launch('no.such')).rejects.toThrow(/Unknown app/);
    registry.setEnabled('test.app', false);
    await expect(lifecycle.launch('test.app')).rejects.toThrow(/disabled/);
  });

  it('suspends for any reason and resumes only when all reasons are gone', async () => {
    const calls = [];
    const { lifecycle } = setup({ manifests: [testManifest({ load: async () => testModule({ calls }) })] });
    const id = await lifecycle.launch('test.app');
    lifecycle.suspend(id, 'minimized');
    lifecycle.suspend(id, 'workspace');
    lifecycle.resume(id, 'minimized');
    expect(lifecycle.get(id).suspended).toBe(true);
    lifecycle.resume(id, 'workspace');
    expect(lifecycle.get(id).suspended).toBe(false);
    expect(calls).toEqual([`mount:${id}`, `suspend:${id}`, `resume:${id}`]);
  });

  it('pauses app timers while suspended', async () => {
    const tick = vi.fn();
    const { lifecycle, clock } = setup({
      manifests: [
        testManifest({
          load: async () => ({
            mount: (container, ctx) => {
              ctx.timers.setInterval(tick, 10);
              return {};
            },
          }),
        }),
      ],
    });
    const id = await lifecycle.launch('test.app');
    clock.advance(25);
    expect(tick).toHaveBeenCalledTimes(2);
    lifecycle.suspend(id, 'minimized');
    clock.advance(100);
    expect(tick).toHaveBeenCalledTimes(2);
    lifecycle.resume(id, 'minimized');
    clock.advance(10);
    expect(tick).toHaveBeenCalledTimes(3);
    await lifecycle.close(id);
    clock.advance(100);
    expect(tick).toHaveBeenCalledTimes(3);
    expect(clock.pending).toBe(0);
  });

  it('suspends everything while the tab is hidden', async () => {
    const listeners = {};
    const document = { hidden: false, addEventListener: (type, fn) => (listeners[type] = fn) };
    const calls = [];
    const { lifecycle } = setup({ document, manifests: [testManifest({ load: async () => testModule({ calls }) })] });
    const id = await lifecycle.launch('test.app');
    document.hidden = true;
    listeners.visibilitychange();
    expect(lifecycle.get(id).suspendReasons).toEqual(['hidden']);
    document.hidden = false;
    listeners.visibilitychange();
    expect(lifecycle.get(id).suspended).toBe(false);
    expect(calls).toEqual([`mount:${id}`, `suspend:${id}`, `resume:${id}`]);
  });

  it('crashes on a mount error and offers restart', async () => {
    let fail = true;
    const { lifecycle, crashes, events, logger } = setup({
      manifests: [
        testManifest({
          load: async () => ({
            mount: () => {
              if (fail) throw new Error('mount exploded');
              return {};
            },
          }),
        }),
      ],
    });
    const id = await lifecycle.launch('test.app');
    expect(lifecycle.get(id).state).toBe('crashed');
    expect(crashes[0].report).toMatchObject({ appId: 'test.app', message: 'mount exploded', source: 'mount' });
    expect(events).toContainEqual(['app:crashed', id]);
    expect(logger.entries({ minLevel: 'error' })[0].source).toBe('app:test.app');

    fail = false;
    crashes[0].actions.restart();
    await vi.waitFor(() => expect(lifecycle.list().map((i) => i.state)).toEqual(['running']));
    expect(lifecycle.list()[0].id).toBe('test.app#2');
  });

  it('crashes on errors in guarded callbacks and timers, and cleans up', async () => {
    let ctxRef;
    const unmount = vi.fn();
    const { lifecycle, crashes, clock } = setup({
      manifests: [
        testManifest({
          load: async () => ({
            mount: (container, ctx) => {
              ctxRef = ctx;
              ctx.timers.setInterval(() => {}, 5);
              return { unmount };
            },
          }),
        }),
      ],
    });
    const id = await lifecycle.launch('test.app');
    ctxRef.guard(() => {
      throw new Error('click handler bug');
    })();
    expect(lifecycle.get(id).state).toBe('crashed');
    expect(crashes[0].report.source).toBe('callback');
    expect(unmount).toHaveBeenCalled();
    expect(ctxRef.signal.aborted).toBe(true);
    expect(clock.pending).toBe(0);

    crashes[0].actions.close();
    await vi.waitFor(() => expect(lifecycle.list()).toEqual([]));
  });

  it('crashes when the code chunk fails to load', async () => {
    const { lifecycle, crashes } = setup({
      manifests: [testManifest({ load: async () => Promise.reject(new Error('offline')) })],
    });
    const id = await lifecycle.launch('test.app');
    expect(lifecycle.get(id).state).toBe('crashed');
    expect(crashes[0].report).toMatchObject({ source: 'load', message: 'offline' });
  });

  it('closes even if unmount throws', async () => {
    const { lifecycle, logger } = setup({
      manifests: [
        testManifest({
          load: async () => ({
            mount: () => ({
              unmount: () => {
                throw new Error('cleanup bug');
              },
            }),
          }),
        }),
      ],
    });
    const id = await lifecycle.launch('test.app');
    await lifecycle.close(id);
    expect(lifecycle.list()).toEqual([]);
    expect(logger.entries({ minLevel: 'warn' })[0].message).toBe('unmount failed');
  });
});
