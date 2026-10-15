import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createNotifications, NOTIFICATIONS_STORE_SCHEMA } from '../../src/services/notifications/notifications.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../../src/services/settings/settings.js';
import { SYSTEM_SETTINGS } from '../../src/services/settings/system-settings.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';

async function setup({ hidden = false, permission = 'granted' } = {}) {
  const db = await createMemoryEngine().open('p', { ...NOTIFICATIONS_STORE_SCHEMA, ...SETTINGS_STORE_SCHEMA });
  const bus = createEventBus();
  const logger = createLogger();
  const settings = createSettings({ db, bus, log: logger.child('settings') });
  settings.register('system', SYSTEM_SETTINGS);
  await settings.load();
  const kv = new Map();
  const sound = { play: vi.fn() };
  const system = {
    isHidden: () => hidden,
    permission: () => permission,
    request: vi.fn(async () => 'granted'),
    show: vi.fn(),
  };
  let t = 0;
  let n = 0;
  const notifications = createNotifications({
    db,
    bus,
    log: logger.child('notifications'),
    settings,
    store: { get: async (k) => kv.get(k), set: async (k, v) => void kv.set(k, v) },
    sound,
    system,
    now: () => ++t,
    newId: () => `n${++n}`,
  });
  await notifications.load();
  const shown = [];
  bus.on('notification:shown', (r) => shown.push(r));
  return { bus, settings, notifications, sound, system, shown, kv };
}

describe('notifications', () => {
  it('shows a toast with sound and keeps it in history', async () => {
    const { notifications, shown, sound } = await setup();
    const handle = await notifications.notify({ title: 'Saved', body: 'notes.md', app: 'nexus.notes' });
    expect(handle.id).toBe('n1');
    expect(shown[0]).toMatchObject({
      id: 'n1',
      title: 'Saved',
      body: 'notes.md',
      app: 'nexus.notes',
      timeoutMs: 6000,
      read: false,
    });
    expect(sound.play).toHaveBeenCalledWith('notification', 'notifications');
    const history = await notifications.history();
    expect(history.map((h) => h.id)).toEqual(['n1']);
    expect(await notifications.unreadCount()).toBe(1);
  });

  it('is sticky with actions or progress, and supports updates, actions and close', async () => {
    const { notifications, bus, shown } = await setup();
    const export1 = await notifications.notify({ title: 'Exporting', progress: 0, app: 'nexus.photos' });
    expect(shown[0].timeoutMs).toBe(0);
    const updated = vi.fn();
    bus.on('notification:updated', updated);
    await export1.update({ progress: 0.5 });
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({ progress: 0.5 }), 'notification:updated');
    expect((await notifications.history())[0].progress).toBe(0.5);

    const prompt = await notifications.notify({ title: 'Update ready', actions: [{ id: 'reload', label: 'Reload' }] });
    const onAction = vi.fn();
    prompt.onAction(onAction);
    notifications.triggerAction(prompt.id, 'reload');
    expect(onAction).toHaveBeenCalledWith('reload');
    const closed = vi.fn();
    bus.on('notification:closed', closed);
    prompt.close();
    expect(closed).toHaveBeenCalledWith({ id: prompt.id }, 'notification:closed');
    notifications.triggerAction(prompt.id, 'reload');
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('suppresses toasts in Do-not-disturb and for muted apps, but keeps history', async () => {
    const { notifications, settings, shown, sound } = await setup();
    await settings.set('system', 'doNotDisturb', true);
    await notifications.notify({ title: 'Quiet' });
    expect(shown).toEqual([]);
    expect(sound.play).not.toHaveBeenCalled();
    await notifications.notify({ title: 'Alarm', urgent: true });
    expect(shown.map((s) => s.title)).toEqual(['Alarm']);
    await settings.set('system', 'doNotDisturb', false);

    notifications.setFocusMode(true);
    expect(notifications.doNotDisturb).toBe(true);
    await notifications.notify({ title: 'During focus' });
    notifications.setFocusMode(false);

    await notifications.mute('nexus.games', true);
    expect(notifications.isMuted('nexus.games')).toBe(true);
    await notifications.notify({ title: 'Highscore', app: 'nexus.games' });
    expect(shown.map((s) => s.title)).toEqual(['Alarm']);
    expect((await notifications.history()).map((h) => [h.title, h.suppressed])).toEqual([
      ['Highscore', true],
      ['During focus', true],
      ['Alarm', false],
      ['Quiet', true],
    ]);
  });

  it('persists the mute list', async () => {
    const { notifications, kv } = await setup();
    await notifications.mute('a.b', true);
    expect(kv.get('muted')).toEqual(['a.b']);
    await notifications.mute('a.b', false);
    expect(kv.get('muted')).toEqual([]);
  });

  it('shows system notifications only when hidden, enabled and permitted', async () => {
    const visible = await setup({ hidden: false });
    await visible.settings.set('system', 'browserNotifications', true);
    await visible.notifications.notify({ title: 'A' });
    expect(visible.system.show).not.toHaveBeenCalled();

    const hidden = await setup({ hidden: true });
    await hidden.notifications.notify({ title: 'B' });
    expect(hidden.system.show).not.toHaveBeenCalled(); // setting off
    await hidden.settings.set('system', 'browserNotifications', true);
    await hidden.notifications.notify({ title: 'C' });
    expect(hidden.system.show).toHaveBeenCalledWith(expect.objectContaining({ title: 'C' }), expect.any(Function));

    const denied = await setup({ hidden: true, permission: 'denied' });
    await denied.settings.set('system', 'browserNotifications', true);
    await denied.notifications.notify({ title: 'D' });
    expect(denied.system.show).not.toHaveBeenCalled();
  });

  it('marks read, clears, and skips transient toasts in history', async () => {
    const { notifications } = await setup();
    await notifications.notify({ title: 'Copied', transient: true });
    const a = await notifications.notify({ title: 'A' });
    await notifications.notify({ title: 'B' });
    expect((await notifications.history()).map((h) => h.title)).toEqual(['B', 'A']);
    await notifications.markRead(a.id);
    expect(await notifications.unreadCount()).toBe(1);
    await notifications.markAllRead();
    expect(await notifications.unreadCount()).toBe(0);
    await notifications.clear(a.id);
    expect((await notifications.history()).map((h) => h.title)).toEqual(['B']);
    await notifications.clear();
    expect(await notifications.history()).toEqual([]);
  });

  it('keeps at most 500 history entries', async () => {
    const { notifications } = await setup();
    for (let i = 0; i < 505; i++) await notifications.notify({ title: `#${i}`, silent: true });
    const history = await notifications.history({ limit: 1000 });
    expect(history).toHaveLength(500);
    expect(history.at(-1).title).toBe('#5');
  });

  it('requires a title', async () => {
    const { notifications } = await setup();
    await expect(notifications.notify({})).rejects.toThrow(/title/);
  });
});
