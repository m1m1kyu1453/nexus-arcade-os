import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createAi } from '../../src/services/ai/ai.js';
import { createPermissions } from '../../src/services/permissions/permissions.js';

function setup(answer = true) {
  const kv = new Map();
  const ask = vi.fn(async () => answer);
  const apps = {
    'nexus.notes': { builtIn: true, declared: ['vfs'] },
    'plugin.wordcloud': { builtIn: false, declared: ['vfs', 'notifications'] },
  };
  const permissions = createPermissions({
    store: { get: async (k) => kv.get(k), set: async (k, v) => void kv.set(k, v) },
    ask,
    appInfo: (id) => apps[id],
    bus: createEventBus(),
  });
  return { permissions, ask, kv };
}

describe('permissions', () => {
  it('trusts built-in apps for what they declare, nothing else', async () => {
    const { permissions, ask } = setup();
    expect(await permissions.request('nexus.notes', 'vfs')).toBe(true);
    expect(await permissions.request('nexus.notes', 'clipboard')).toBe(false);
    expect(await permissions.request('unknown.app', 'vfs')).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('asks plugins once per permission, remembers, and can revoke', async () => {
    const { permissions, ask, kv } = setup(true);
    expect(permissions.status('plugin.wordcloud', 'vfs')).toBe('ask');
    const [a, b] = await Promise.all([
      permissions.request('plugin.wordcloud', 'vfs'),
      permissions.request('plugin.wordcloud', 'vfs'),
    ]);
    expect([a, b]).toEqual([true, true]);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(permissions.status('plugin.wordcloud', 'vfs')).toBe('granted');
    expect(kv.get('decisions')).toEqual({ 'plugin.wordcloud': { vfs: 'granted' } });
    await permissions.revoke('plugin.wordcloud', 'vfs');
    expect(permissions.status('plugin.wordcloud', 'vfs')).toBe('ask');
    expect(await permissions.request('plugin.wordcloud', 'ai')).toBe(false);
  });

  it('remembers denials', async () => {
    const { permissions, ask } = setup(false);
    expect(await permissions.request('plugin.wordcloud', 'notifications')).toBe(false);
    expect(await permissions.request('plugin.wordcloud', 'notifications')).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe('AI stub', () => {
  it('reports AI as unavailable until phase 12 adds providers', () => {
    expect(createAi(createEventBus()).isAvailable()).toBe(false);
  });
});
