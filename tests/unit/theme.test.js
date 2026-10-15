// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../../src/services/settings/settings.js';
import { SYSTEM_SETTINGS } from '../../src/services/settings/system-settings.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';
import {
  contrastRatio,
  ensureContrast,
  luminance,
  mix,
  parseHex,
  readableOn,
  rgba,
} from '../../src/services/theme/color.js';
import { accentContrast, computeTokens, createThemeService } from '../../src/services/theme/engine.js';
import { THEMES } from '../../src/services/theme/themes.js';

describe('color math', () => {
  it('parses, mixes and formats colors', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(rgba('#3ef0ff', 0.25)).toBe('rgb(62 240 255 / 0.25)');
    expect(() => parseHex('red')).toThrow();
  });

  it('computes WCAG luminance and contrast', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(readableOn('#ffff00')).toBe('#000000');
    expect(readableOn('#0a64eb')).toBe('#ffffff');
  });

  it('pushes colors to a minimum contrast', () => {
    const fixed = ensureContrast('#202020', '#000000', 3);
    expect(contrastRatio(fixed, '#000000')).toBeGreaterThanOrEqual(3);
    expect(ensureContrast('#ffffff', '#000000', 3)).toBe('#ffffff');
  });
});

describe('built-in themes', () => {
  it('has the 8 themes from the brief, unique ids, EN and DE names', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'neon-night',
      'synthwave',
      'matrix',
      'blade',
      'deep-ocean',
      'arctic-light',
      'paper',
      'high-contrast',
    ]);
    for (const t of THEMES) expect(t.name.en && t.name.de).toBeTruthy();
  });

  // WCAG AA in every theme: text ≥ 4.5:1 on every background it sits on; accent ≥ 3:1 (UI).
  it.each(THEMES.map((t) => [t.id, t]))('%s meets WCAG AA contrast', (_id, theme) => {
    const c = theme.colors;
    for (const bg of [c.bg, c.surface1, c.surface2, c.surface3]) {
      for (const [role, fg] of Object.entries({ text1: c.text1, text2: c.text2, text3: c.text3 })) {
        expect(contrastRatio(fg, bg), `${role} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      for (const [role, fg] of Object.entries({
        accent: c.accent,
        success: c.success,
        warning: c.warning,
        danger: c.danger,
        info: c.info,
      })) {
        expect(contrastRatio(fg, bg), `${role} ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
    expect(contrastRatio(readableOn(c.accent), c.accent)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('computeTokens', () => {
  it('maps the theme to CSS variables', () => {
    const { vars, theme, motion } = computeTokens({ themeId: 'arctic-light' });
    expect(theme.scheme).toBe('light');
    expect(vars['--bg']).toBe('#f3f6fb');
    expect(vars['--accent-contrast']).toBe('#ffffff');
    expect(vars['--dur-med']).toBe('220ms');
    expect(motion).toBe('full');
  });

  it('applies accent, font scale, transparency, motion and battery saver', () => {
    const { vars, motion } = computeTokens({
      themeId: 'neon-night',
      accent: '#ff00aa',
      fontScale: 3,
      transparency: 0,
      motion: 'off',
      batterySaver: true,
    });
    expect(vars['--accent']).toBe('#ff00aa');
    expect(vars['--font-scale']).toBe('1.5');
    expect(vars['--blur-glass']).toBe('0px');
    expect(vars['--glow-accent']).toBe('none');
    expect(vars['--dur-slow']).toBe('0ms');
    expect(motion).toBe('off');
  });

  it('adjusts an unreadable accent and reports it', () => {
    const result = computeTokens({ themeId: 'paper', accent: '#fff8e0' });
    expect(result.accentAdjusted).toBe(true);
    expect(contrastRatio(result.vars['--accent'], '#f6f1e7')).toBeGreaterThanOrEqual(3);
    expect(accentContrast('#fff8e0', 'paper').ok).toBe(false);
    expect(accentContrast('#a84a12', 'paper').ok).toBe(true);
  });

  it('falls back to the default theme for unknown ids', () => {
    expect(computeTokens({ themeId: 'removed-theme' }).theme.id).toBe('neon-night');
  });
});

describe('theme service', () => {
  function mediaQueries({ light = false, reduced = false } = {}) {
    const lists = {};
    const make = (query, matches) => {
      const listeners = [];
      lists[query] = {
        matches,
        addEventListener: (_t, fn) => listeners.push(fn),
        fire: () => listeners.forEach((f) => f()),
      };
      return lists[query];
    };
    make('(prefers-color-scheme: light)', light);
    make('(prefers-reduced-motion: reduce)', reduced);
    return { matchMedia: (q) => lists[q], lists };
  }

  async function setup(media = {}) {
    const bus = createEventBus();
    const db = await createMemoryEngine().open('p', SETTINGS_STORE_SCHEMA);
    const settings = createSettings({ db, bus, log: createLogger().child('s') });
    settings.register('system', SYSTEM_SETTINGS);
    await settings.load();
    const { matchMedia, lists } = mediaQueries(media);
    const root = document.documentElement;
    const theme = createThemeService({ settings, bus, root, matchMedia });
    theme.apply();
    return { bus, settings, theme, root, lists };
  }

  it('applies variables and data attributes to :root', async () => {
    const { root, theme } = await setup();
    expect(root.style.getPropertyValue('--bg')).toBe('#05060d');
    expect(root.dataset.theme).toBe('neon-night');
    expect(root.dataset.scheme).toBe('dark');
    expect(theme.token('accent')).toBe('#3ef0ff');
  });

  it('switches live when settings change, with a short transition', async () => {
    vi.useFakeTimers();
    const { root, settings, bus } = await setup();
    const changed = vi.fn();
    bus.on('theme:changed', changed);
    await settings.set('system', 'theme', 'matrix');
    expect(root.dataset.theme).toBe('matrix');
    expect(root.classList.contains('nx-theme-transition')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(root.classList.contains('nx-theme-transition')).toBe(false);
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'matrix', themeSwitched: true }),
      'theme:changed',
    );
    await settings.set('system', 'soundMaster', 0.1); // unrelated: no re-apply
    expect(changed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('follows the system light/dark preference in Auto', async () => {
    const { root, settings, lists, theme } = await setup({ light: true });
    await settings.set('system', 'theme', 'auto');
    expect(root.dataset.theme).toBe('arctic-light');
    lists['(prefers-color-scheme: light)'].matches = false;
    lists['(prefers-color-scheme: light)'].fire();
    expect(root.dataset.theme).toBe('neon-night');
    expect(theme.current).toBe('neon-night');
    await settings.set('system', 'themeAutoDark', 'deep-ocean');
    expect(root.dataset.theme).toBe('deep-ocean');
  });

  it('respects prefers-reduced-motion when animation is Auto', async () => {
    const { root, settings } = await setup({ reduced: true });
    expect(root.dataset.motion).toBe('reduced');
    await settings.set('system', 'animation', 'full');
    expect(root.dataset.motion).toBe('full');
  });
});
