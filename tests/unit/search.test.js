import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createRegistry } from '../../src/kernel/registry.js';
import { createCommands } from '../../src/services/commands/commands.js';
import { mainThreadBackend } from '../../src/services/search/backend.js';
import { fold, fuzzyMatch, TIER } from '../../src/services/search/fuzzy.js';
import { createSearchIndex } from '../../src/services/search/search-index.js';
import { createSearch } from '../../src/services/search/search.js';
import { connectSearchSources } from '../../src/services/search/sources.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../../src/services/settings/settings.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';
import { createVfs, VFS_STORE_SCHEMA } from '../../src/services/vfs/vfs.js';
import { createRpcClient, exposeRpc } from '../../src/workers/rpc.js';
import { testManifest } from '../helpers/manifests.js';

describe('fuzzy matching', () => {
  it('ranks exact > prefix > word start > substring > fuzzy', () => {
    const score = (q, t) => fuzzyMatch(q, t)?.score ?? 0;
    expect(score('notes', 'Notes')).toBe(TIER.exact);
    expect(score('note', 'Notes')).toBeGreaterThan(TIER.prefix - 1);
    expect(score('code', 'Nexus Code')).toBeGreaterThan(TIER.wordStart - 10);
    expect(score('nc', 'Nexus Code')).toBeGreaterThanOrEqual(TIER.wordStart - 50);
    expect(score('xus', 'Nexus')).toBeGreaterThan(TIER.substring - 10);
    const fuzzy = score('nxs', 'Nexus');
    expect(fuzzy).toBeGreaterThan(0);
    expect(fuzzy).toBeLessThan(TIER.substring);
    expect(fuzzyMatch('zzz', 'Nexus')).toBeNull();
    expect(fuzzyMatch('', 'Nexus')).toBeNull();
  });

  it('ignores case and diacritics, keeping index positions for highlights', () => {
    expect(fold('Über Café')).toBe('uber cafe');
    expect(fuzzyMatch('uber', 'Übersicht').ranges).toEqual([[0, 4]]);
    expect(fuzzyMatch('cafe', 'Mein Café')).toMatchObject({ ranges: [[5, 9]] });
    expect(fuzzyMatch('nc', 'Nexus Code').ranges).toEqual([
      [0, 1],
      [6, 7],
    ]);
    expect(fuzzyMatch('mc', 'myCalendar').ranges).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
});

describe('search index', () => {
  const docs = [
    { id: 'app:notes', type: 'app', title: 'Nexus Notes', keywords: ['markdown', 'wiki'] },
    { id: 'app:code', type: 'app', title: 'Nexus Code' },
    { id: 'command:notes.new', type: 'command', title: 'New note' },
    {
      id: 'file:/h/recipe.md',
      type: 'file',
      title: 'recipe.md',
      body: 'Mix the flour with two eggs, then bake for 20 minutes.',
    },
  ];

  it('finds by title, keywords and body text with a snippet', () => {
    const index = createSearchIndex();
    index.upsert(docs);
    expect(
      index
        .query('note')
        .map((r) => r.id)
        .sort(),
    ).toEqual(['app:notes', 'command:notes.new']);
    expect(index.query('notes').map((r) => r.id)).toEqual(['app:notes']);
    expect(index.query('wiki')[0].id).toBe('app:notes');
    const [recipe] = index.query('eggs');
    expect(recipe.id).toBe('file:/h/recipe.md');
    expect(recipe.snippet).toContain('two eggs');
    expect(index.query('code', { types: ['command'] })).toEqual([]);
    expect(index.query('   ')).toEqual([]);
  });

  it('boosts recently and frequently used items', () => {
    let t = 1_000_000_000;
    const index = createSearchIndex({ now: () => t });
    index.upsert([
      { id: 'a', type: 'app', title: 'Calendar' },
      { id: 'b', type: 'app', title: 'Calculator' },
    ]);
    // Equal tier: the shorter title wins.
    expect(index.query('cal').map((r) => r.id)).toEqual(['a', 'b']);
    const usage = index.recordUse('b');
    index.recordUse('b');
    expect(index.query('cal').map((r) => r.id)).toEqual(['b', 'a']);
    t += 30 * 86_400_000;
    const fresh = createSearchIndex({ now: () => t });
    fresh.upsert([
      { id: 'a', type: 'app', title: 'Calendar' },
      { id: 'b', type: 'app', title: 'Calculator' },
    ]);
    fresh.setUsage({ b: { count: 1, last: 0 } });
    expect(fresh.query('cal')[0].id).toBe('b'); // still frequent, no longer recent
    expect(usage.b.count).toBe(1);
  });

  it('removes documents by id and prefix', () => {
    const index = createSearchIndex();
    index.upsert(docs);
    index.remove(['app:code']);
    index.removePrefix('file:/h/');
    expect(index.size).toBe(2);
  });
});

describe('worker RPC', () => {
  it('calls methods across a message channel, including errors', async () => {
    const { port1, port2 } = new MessageChannel();
    exposeRpc(port2, { add: (a, b) => a + b, fail: () => Promise.reject(new TypeError('bad input')) });
    port1.start();
    port2.start();
    const rpc = createRpcClient(port1);
    expect(await rpc.call('add', 2, 3)).toBe(5);
    await expect(rpc.call('fail')).rejects.toMatchObject({ name: 'TypeError', message: 'bad input' });
    await expect(rpc.call('missing')).rejects.toThrow(/Unknown method/);
    port1.close();
  });
});

async function setupService() {
  const store = new Map();
  const logger = createLogger();
  const search = createSearch({
    backend: mainThreadBackend(),
    log: logger.child('search'),
    store: { get: async (k) => store.get(k), set: async (k, v) => void store.set(k, v) },
  });
  return { search, store, logger };
}

describe('search service', () => {
  it('merges app providers with indexed results and survives broken providers', async () => {
    const { search, logger } = await setupService();
    await search.index([{ id: 'app:x', type: 'app', title: 'Recipes' }]);
    const run = vi.fn();
    search.registerProvider('nexus.notes', async (q) => [{ title: `Note about ${q}`, run }]);
    search.registerProvider('nexus.broken', async () => {
      throw new Error('provider bug');
    });
    const results = await search.query('recipes');
    expect(results.map((r) => r.title)).toEqual(['Recipes', 'Note about recipes']);
    expect(results[1].app).toBe('nexus.notes');
    await results[1].run();
    expect(run).toHaveBeenCalled();
    expect(logger.entries({ minLevel: 'warn' })[0].message).toMatch(/nexus.broken/);
  });

  it('persists usage (debounced) and restores it', async () => {
    vi.useFakeTimers();
    const { search, store } = await setupService();
    await search.index([{ id: 'app:a', type: 'app', title: 'A' }]);
    await search.recordUse('app:a');
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(store.get('usage')).toMatchObject({ 'app:a': { count: 1 } }));

    // A new session restores usage: the used item outranks an equally good match.
    const second = await setupService();
    second.store.set('usage', { 'app:b': { count: 5, last: Date.now() } });
    await second.search.load();
    await second.search.index([
      { id: 'app:a', type: 'app', title: 'Paint' },
      { id: 'app:b', type: 'app', title: 'Pixel Art' },
    ]);
    expect((await second.search.query('p')).map((r) => r.id)).toEqual(['app:b', 'app:a']);
  });
});

describe('search sources', () => {
  async function setupSources() {
    const bus = createEventBus();
    const logger = createLogger();
    const log = logger.child('t');
    const db = await createMemoryEngine().open('p', { ...VFS_STORE_SCHEMA, ...SETTINGS_STORE_SCHEMA });
    const vfs = createVfs({ db, bus, user: 'ada' });
    await vfs.init();
    const registry = createRegistry({ bus, log });
    const commands = createCommands({
      bus,
      log,
      context: () => ({}),
      localize: (t) => (typeof t === 'string' ? t : t.en),
    });
    const settings = createSettings({ db, bus, log });
    settings.register('system', [{ key: 'theme', type: 'string', default: 'x', label: { en: 'Theme', de: 'Design' } }]);
    const { search } = await setupService();
    const sources = connectSearchSources({
      search,
      bus,
      registry,
      commands,
      settings,
      vfs,
      log,
      localize: (t) => (typeof t === 'string' ? t : t.en),
    });
    return { bus, vfs, registry, commands, search, sources };
  }

  const ids = async (search, q) => (await search.query(q, { providers: false })).map((r) => r.id);

  it('indexes apps, commands, settings and files, and follows changes', async () => {
    const { vfs, registry, commands, search, sources } = await setupSources();
    registry.register(testManifest({ id: 'nexus.notes', name: { en: 'Notes', de: 'Notizen' } }));
    commands.register({ id: 'notes.new', title: 'New note', run: () => {} });
    await vfs.writeFile('/home/ada/Documents/shopping.md', 'buy oat milk');
    await sources.start();
    await vi.waitFor(async () =>
      expect(await ids(search, 'oat milk')).toEqual(['file:/home/ada/Documents/shopping.md']),
    );
    expect(await ids(search, 'notes')).toEqual(['app:nexus.notes']);
    expect(await ids(search, 'new note')).toEqual(['command:notes.new']);
    expect(await ids(search, 'theme')).toEqual(['setting:system/theme']);

    // Incremental: new file, rename, trash.
    await vfs.writeFile('/home/ada/Desktop/todo.txt', 'call the dentist');
    await vi.waitFor(async () => expect(await ids(search, 'dentist')).toEqual(['file:/home/ada/Desktop/todo.txt']));
    await vfs.rename('/home/ada/Desktop/todo.txt', 'tasks.txt');
    await vi.waitFor(async () => expect(await ids(search, 'dentist')).toEqual(['file:/home/ada/Desktop/tasks.txt']));
    await vfs.trash('/home/ada/Desktop/tasks.txt');
    await vi.waitFor(async () => expect(await ids(search, 'dentist')).toEqual([]));

    registry.setEnabled('nexus.notes', false);
    await vi.waitFor(async () => expect(await ids(search, 'notes')).toEqual([]));
    sources.stop();
  });
});
