import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { coerceSetting, validateSetting } from '../../src/services/settings/schema.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../../src/services/settings/settings.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';

const L = (en) => ({ en, de: en });
const decls = [
  { key: 'autosaveMs', type: 'number', default: 800, min: 200, max: 5000, label: L('Autosave') },
  { key: 'wrap', type: 'boolean', default: true, label: L('Wrap') },
  {
    key: 'mode',
    type: 'enum',
    default: 'split',
    options: ['edit', 'preview', 'split'].map((value) => ({ value, label: L(value) })),
    label: L('Mode'),
  },
  { key: 'accent', type: 'color', default: '', label: L('Accent') },
  { key: 'folder', type: 'path', default: '/home', label: L('Folder') },
];

async function setup() {
  const db = await createIdbEngine().open('profile', SETTINGS_STORE_SCHEMA);
  const bus = createEventBus();
  const logger = createLogger();
  const settings = createSettings({ db, bus, log: logger.child('settings') });
  settings.register('nexus.notes', decls);
  await settings.load();
  return { db, bus, logger, settings };
}

describe('setting validation', () => {
  it('validates each type', () => {
    const [num, bool, en, color, path] = decls;
    expect(validateSetting(num, 300)).toEqual({ ok: true, value: 300 });
    expect(validateSetting(num, 100).ok).toBe(false);
    expect(validateSetting(num, NaN).ok).toBe(false);
    expect(validateSetting(bool, 'yes').ok).toBe(false);
    expect(validateSetting(en, 'preview').ok).toBe(true);
    expect(validateSetting(en, 'other').ok).toBe(false);
    expect(validateSetting(color, '#ABCDEF')).toEqual({ ok: true, value: '#abcdef' });
    expect(validateSetting(color, '').ok).toBe(true);
    expect(validateSetting(color, 'red').ok).toBe(false);
    expect(validateSetting(path, 'relative').ok).toBe(false);
  });

  it('coerces old stored values when unambiguous, else uses the default', () => {
    const [num, bool, en] = decls;
    expect(coerceSetting(num, '1000')).toBe(1000);
    expect(coerceSetting(num, 99999)).toBe(5000);
    expect(coerceSetting(num, 'fast')).toBe(800);
    expect(coerceSetting(bool, 'false')).toBe(false);
    expect(coerceSetting(en, 'removed-mode')).toBe('split');
  });
});

describe('settings service', () => {
  it('returns defaults, stores only non-defaults, and announces changes', async () => {
    const { settings, db, bus } = await setup();
    const changed = vi.fn();
    bus.on('settings:changed', changed);
    expect(settings.get('nexus.notes', 'autosaveMs')).toBe(800);
    await settings.set('nexus.notes', 'autosaveMs', 1500);
    expect(settings.get('nexus.notes', 'autosaveMs')).toBe(1500);
    expect(await db.getAll('settings')).toEqual([{ scope: 'nexus.notes', key: 'autosaveMs', value: 1500 }]);
    await settings.set('nexus.notes', 'autosaveMs', 1500); // unchanged: no event
    await settings.set('nexus.notes', 'autosaveMs', 800); // back to default: record removed
    expect(await db.getAll('settings')).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid values and unknown keys', async () => {
    const { settings } = await setup();
    await expect(settings.set('nexus.notes', 'autosaveMs', 50)).rejects.toThrow(/at least 200/);
    await expect(settings.set('nexus.notes', 'nope', 1)).rejects.toThrow(/Unknown setting/);
    expect(() => settings.get('other.app', 'x')).toThrow(/Unknown setting/);
  });

  it('loads stored values, fixing invalid ones', async () => {
    const { db, logger, settings } = await setup();
    await db.put('settings', { scope: 'nexus.notes', key: 'mode', value: 'preview' });
    await db.put('settings', { scope: 'nexus.notes', key: 'wrap', value: 'false' });
    await db.put('settings', { scope: 'nexus.notes', key: 'autosaveMs', value: 'broken' });
    await db.put('settings', { scope: 'later.app', key: 'x', value: 5 });
    await settings.load();
    expect(settings.get('nexus.notes', 'mode')).toBe('preview');
    expect(settings.get('nexus.notes', 'wrap')).toBe(false);
    expect(settings.get('nexus.notes', 'autosaveMs')).toBe(800);
    expect(logger.entries({ minLevel: 'warn' }).length).toBe(2);
    // A scope registered after load still gets its stored values.
    settings.register('later.app', [{ key: 'x', type: 'number', default: 1, label: L('X') }]);
    expect(settings.get('later.app', 'x')).toBe(5);
  });

  it('resets one setting, one scope, or everything', async () => {
    const { settings } = await setup();
    settings.register('system', [{ key: 'theme', type: 'string', default: 'neon-night', label: L('Theme') }]);
    await settings.set('nexus.notes', 'wrap', false);
    await settings.set('nexus.notes', 'mode', 'edit');
    await settings.set('system', 'theme', 'matrix');
    await settings.reset('nexus.notes', 'wrap');
    expect(settings.get('nexus.notes', 'wrap')).toBe(true);
    expect(settings.get('nexus.notes', 'mode')).toBe('edit');
    await settings.resetScope('nexus.notes');
    expect(settings.get('nexus.notes', 'mode')).toBe('split');
    expect(settings.get('system', 'theme')).toBe('matrix');
    await settings.resetAll();
    expect(settings.get('system', 'theme')).toBe('neon-night');
  });

  it('notifies onChange listeners per key or for the whole scope', async () => {
    const { settings } = await setup();
    const one = vi.fn();
    const all = vi.fn();
    settings.onChange('nexus.notes', 'wrap', one);
    const unsub = settings.onChange('nexus.notes', '*', all);
    await settings.set('nexus.notes', 'wrap', false);
    await settings.set('nexus.notes', 'mode', 'edit');
    unsub();
    await settings.set('nexus.notes', 'mode', 'preview');
    expect(one.mock.calls).toEqual([[false, 'wrap']]);
    expect(all.mock.calls).toEqual([
      [false, 'wrap'],
      ['edit', 'mode'],
    ]);
  });

  it('applies changes made in another tab', async () => {
    const { settings, bus } = await setup();
    const seen = vi.fn();
    settings.onChange('nexus.notes', 'mode', seen);
    bus.emit('settings:changed', { scope: 'nexus.notes', key: 'mode', value: 'edit', remote: true });
    expect(settings.get('nexus.notes', 'mode')).toBe('edit');
    expect(seen).toHaveBeenCalledWith('edit', 'mode');
  });

  it('describes a scope for the Settings app', async () => {
    const { settings } = await setup();
    await settings.set('nexus.notes', 'wrap', false);
    const described = settings.describe('nexus.notes');
    expect(described.find((d) => d.key === 'wrap')).toMatchObject({ value: false, isDefault: false });
    expect(described.find((d) => d.key === 'mode')).toMatchObject({ value: 'split', isDefault: true });
    expect(settings.scopes()).toEqual(['nexus.notes']);
  });
});
