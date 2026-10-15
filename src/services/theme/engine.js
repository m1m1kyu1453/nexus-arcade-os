// @ts-check
// Theme engine: turns the theme + user options into CSS custom properties on :root.
// `computeTokens` is pure (tested without a DOM); `createThemeService` applies it and keeps it
// in sync with settings and with the system's light/dark and reduced-motion preferences.
import { contrastRatio, ensureContrast, readableOn, rgba } from './color.js';
import { getTheme, THEMES } from './themes.js';

/** @typedef {'full' | 'reduced' | 'off'} MotionLevel */

/**
 * @typedef {object} ThemeOptions
 * @property {string} themeId
 * @property {string} [accent]          '' or hex override
 * @property {number} [fontScale]       0.8–1.5
 * @property {number} [transparency]    0 (opaque) – 1 (full glass)
 * @property {MotionLevel} [motion]
 * @property {boolean} [batterySaver]   no blur, glow or particles
 */

const MOTION = {
  full: { fast: '120ms', med: '220ms', slow: '420ms' },
  reduced: { fast: '0ms', med: '80ms', slow: '120ms' },
  off: { fast: '0ms', med: '0ms', slow: '0ms' },
};

/**
 * @param {ThemeOptions} options
 * @returns {{ vars: Record<string, string>, theme: import('./themes.js').Theme, motion: MotionLevel, accentAdjusted: boolean }}
 */
export function computeTokens({
  themeId,
  accent = '',
  fontScale = 1,
  transparency = 1,
  motion = 'full',
  batterySaver = false,
}) {
  const theme = getTheme(themeId);
  const c = theme.colors;
  const dark = theme.scheme === 'dark';
  // Accent must stay visible as a UI element on the background (WCAG 1.4.11: 3:1).
  const wantedAccent = accent || c.accent;
  const finalAccent = ensureContrast(wantedAccent, c.bg, 3);
  const glow = batterySaver ? 0 : theme.glow;
  const glass = Math.min(1, Math.max(0, transparency));
  const level = /** @type {MotionLevel} */ (MOTION[motion] ? motion : 'full');

  /** @type {Record<string, string>} */
  const vars = {
    '--bg': c.bg,
    '--surface-1': c.surface1,
    '--surface-2': c.surface2,
    '--surface-3': c.surface3,
    '--glass': rgba(c.surface2, batterySaver ? 0.97 : 1 - 0.4 * glass),
    '--border': theme.id === 'high-contrast' ? c.border : rgba(c.border, dark ? 0.22 : 0.3),
    '--text-1': c.text1,
    '--text-2': c.text2,
    '--text-3': c.text3,
    '--accent': finalAccent,
    '--accent-2': c.accent2,
    '--accent-contrast': readableOn(finalAccent),
    '--success': c.success,
    '--warning': c.warning,
    '--danger': c.danger,
    '--info': c.info,
    '--blur-glass': `${batterySaver ? 0 : Math.round(18 * glass)}px`,
    '--glow-accent': glow > 0 ? `0 0 24px ${rgba(finalAccent, 0.25 * glow)}` : 'none',
    '--glow-strength': String(glow),
    '--shadow-1': dark ? '0 2px 8px rgb(0 0 0 / 0.35)' : '0 2px 8px rgb(20 30 50 / 0.12)',
    '--shadow-2': dark ? '0 12px 40px rgb(0 0 0 / 0.5)' : '0 12px 40px rgb(20 30 50 / 0.18)',
    '--font-scale': String(Math.min(1.5, Math.max(0.8, fontScale))),
    '--dur-fast': MOTION[level].fast,
    '--dur-med': MOTION[level].med,
    '--dur-slow': MOTION[level].slow,
  };
  return { vars, theme, motion: level, accentAdjusted: finalAccent !== wantedAccent };
}

/**
 * Contrast of a custom accent against a theme's background (for the settings UI warning).
 * @param {string} accent
 * @param {string} themeId
 */
export function accentContrast(accent, themeId) {
  const ratio = contrastRatio(accent, getTheme(themeId).colors.bg);
  return { ratio, ok: ratio >= 3 };
}

/**
 * @param {object} options
 * @param {import('../settings/settings.js').Settings} options.settings
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {HTMLElement} options.root                document.documentElement
 * @param {(query: string) => MediaQueryList} [options.matchMedia]
 */
export function createThemeService({ settings, bus, root, matchMedia = globalThis.matchMedia?.bind(globalThis) }) {
  const prefersLight = matchMedia?.('(prefers-color-scheme: light)');
  const prefersReduced = matchMedia?.('(prefers-reduced-motion: reduce)');
  /** @type {ReturnType<typeof computeTokens> | null} */
  let applied = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let transitionTimer;

  const sys = (/** @type {string} */ key) => settings.get('system', key);

  function resolveThemeId() {
    const chosen = /** @type {string} */ (sys('theme'));
    if (chosen !== 'auto') return chosen;
    return /** @type {string} */ (prefersLight?.matches ? sys('themeAutoLight') : sys('themeAutoDark'));
  }

  function resolveMotion() {
    const chosen = /** @type {string} */ (sys('animation'));
    if (chosen === 'auto') return prefersReduced?.matches ? 'reduced' : 'full';
    return /** @type {MotionLevel} */ (chosen);
  }

  /** @param {{ animate?: boolean }} [options] */
  function apply({ animate = false } = {}) {
    const next = computeTokens({
      themeId: resolveThemeId(),
      accent: /** @type {string} */ (sys('accent')),
      fontScale: /** @type {number} */ (sys('fontScale')),
      transparency: /** @type {number} */ (sys('transparency')),
      motion: resolveMotion(),
      batterySaver: /** @type {boolean} */ (sys('batterySaver')),
    });
    if (animate && next.motion !== 'off') {
      root.classList.add('nx-theme-transition');
      clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => root.classList.remove('nx-theme-transition'), 450);
    }
    for (const [name, value] of Object.entries(next.vars)) root.style.setProperty(name, value);
    root.dataset.theme = next.theme.id;
    root.dataset.scheme = next.theme.scheme;
    root.dataset.motion = next.motion;
    root.dataset.batterySaver = String(!!sys('batterySaver'));
    root.style.colorScheme = next.theme.scheme;
    root.ownerDocument?.querySelector('meta[name="theme-color"]')?.setAttribute('content', next.theme.colors.bg);
    const changed = applied?.theme.id !== next.theme.id;
    applied = next;
    bus.emit('theme:changed', {
      theme: next.theme.id,
      scheme: next.theme.scheme,
      motion: next.motion,
      themeSwitched: changed,
    });
  }

  const THEME_KEYS = new Set([
    'theme',
    'themeAutoLight',
    'themeAutoDark',
    'accent',
    'fontScale',
    'transparency',
    'animation',
    'batterySaver',
  ]);
  settings.onChange('system', '*', (_value, key) => {
    if (THEME_KEYS.has(key)) apply({ animate: true });
  });
  prefersLight?.addEventListener?.('change', () => sys('theme') === 'auto' && apply({ animate: true }));
  prefersReduced?.addEventListener?.('change', () => sys('animation') === 'auto' && apply());

  return {
    apply,
    themes: () => THEMES,
    /** Resolved theme id (never 'auto'). */
    get current() {
      return applied?.theme.id ?? resolveThemeId();
    },
    get scheme() {
      return applied?.theme.scheme ?? getTheme(resolveThemeId()).scheme;
    },
    get motion() {
      return applied?.motion ?? resolveMotion();
    },
    /** @param {string} name token without '--', e.g. 'accent' */
    token: (name) => applied?.vars[`--${name}`] ?? '',
    /** True if the user's accent had to be adjusted for contrast. */
    get accentAdjusted() {
      return applied?.accentAdjusted ?? false;
    },
    /** @param {(info: { theme: string, scheme: string, motion: string }) => void} fn */
    onChange: (fn) => bus.on('theme:changed', fn),
  };
}

/** @typedef {ReturnType<typeof createThemeService>} ThemeService */
