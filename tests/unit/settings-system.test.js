// @vitest-environment jsdom
// Kernel pieces behind the Settings app: region formats, pick commands from shortcuts, and the
// admin parts of ctx.system (storage usage, default apps, privacy, shortcuts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { startSystem } from '../../src/kernel/system.js';
import { createCommands } from '../../src/services/commands/commands.js';
import { createI18n } from '../../src/services/i18n/i18n.js';
import { mainThreadBackend } from '../../src/services/search/backend.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';
import { createBareHost } from '../../src/shell/bare-host.js';
import { testManifest } from '../helpers/manifests.js';

describe('i18n region', () => {
  it('formats dates and numbers for the region but keeps the language', async () => {
    const i18n = createI18n({ bus: createEventBus(), log: createLogger().child('t'), locale: 'en', dev: false });
    i18n.register('x', { en: async () => ({ default: { n: { one: '{count} item', other: '{count} items' } } }) });
    await i18n.load('x');
    expect(i18n.format.number(1234.5)).toBe('1,234.5');
    i18n.setRegion('de-DE');
    expect(i18n.format.number(1234.5)).toBe('1.234,5');
    expect(i18n.t('x', 'n', { count: 2 })).toBe('2 items');
    i18n.setRegion('xx-invalid-!!');
    expect(i18n.region).toBeNull();
  });
});

describe('pick commands', () => {
  it('ask the picker for a value when run without one', async () => {
    const commands = createCommands({
      bus: createEventBus(),
      log: createLogger().child('t'),
      context: () => ({}),
      localize: (s) => s,
    });
    const run = vi.fn();
    commands.register({ id: 'x.pick', title: 'X', pick: () => [{ value: 1, label: 'one' }], run });
    await commands.execute('x.pick');
    expect(run).toHaveBeenCalledWith(undefined); // no picker yet: runs as before
    const picker = vi.fn();
    commands.setPicker(picker);
    await commands.execute('x.pick');
    expect(picker).toHaveBeenCalledWith('x.pick');
    await commands.execute('x.pick', 1);
    expect(run).toHaveBeenLastCalledWith(1);
  });
});

const running = [];
afterEach(async () => {
  for (const s of running.splice(0)) await s.stop();
  document.body.innerHTML = '';
});

describe('ctx.system admin', () => {
  it('reports usage per app and folder, default apps, privacy counts and shortcuts', async () => {
    let ctx;
    const apps = [
      testManifest({
        id: 'test.settings',
        permissions: ['system'],
        storage: { version: 1, collections: { items: {} } },
        load: async () => ({
          mount(_el, c) {
            ctx = c;
            return {};
          },
        }),
      }),
      testManifest({ id: 'test.editor', handles: [{ action: 'open', types: ['.md'] }] }),
    ];
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
    await system.lifecycle.launch('test.settings');
    const api = ctx.system;

    await ctx.storage.collection('items').put({ id: 'a', text: 'x'.repeat(500) });
    await ctx.storage.kv.set('k', 'v');
    await system.vfs.writeFile(`${system.vfs.home}/Documents/a.md`, 'hello');
    await system.vfs.writeFile(`${system.vfs.home}/note.txt`, 'hi');
    const usage = await api.storage.usage();
    const mine = usage.apps.find((a) => a.id === 'test.settings');
    expect(mine.records).toBe(2);
    expect(mine.bytes).toBeGreaterThan(500);
    expect(usage.folders).toEqual(
      expect.arrayContaining([
        { path: `${system.vfs.home}/Documents`, bytes: 5 },
        { path: system.vfs.home, bytes: 2 },
      ]),
    );
    expect(await api.storage.quarantine()).toEqual([]);

    await system.intents.setDefault('/x/readme.md', 'test.editor');
    expect(await api.defaults.list()).toEqual([{ type: '.md', app: 'test.editor' }]);
    await api.defaults.clear('.md');
    expect(await api.defaults.list()).toEqual([]);

    await system.clipboard.writeText('copied').catch(() => {});
    system.recent.add(`${system.vfs.home}/note.txt`);
    const before = await api.privacy.summary();
    expect(before.recent).toBe(1);
    await api.privacy.clearRecentFiles();
    expect((await api.privacy.summary()).recent).toBe(0);

    const palette = api.shortcuts.list().find((c) => c.id === 'system.toggleDnd');
    expect(palette).toMatchObject({ binding: null });
    await api.shortcuts.rebind('system.toggleDnd', 'Mod+Alt+D');
    expect(api.shortcuts.list().find((c) => c.id === 'system.toggleDnd').binding).toMatch(/Alt\+D/);
    expect(api.about.repoUrl).toContain('github.com');
    expect(api.updates.supported).toBe(false);
  });
});
