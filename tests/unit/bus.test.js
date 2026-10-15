import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';

describe('event bus', () => {
  it('delivers payload and type to exact listeners', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    bus.on('app:launched', fn);
    bus.emit('app:launched', { id: 'nexus.notes' });
    expect(fn).toHaveBeenCalledWith({ id: 'nexus.notes' }, 'app:launched');
  });

  it('unsubscribes via the returned function and via off()', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = bus.on('x', a);
    bus.on('x', b);
    unsubA();
    bus.off('x', b);
    bus.emit('x');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(bus.listenerCount('x')).toBe(0);
  });

  it('once() fires a single time', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    bus.once('x', fn);
    bus.emit('x', 1);
    bus.emit('x', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 'x');
  });

  it('supports prefix and global wildcards', () => {
    const bus = createEventBus();
    const vfs = vi.fn();
    const all = vi.fn();
    bus.on('vfs:*', vfs);
    bus.on('*', all);
    bus.emit('vfs:changed', 'a');
    bus.emit('vfs:deleted', 'b');
    bus.emit('app:launched', 'c');
    expect(vfs.mock.calls).toEqual([
      ['a', 'vfs:changed'],
      ['b', 'vfs:deleted'],
    ]);
    expect(all).toHaveBeenCalledTimes(3);
  });

  it('refuses to emit wildcard types', () => {
    expect(() => createEventBus().emit('vfs:*')).toThrow(/wildcard/);
  });

  it('isolates throwing listeners and reports them', () => {
    const onError = vi.fn();
    const bus = createEventBus({ onError });
    const after = vi.fn();
    bus.on('x', () => {
      throw new Error('boom');
    });
    bus.on('x', after);
    bus.emit('x');
    expect(after).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), { type: 'x' });
  });

  it('is safe when listeners unsubscribe during emit', () => {
    const bus = createEventBus();
    const second = vi.fn();
    const unsub = bus.on('x', () => unsub());
    bus.on('x', second);
    bus.emit('x');
    bus.emit('x');
    expect(second).toHaveBeenCalledTimes(2);
  });

  describe('scopes', () => {
    it('removes all scoped listeners on dispose, leaving others', () => {
      const bus = createEventBus();
      const scoped = vi.fn();
      const global = vi.fn();
      const scope = bus.scope();
      scope.on('x', scoped);
      scope.on('vfs:*', scoped);
      scope.once('y', scoped);
      bus.on('x', global);
      scope.dispose();
      bus.emit('x');
      bus.emit('vfs:changed');
      bus.emit('y');
      expect(scoped).not.toHaveBeenCalled();
      expect(global).toHaveBeenCalledTimes(1);
      expect(bus.listenerCount('vfs:*')).toBe(0);
    });

    it('off() works with the original listener even when wrapped', () => {
      const bus = createEventBus();
      const fn = vi.fn();
      const scope = bus.scope({ wrap: (f) => (p, t) => f(p, t) });
      scope.on('x', fn);
      scope.off('x', fn);
      bus.emit('x');
      expect(fn).not.toHaveBeenCalled();
      expect(bus.listenerCount('x')).toBe(0);
    });

    it('wraps listeners (e.g. to route errors to an app boundary)', () => {
      const bus = createEventBus();
      const caught = vi.fn();
      const scope = bus.scope({
        wrap: (fn) => (payload, type) => {
          try {
            fn(payload, type);
          } catch (error) {
            caught(error);
          }
        },
      });
      scope.on('x', () => {
        throw new Error('app bug');
      });
      bus.emit('x');
      expect(caught).toHaveBeenCalledWith(expect.objectContaining({ message: 'app bug' }));
    });
  });
});
