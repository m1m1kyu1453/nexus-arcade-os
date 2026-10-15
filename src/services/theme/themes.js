// @ts-check
// The built-in themes (NEXUS_BRIEF.md §6). Themes only define color roles and glow; spacing,
// radii, type scale and motion live in src/styles/tokens.css and are adjusted by the engine.
// tests/unit/theme.test.js checks WCAG AA contrast for every theme.

/**
 * @typedef {object} ThemePalette
 * @property {string} bg
 * @property {string} surface1
 * @property {string} surface2
 * @property {string} surface3
 * @property {string} border       hex; the engine applies transparency
 * @property {string} text1
 * @property {string} text2
 * @property {string} text3
 * @property {string} accent
 * @property {string} accent2
 * @property {string} success
 * @property {string} warning
 * @property {string} danger
 * @property {string} info
 */

/**
 * @typedef {object} Theme
 * @property {string} id
 * @property {import('../../kernel/types').L10n} name
 * @property {'dark' | 'light'} scheme
 * @property {number} glow        0 (none) – 1 (full neon glow)
 * @property {ThemePalette} colors
 */

/** @type {Theme[]} */
export const THEMES = [
  {
    id: 'neon-night',
    name: { en: 'Neon Night', de: 'Neon-Nacht' },
    scheme: 'dark',
    glow: 1,
    colors: {
      bg: '#05060d',
      surface1: '#0b0e1a',
      surface2: '#121628',
      surface3: '#1a2036',
      border: '#7896ff',
      text1: '#eef2ff',
      text2: '#b4bdd8',
      text3: '#8c97ba',
      accent: '#3ef0ff',
      accent2: '#b36bff',
      success: '#3ddc97',
      warning: '#ffc857',
      danger: '#ff6b85',
      info: '#6aa8ff',
    },
  },
  {
    id: 'synthwave',
    name: { en: 'Synthwave', de: 'Synthwave' },
    scheme: 'dark',
    glow: 1,
    colors: {
      bg: '#120a1f',
      surface1: '#1b1030',
      surface2: '#241640',
      surface3: '#2e1c50',
      border: '#ff6ad5',
      text1: '#fbeaff',
      text2: '#dcc0ec',
      text3: '#b596cc',
      accent: '#ff4fd8',
      accent2: '#ffb347',
      success: '#5ef2b0',
      warning: '#ffd166',
      danger: '#ff6f91',
      info: '#7ab8ff',
    },
  },
  {
    id: 'matrix',
    name: { en: 'Matrix', de: 'Matrix' },
    scheme: 'dark',
    glow: 0.8,
    colors: {
      bg: '#020803',
      surface1: '#061209',
      surface2: '#0a1c0e',
      surface3: '#0f2614',
      border: '#33ff77',
      text1: '#d6ffe0',
      text2: '#95e6a9',
      text3: '#6cbd81',
      accent: '#00ff66',
      accent2: '#7dffb0',
      success: '#00ff66',
      warning: '#e6ff4d',
      danger: '#ff5c5c',
      info: '#5cffd6',
    },
  },
  {
    id: 'blade',
    name: { en: 'Blade', de: 'Blade' },
    scheme: 'dark',
    glow: 0.9,
    colors: {
      bg: '#0d0705',
      surface1: '#170d09',
      surface2: '#22130d',
      surface3: '#2c1912',
      border: '#ff8a3d',
      text1: '#ffefe2',
      text2: '#e8c6ad',
      text3: '#c09a80',
      accent: '#ffa31a',
      accent2: '#ff4b3a',
      success: '#7bd88f',
      warning: '#ffcc33',
      danger: '#ff5a4a',
      info: '#ffb070',
    },
  },
  {
    id: 'deep-ocean',
    name: { en: 'Deep Ocean', de: 'Tiefsee' },
    scheme: 'dark',
    glow: 0.7,
    colors: {
      bg: '#021019',
      surface1: '#051a28',
      surface2: '#082437',
      surface3: '#0c2e46',
      border: '#3ccfe6',
      text1: '#e6f6ff',
      text2: '#acd5e8',
      text3: '#86b2c8',
      accent: '#2ee6c5',
      accent2: '#4d94ff',
      success: '#38e09b',
      warning: '#ffd166',
      danger: '#ff6b7f',
      info: '#5cb8ff',
    },
  },
  {
    id: 'arctic-light',
    name: { en: 'Arctic Light', de: 'Arktisches Licht' },
    scheme: 'light',
    glow: 0.3,
    colors: {
      bg: '#f3f6fb',
      surface1: '#ffffff',
      surface2: '#eef2f8',
      surface3: '#e3e9f2',
      border: '#4a5d86',
      text1: '#0b1324',
      text2: '#36425b',
      text3: '#535e78',
      accent: '#0a64eb',
      accent2: '#7a3cff',
      success: '#137a4b',
      warning: '#8a5a00',
      danger: '#c4213b',
      info: '#0a5bd1',
    },
  },
  {
    id: 'paper',
    name: { en: 'Paper', de: 'Papier' },
    scheme: 'light',
    glow: 0,
    colors: {
      bg: '#f6f1e7',
      surface1: '#fffdf8',
      surface2: '#f0e9dc',
      surface3: '#e7dece',
      border: '#7a6a50',
      text1: '#2a241c',
      text2: '#4d4436',
      text3: '#625744',
      accent: '#a84a12',
      accent2: '#2f6f5e',
      success: '#2f6f3e',
      warning: '#8a5a00',
      danger: '#b3261e',
      info: '#2c5d8f',
    },
  },
  {
    id: 'high-contrast',
    name: { en: 'High Contrast', de: 'Hoher Kontrast' },
    scheme: 'dark',
    glow: 0,
    colors: {
      bg: '#000000',
      surface1: '#000000',
      surface2: '#0a0a0a',
      surface3: '#141414',
      border: '#ffffff',
      text1: '#ffffff',
      text2: '#ffffff',
      text3: '#e6e6e6',
      accent: '#ffff00',
      accent2: '#00ffff',
      success: '#00ff00',
      warning: '#ffff00',
      danger: '#ff6b6b',
      info: '#00ffff',
    },
  },
];

export const DEFAULT_THEME = 'neon-night';

/** @param {string} id */
export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? /** @type {Theme} */ (THEMES.find((t) => t.id === DEFAULT_THEME));
}
