// @vitest-environment jsdom
// Phase 1 "done when": a test app can be registered, launched in a bare container, crash
// safely, store data, read/write VFS files, be found by search, and survive
// backup → wipe → restore. This boots the whole system (all services) in jsdom.
import { afterEach, describe, expect, it, vi } from 'vitest';
import testApp from '../../src/dev/test-app/manifest.js';
import { startSystem } from '../../src/kernel/system.js';
import { mainThreadBackend } from '../../src/services/search/backend.js';
import { profileDbName } from '../../src/services/profiles/profiles.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';
import { createBareHost } from '../../src/shell/bare-host.js';

/** @type {Awaited<ReturnType<typeof startSystem>>[]} */
const running = [];
afterEach(async () => {
  for (const s of running.splice(0)) await s.stop();
  document.body.innerHTML = '';
});

async function boot({ engine = createIdbEngine(), manifests = [testApp], languages = ['en'] } = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  /** @type {any} */
  let system;
  const host = createBareHost({ root, system: () => system });
  system = await startSystem({
    edition: 'web',
    version: '0.1.0-test',
    dev: false,
    manifests,
    host,
    engine,
    whenLeader: (fn) => fn(),
    searchBackend: mainThreadBackend(),
    languages,
    AudioContextImpl: null,
  });
  running.push(system);
  return { system, root, engine };
}

/** The whole system runs in jsdom; give async steps time under parallel test load. */
const waitFor = (fn) => vi.waitFor(fn, { timeout: 5000 });
const click = (root, action) => root.querySelector(`[data-action="${action}"]`).click();
const text = (root, testid) => root.querySelector(`[data-testid="${testid}"]`)?.textContent;

describe('system boot', () => {
  it('starts with a default profile, home folders, theme and language', async () => {
    const { system } = await boot({ languages: ['de-DE'] });
    expect(system.profile).toMatchObject({ name: 'Benutzer', username: 'benutzer' });
    expect(await system.vfs.exists('/home/benutzer/Documents')).toBe(true);
    expect(system.registry.has('nexus.dev.test')).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('neon-night');
    expect(document.documentElement.lang).toBe('de');
    expect(system.engine.kind).toBe('indexeddb');
    expect(system.logger.entries().some((e) => e.message.startsWith('Ready:'))).toBe(true);
  });

  it('reopens the same profile on the next start', async () => {
    const engine = createIdbEngine();
    const first = await boot({ engine });
    const id = first.system.profile.id;
    await first.system.stop();
    running.length = 0;
    const second = await boot({ engine });
    expect(second.system.profile.id).toBe(id);
    // The log survived the restart.
    expect(second.system.logger.entries().filter((e) => e.message.startsWith('Ready:')).length).toBe(2);
  });
});

describe('the test app', () => {
  it('launches in a bare container, stores data, writes files and is found by search', async () => {
    const { system, root } = await boot();
    const id = await system.lifecycle.launch('nexus.dev.test');
    await waitFor(() => expect(text(root, 'devtest-title')).toBe('Kernel test app — Hello'));
    expect(text(root, 'devtest-count')).toBe('No items yet');

    click(root, 'add');
    await waitFor(() => expect(text(root, 'devtest-count')).toBe('1 item'));
    const path = '/home/user/Documents/kernel-test-1.nexustest';
    expect(await system.vfs.readFile(path)).toBe('Item 1');
    expect(system.achievements.level().xp).toBe(25);

    // Found by search: its file (indexed by name), its provider result, and the app itself.
    await waitFor(async () => {
      expect((await system.search.query('kernel-test-1')).map((r) => r.id)).toContain(`file:${path}`);
    });
    expect((await system.search.query('item 1')).map((r) => [r.title, r.app])).toContainEqual([
      'Item 1',
      'nexus.dev.test',
    ]);
    expect((await system.search.query('kernel test')).map((r) => r.id)).toContain('app:nexus.dev.test');

    // Commands declared in the manifest run the module's handler (headless ctx).
    expect(await system.commands.execute('devtest.ping')).toBe('pong');
    // Intents: the app handles its own file type.
    expect(system.intents.openersFor(path).map((m) => m.id)).toEqual(['nexus.dev.test']);

    await system.lifecycle.close(id);
    expect(root.querySelector('[data-instance]')).toBeNull();
  });

  it('crashes safely, shows the crash view, logs a report, and restarts', async () => {
    const { system, root } = await boot();
    await system.lifecycle.launch('nexus.dev.test');
    await waitFor(() => expect(text(root, 'devtest-title')).toBeTruthy());
    click(root, 'crash');
    const alert = root.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Kernel Test stopped working');
    expect(alert.querySelector('pre').textContent).toContain('Deliberate crash from the kernel test app');
    expect(system.lifecycle.list()[0].state).toBe('crashed');
    expect(system.logger.entries({ minLevel: 'error' }).some((e) => e.source === 'app:nexus.dev.test')).toBe(true);

    alert.querySelector('[data-action="restart"]').click();
    await waitFor(() => expect(text(root, 'devtest-title')).toBe('Kernel test app — Hello'));
    await waitFor(() =>
      expect(system.lifecycle.list().map((i) => [i.id, i.state])).toEqual([['nexus.dev.test#2', 'running']]),
    );

    // Async errors in guarded handlers crash too, and the OS keeps running.
    click(root, 'crash-async');
    await waitFor(() => expect(system.lifecycle.list()[0].state).toBe('crashed'));
    expect(await system.vfs.exists('/home/user')).toBe(true);
  });

  it('follows language switches live', async () => {
    const { system, root } = await boot();
    await system.lifecycle.launch('nexus.dev.test');
    await waitFor(() => expect(text(root, 'devtest-count')).toBe('No items yet'));
    await system.settings.set('system', 'language', 'de');
    await waitFor(() => expect(text(root, 'devtest-count')).toBe('Noch keine Einträge'));
    expect(document.documentElement.lang).toBe('de');
  });

  it('survives backup → wipe → restore', async () => {
    const engine = createIdbEngine();
    const first = await boot({ engine });
    await first.system.lifecycle.launch('nexus.dev.test');
    await waitFor(() => expect(text(first.root, 'devtest-count')).toBe('No items yet'));
    click(first.root, 'add');
    await waitFor(() => expect(text(first.root, 'devtest-count')).toBe('1 item'));
    const { blob } = await first.system.backup.export({ password: 'pw' });
    const profileId = first.system.profile.id;
    await first.system.stop();
    running.length = 0;

    await engine.deleteDatabase(profileDbName(profileId));
    const wiped = await boot({ engine });
    expect(wiped.system.profile.id).toBe(profileId);
    expect(await wiped.system.vfs.exists('/home/user/Documents/kernel-test-1.nexustest')).toBe(false);
    await wiped.system.backup.restore(blob, { mode: 'replace', password: 'pw' });
    await wiped.system.stop();
    running.length = 0;

    // "Reload": boot again, migrations run on the restored data.
    const restored = await boot({ engine });
    expect(restored.system.migrationResults).toEqual([
      expect.objectContaining({ scope: 'nexus.dev.test', status: 'ok' }),
    ]);
    expect(await restored.system.vfs.readFile('/home/user/Documents/kernel-test-1.nexustest')).toBe('Item 1');
    await restored.system.lifecycle.launch('nexus.dev.test');
    await waitFor(() => expect(text(restored.root, 'devtest-count')).toBe('1 item'));
    expect(restored.system.achievements.level().xp).toBe(25);
  }, 30_000);

  it('opens data from a newer version read-only, with a notice', async () => {
    const engine = createIdbEngine();
    const first = await boot({ engine });
    const db = await engine.open(profileDbName(first.system.profile.id), { meta: { keyPath: 'id' } });
    await db.put('meta', { id: 'schema:nexus.dev.test', version: 9 });
    await first.system.stop();
    running.length = 0;

    const second = await boot({ engine });
    expect(second.system.migrationResults[0]).toMatchObject({ status: 'newer', version: 9 });
    const history = await second.system.notifications.history();
    expect(history.map((h) => h.title)).toContain('Kernel Test has data from a newer Nexus');
    await second.system.lifecycle.launch('nexus.dev.test');
    await waitFor(() => expect(text(second.root, 'devtest-count')).toBe('No items yet'));
    click(second.root, 'add');
    await waitFor(() => expect(second.system.lifecycle.list()[0].state).toBe('crashed'));
    expect(second.root.querySelector('[role="alert"] pre').textContent).toMatch(/read-only/);
  });
});
