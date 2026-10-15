import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createTabRelay } from '../../src/kernel/tab-relay.js';

const tick = () => new Promise((r) => setTimeout(r, 20));

describe('tab relay', () => {
  it('relays matching events to other tabs, marked remote, without echo loops', async () => {
    const tabA = createEventBus();
    const tabB = createEventBus();
    const relayA = createTabRelay({ bus: tabA, channel: 'test-1', prefixes: ['storage:'] });
    const relayB = createTabRelay({ bus: tabB, channel: 'test-1', prefixes: ['storage:'] });
    const seenA = vi.fn();
    const seenB = vi.fn();
    tabA.on('*', seenA);
    tabB.on('*', seenB);

    tabA.emit('storage:changed', { id: 'x' });
    tabA.emit('window:focused', { id: 'w' });
    await tick();

    expect(seenB.mock.calls).toEqual([[{ id: 'x', remote: true }, 'storage:changed']]);
    // Tab A saw only its own two events: B did not send the remote event back.
    expect(seenA).toHaveBeenCalledTimes(2);

    relayA.close();
    relayB.close();
  });

  it('is a no-op without BroadcastChannel', () => {
    const relay = createTabRelay({
      bus: createEventBus(),
      channel: 'x',
      prefixes: ['a:'],
      BroadcastChannelImpl: null,
    });
    expect(() => relay.close()).not.toThrow();
  });
});
