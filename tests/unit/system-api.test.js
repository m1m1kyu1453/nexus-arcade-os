// @vitest-environment jsdom
// ctx.system (privileged facade for built-in system apps) and the canClose() veto.
import { afterEach, describe, expect, it } from 'vitest';
import { startSystem } from '../../src/kernel/system.js';
import { mainThreadBackend } from '../../src/services/search/backend.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';
import { createBareHost } from '../../src/shell/bare-host.js';
import { testManifest } from '../helpers/manifests.js';

const running = [];
afterEach(async () => {
  for (const s of running.splice(0)) await s.stop();
  document.body.innerHTML = '';
});

/** @type {Record<string, any>} ctx per app id, captured at mount */
let contexts = {};
let allowClose = true;

const apps = [
  testManifest({
    id: 'test.sysapp',
    permissions: ['system'],
    storage: { version: 1, collections: { items: {} } },
    settings: [{ key: 'level', type: 'number', default: 1, label: { en: 'Level', de: 'Stufe' } }],
    load: async () => ({
      mount(_el, ctx) {
        contexts['test.sysapp'] = ctx;
        return { canClose: () => allowClose };
      },
    }),
  }),
  testManifest({
    id: 'test.plain',
    load: async () => ({
      mount(_el, ctx) {
        contexts['test.plain'] = ctx;
        return {};
      },
    }),
  }),
];

async function boot() {
  contexts = {};
  allowClose = true;
  const root = document.createElement('div');
  document.body.append(root);
  let system;
  system = await startSystem({
    edition: 'web',
    version: '0.3.0-test',
    dev: false,
    manifests: apps,
    host: createBareHost({ root, system: () => system }),
    engine: createMemoryEngine(),
    whenLeader: (fn) => fn(),
    searchBackend: mainThreadBackend(),
    languages: ['en'],
    AudioContextImpl: null,
  });
  running.push(system);
  return system;
}

describe('ctx.system', () => {
  it('is only given to apps that declare the system permission', async () => {
    const system = await boot();
    await system.lifecycle.launch('test.sysapp');
    await system.lifecycle.launch('test.plain');
    expect(contexts['test.sysapp'].system).toBeDefined();
    expect(contexts['test.plain'].system).toBeUndefined();
  });

  it('lists apps and windows, hides apps and clears their data', async () => {
    const system = await boot();
    const sysWin = await system.lifecycle.launch('test.sysapp');
    const plainWin = await system.lifecycle.launch('test.plain');
    const api = contexts['test.sysapp'].system;

    expect(api.apps.list().map((a) => a.id)).toEqual(['test.sysapp', 'test.plain']);
    expect(api.apps.get('test.sysapp')).toMatchObject({
      permissions: ['system'],
      collections: ['items'],
      enabled: true,
    });
    expect(api.windows.list().map((w) => [w.id, w.appName])).toEqual([
      [sysWin, 'Test App'],
      [plainWin, 'Test App'],
    ]);

    await api.apps.setEnabled('test.plain', false);
    expect(system.lifecycle.get(plainWin)).toBeUndefined();
    expect(api.apps.has('test.plain')).toBe(false);
    expect(api.apps.list({ includeDisabled: true }).find((a) => a.id === 'test.plain').enabled).toBe(false);

    const ctx = contexts['test.sysapp'];
    await ctx.storage.collection('items').put({ id: 'a' });
    await ctx.storage.kv.set('k', 1);
    await ctx.settings.set('level', 5);
    await api.apps.clearData('test.sysapp');
    expect(await ctx.storage.collection('items').count()).toBe(0);
    expect(await ctx.storage.kv.get('k')).toBeUndefined();
    expect(ctx.settings.get('level')).toBe(1);
  });

  it('respects canClose() unless the window is killed', async () => {
    const system = await boot();
    const id = await system.lifecycle.launch('test.sysapp');
    const api = contexts['test.sysapp'].system;
    allowClose = false;
    expect(await api.windows.close(id)).toBe(false);
    expect(system.lifecycle.get(id)).toBeDefined();
    expect(await api.windows.kill(id)).toBe(true);
    expect(system.lifecycle.get(id)).toBeUndefined();
  });
});
