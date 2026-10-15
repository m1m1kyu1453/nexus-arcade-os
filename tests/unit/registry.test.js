import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createRegistry } from '../../src/kernel/registry.js';
import { testManifest } from '../helpers/manifests.js';

function setup(options = {}) {
  const bus = createEventBus();
  const logger = createLogger();
  const registry = createRegistry({ bus, log: logger.child('registry'), ...options });
  return { bus, logger, registry };
}

describe('app registry', () => {
  it('registers valid manifests and rejects invalid or duplicate ones', () => {
    const { registry, bus } = setup();
    const seen = vi.fn();
    bus.on('app:registered', seen);
    registry.register(testManifest());
    expect(registry.has('test.app')).toBe(true);
    expect(seen).toHaveBeenCalledWith({ id: 'test.app' }, 'app:registered');
    expect(() => registry.register(testManifest())).toThrow(/already registered/);
    expect(() => registry.register(testManifest({ id: 'bad id' }))).toThrow(/Invalid manifest "bad id"/);
  });

  it('registerAll skips and logs broken manifests', () => {
    const { registry, logger } = setup();
    const result = registry.registerAll([
      testManifest({ id: 'a.one' }),
      testManifest({ id: 'a.two', category: 'nope' }),
      testManifest({ id: 'a.three' }),
    ]);
    expect(result.registered).toEqual(['a.one', 'a.three']);
    expect(result.failed.map((f) => f.id)).toEqual(['a.two']);
    expect(logger.entries({ minLevel: 'error' })[0].message).toMatch(/a.two/);
  });

  it('lists by category in standard order and hides disabled apps', () => {
    const { registry, bus } = setup({ disabled: ['g.hidden'] });
    registry.registerAll([
      testManifest({ id: 'g.snake', category: 'games' }),
      testManifest({ id: 'p.notes', category: 'productivity' }),
      testManifest({ id: 'g.hidden', category: 'games' }),
    ]);
    expect(Object.keys(registry.byCategory())).toEqual(['productivity', 'games']);
    expect(registry.list({ category: 'games' }).map((m) => m.id)).toEqual(['g.snake']);
    expect(registry.list({ includeDisabled: true })).toHaveLength(3);

    const changed = vi.fn();
    bus.on('app:enabled-changed', changed);
    registry.setEnabled('g.hidden', true);
    registry.setEnabled('g.hidden', true);
    registry.setEnabled('g.snake', false);
    expect(changed.mock.calls.map((c) => c[0])).toEqual([
      { id: 'g.hidden', enabled: true },
      { id: 'g.snake', enabled: false },
    ]);
    expect(registry.isEnabled('g.snake')).toBe(false);
    expect(registry.disabledIds()).toEqual(['g.snake']);
    expect(() => registry.setEnabled('missing.app', true)).toThrow(/Unknown app/);
  });

  it('freezes registered manifests', () => {
    const { registry } = setup();
    registry.register(testManifest());
    expect(() => {
      registry.get('test.app').name = 'x';
    }).toThrow();
  });

  it('loads each module once, accepts default exports, and retries after a failure', async () => {
    const { registry } = setup();
    const mod = { mount: () => ({}) };
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk 404')).mockResolvedValue({ default: mod });
    registry.register(testManifest({ load }));
    await expect(registry.load('test.app')).rejects.toThrow('chunk 404');
    expect(await registry.load('test.app')).toBe(mod);
    expect(await registry.load('test.app')).toBe(mod);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('rejects modules without mount()', async () => {
    const { registry } = setup();
    registry.register(testManifest({ load: async () => ({ default: {} }) }));
    await expect(registry.load('test.app')).rejects.toThrow(/does not export mount/);
  });
});
