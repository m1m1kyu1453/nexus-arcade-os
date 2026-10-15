import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createI18n, detectLocale } from '../../src/services/i18n/i18n.js';

const en = {
  hello: 'Hello, {name}!',
  files: { '=0': 'No files', one: '{count} file', other: '{count} files' },
  dialog: { ok: 'OK', cancel: 'Cancel' },
  onlyEnglish: 'English only',
};
const de = {
  hello: 'Hallo, {name}!',
  files: { '=0': 'Keine Dateien', one: '{count} Datei', other: '{count} Dateien' },
  dialog: { ok: 'OK', cancel: 'Abbrechen' },
};

function setup(locale = 'en') {
  const bus = createEventBus();
  const logger = createLogger();
  const i18n = createI18n({ bus, log: logger.child('i18n'), locale, dev: true });
  const loadDe = vi.fn(async () => ({ default: de }));
  i18n.register('nexus.notes', { en: async () => ({ default: en }), de: loadDe });
  return { bus, logger, i18n, loadDe };
}

describe('i18n', () => {
  it('detects the language from browser preferences', () => {
    expect(detectLocale(['de-AT', 'en'])).toBe('de');
    expect(detectLocale(['fr', 'en-US'])).toBe('en');
    expect(detectLocale(['ja'])).toBe('en');
  });

  it('translates with interpolation, nested keys and plurals', async () => {
    const { i18n } = setup();
    await i18n.load('nexus.notes');
    const t = i18n.scoped('nexus.notes').t;
    expect(t('hello', { name: 'Ada' })).toBe('Hello, Ada!');
    expect(t('dialog.cancel')).toBe('Cancel');
    expect(t('files', { count: 0 })).toBe('No files');
    expect(t('files', { count: 1 })).toBe('1 file');
    expect(t('files', { count: 1234 })).toBe('1,234 files');
    expect(t('hello')).toBe('Hello, {name}!');
  });

  it('falls back to English, then to the key, logging missing keys once', async () => {
    const { i18n, logger } = setup('de');
    await i18n.load('nexus.notes');
    const t = i18n.scoped('nexus.notes').t;
    expect(t('dialog.cancel')).toBe('Abbrechen');
    expect(t('onlyEnglish')).toBe('English only');
    expect(t('onlyEnglish')).toBe('English only');
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(t('files')).toBe('files'); // plural message without count
    const warnings = logger.entries({ minLevel: 'warn' }).map((e) => e.message);
    expect(warnings).toEqual([
      'Missing de message "onlyEnglish" in nexus.notes',
      'Missing en message "does.not.exist" in nexus.notes',
    ]);
  });

  it('loads messages lazily and only once', async () => {
    const { i18n, loadDe } = setup('de');
    expect(loadDe).not.toHaveBeenCalled();
    await Promise.all([i18n.load('nexus.notes'), i18n.load('nexus.notes')]);
    expect(loadDe).toHaveBeenCalledTimes(1);
  });

  it('switches language at runtime and notifies', async () => {
    const { i18n, bus, loadDe } = setup('en');
    await i18n.load('nexus.notes');
    const scoped = i18n.scoped('nexus.notes');
    const changed = vi.fn();
    scoped.onChange(changed);
    await i18n.setLocale('de');
    expect(loadDe).toHaveBeenCalled();
    expect(scoped.locale).toBe('de');
    expect(scoped.t('files', { count: 2 })).toBe('2 Dateien');
    expect(changed).toHaveBeenCalledTimes(1);
    await expect(i18n.setLocale('fr')).rejects.toThrow(/Unsupported/);
    expect(bus.listenerCount('i18n:changed')).toBe(1);
  });

  it('formats dates, numbers, currencies, bytes, lists and relative times per language', async () => {
    const { i18n } = setup('en');
    const f = i18n.scoped('x');
    const date = new Date(Date.UTC(2026, 9, 15, 12));
    expect(f.number(1234.5)).toBe('1,234.5');
    expect(f.currency(9.99, 'EUR')).toBe('€9.99');
    expect(f.list(['a', 'b', 'c'])).toBe('a, b, and c');
    expect(f.relative(-1, 'day')).toBe('yesterday');
    expect(f.ago(Date.now() - 3 * 60_000)).toBe('3 minutes ago');
    expect(f.bytes(1536)).toBe('1.5 kB');
    expect(f.date(date, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })).toBe('October 15, 2026');
    await i18n.setLocale('de');
    expect(f.number(1234.5)).toBe('1.234,5');
    expect(f.currency(9.99, 'EUR')).toBe('9,99 €'); // Intl uses a no-break space
    expect(f.list(['a', 'b', 'c'])).toBe('a, b und c');
    expect(f.relative(-1, 'day')).toBe('gestern');
    expect(f.date(date, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })).toBe('15. Oktober 2026');
    expect(f.plural(1)).toBe('one');
  });

  it('logs failing loaders without throwing', async () => {
    const bus = createEventBus();
    const logger = createLogger();
    const i18n = createI18n({ bus, log: logger.child('i18n') });
    i18n.register('broken', { en: async () => Promise.reject(new Error('404')) });
    await i18n.load('broken');
    expect(i18n.t('broken', 'x')).toBe('x');
    expect(logger.entries({ minLevel: 'error' })[0].message).toMatch(/Could not load en messages for broken/);
  });
});
