import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import {
  ACHIEVEMENTS_STORE_SCHEMA,
  createAchievements,
  levelFromXp,
  xpForLevel,
} from '../../src/services/achievements/achievements.js';
import { createClipboard } from '../../src/services/clipboard/clipboard.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';

const kvStore = () => {
  const map = new Map();
  return { map, get: async (k) => map.get(k), set: async (k, v) => void map.set(k, v) };
};

describe('clipboard', () => {
  function setup(api) {
    const store = kvStore();
    let n = 0;
    const clipboard = createClipboard({
      store,
      bus: createEventBus(),
      api,
      document: undefined,
      newId: () => `c${++n}`,
      now: () => n,
    });
    return { clipboard, store };
  }

  it('copies text and keeps a de-duplicated history', async () => {
    const api = { writeText: vi.fn(async () => {}), readText: vi.fn(async () => 'pasted') };
    const { clipboard, store } = setup(api);
    await clipboard.writeText('hello', { app: 'nexus.notes' });
    await clipboard.writeText('world');
    await clipboard.writeText('hello');
    expect(api.writeText).toHaveBeenCalledTimes(3);
    expect(clipboard.history().map((h) => h.text)).toEqual(['hello', 'world']);
    expect(store.map.get('history')).toHaveLength(2);
    expect(await clipboard.readText()).toBe('pasted');
  });

  it('never stores sensitive copies', async () => {
    const { clipboard } = setup({ writeText: async () => {} });
    await clipboard.writeText('hunter2', { sensitive: true });
    expect(clipboard.history()).toEqual([]);
  });

  it('reports failure honestly when copying is impossible', async () => {
    const { clipboard } = setup({ writeText: async () => Promise.reject(new Error('denied')) });
    await expect(clipboard.writeText('x')).rejects.toThrow(/did not allow/);
    const none = setup(undefined).clipboard;
    await expect(none.readText()).rejects.toThrow(/Ctrl\+V/);
  });

  it('removes entries and clears history; restores on load', async () => {
    const { clipboard, store } = setup({ writeText: async () => {} });
    await clipboard.writeText('a');
    await clipboard.writeText('b');
    const [b] = clipboard.history();
    await clipboard.remove(b.id);
    expect(clipboard.history().map((h) => h.text)).toEqual(['a']);
    const again = createClipboard({ store, bus: createEventBus(), api: {} });
    await again.load();
    expect(again.history().map((h) => h.text)).toEqual(['a']);
    await clipboard.clearHistory();
    expect(clipboard.history()).toEqual([]);
  });
});

describe('XP and levels', () => {
  it('follows the documented formula', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
    expect(levelFromXp(0)).toEqual({ level: 1, xp: 0, current: 0, needed: 100 });
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(450)).toEqual({ level: 3, xp: 450, current: 150, needed: 300 });
    expect(levelFromXp(1000).level).toBe(5);
  });
});

describe('achievements', () => {
  async function setup() {
    const db = await createMemoryEngine().open('p', ACHIEVEMENTS_STORE_SCHEMA);
    const bus = createEventBus();
    const logger = createLogger();
    const store = kvStore();
    const onUnlock = vi.fn();
    const achievements = createAchievements({ db, bus, log: logger.child('a'), store, onUnlock, now: () => 42 });
    await achievements.load();
    achievements.register('nexus.snake', [
      {
        id: 'first',
        title: { en: 'First bite', de: 'Erster Bissen' },
        description: { en: 'Eat once', de: 'Einmal fressen' },
      },
      {
        id: 'hundred',
        title: { en: 'Glutton', de: 'Vielfraß' },
        description: { en: '100 apples', de: '100 Äpfel' },
        goal: 100,
      },
      {
        id: 'secret',
        title: { en: 'Ouroboros', de: 'Ouroboros' },
        description: { en: 'Bite yourself', de: 'Beiß dich' },
        secret: true,
      },
    ]);
    return { bus, logger, store, onUnlock, achievements };
  }

  it('unlocks once, awards XP and announces it', async () => {
    const { achievements, onUnlock, bus } = await setup();
    const levelUp = vi.fn();
    bus.on('xp:level-up', levelUp);
    expect(await achievements.unlock('nexus.snake', 'first')).toBe(true);
    expect(await achievements.unlock('nexus.snake', 'first')).toBe(false);
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(achievements.level().xp).toBe(25);
    await achievements.unlock('nexus.snake', 'secret');
    expect(achievements.level().xp).toBe(75);
    await achievements.award('nexus.snake', 500);
    expect(achievements.level()).toMatchObject({ xp: 175, level: 2 });
    expect(levelUp).toHaveBeenCalledWith({ level: 2 }, 'xp:level-up');
  });

  it('tracks progress towards a goal without going backwards', async () => {
    const { achievements, onUnlock } = await setup();
    await achievements.progress('nexus.snake', 'hundred', 40);
    await achievements.progress('nexus.snake', 'hundred', 10);
    let [, hundred] = await achievements.list('nexus.snake');
    expect(hundred).toMatchObject({ progress: 40, unlockedAt: null });
    await achievements.progress('nexus.snake', 'hundred', 100);
    [, hundred] = await achievements.list('nexus.snake');
    expect(hundred).toMatchObject({ progress: 100, unlockedAt: 42 });
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('hides secret achievements until unlocked', async () => {
    const { achievements } = await setup();
    const secret = (await achievements.list()).find((a) => a.id === 'secret');
    expect(secret).toMatchObject({ secret: true, title: null, description: null });
    await achievements.unlock('nexus.snake', 'secret');
    expect((await achievements.list()).find((a) => a.id === 'secret').title.en).toBe('Ouroboros');
  });

  it('ignores unknown achievements with a warning', async () => {
    const { achievements, logger } = await setup();
    expect(await achievements.unlock('nexus.snake', 'nope')).toBe(false);
    expect(logger.entries({ minLevel: 'warn' })[0].message).toMatch(/Unknown achievement/);
  });

  it('keeps per-app stats and XP across loads', async () => {
    const { achievements, store } = await setup();
    await achievements.stat('nexus.snake', 'games');
    await achievements.stat('nexus.snake', 'games', 2);
    expect(achievements.stats('nexus.snake')).toEqual({ games: 3 });
    await achievements.unlock('nexus.snake', 'first');
    const db = await createMemoryEngine().open('p2', ACHIEVEMENTS_STORE_SCHEMA);
    const reloaded = createAchievements({ db, bus: createEventBus(), log: createLogger().child('a'), store });
    await reloaded.load();
    expect(reloaded.level().xp).toBe(25);
    expect(reloaded.stats('nexus.snake')).toEqual({ games: 3 });
  });
});
