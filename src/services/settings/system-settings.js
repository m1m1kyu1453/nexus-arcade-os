// @ts-check
// System settings (scope 'system'). Apps declare their own in their manifests.
import { THEMES } from '../theme/themes.js';

/** @typedef {import('../../kernel/types').SettingDecl} SettingDecl */

const L = (/** @type {string} */ en, /** @type {string} */ de) => ({ en, de });
const themeOptions = THEMES.map((t) => ({ value: t.id, label: t.name }));
const darkThemes = THEMES.filter((t) => t.scheme === 'dark').map((t) => ({ value: t.id, label: t.name }));
const lightThemes = THEMES.filter((t) => t.scheme === 'light').map((t) => ({ value: t.id, label: t.name }));

/** @type {SettingDecl[]} */
export const SYSTEM_SETTINGS = [
  // Language & region
  {
    key: 'language',
    type: 'enum',
    default: 'auto',
    options: [
      { value: 'auto', label: L('Same as browser', 'Wie im Browser') },
      { value: 'en', label: L('English', 'Englisch') },
      { value: 'de', label: L('German', 'Deutsch') },
    ],
    label: L('Language', 'Sprache'),
  },
  // Appearance
  {
    key: 'theme',
    type: 'enum',
    default: 'neon-night',
    options: [{ value: 'auto', label: L('Auto (follow system)', 'Automatisch (wie System)') }, ...themeOptions],
    label: L('Theme', 'Design'),
  },
  {
    key: 'themeAutoDark',
    type: 'enum',
    default: 'neon-night',
    options: darkThemes,
    label: L('Dark theme for Auto', 'Dunkles Design für Automatisch'),
  },
  {
    key: 'themeAutoLight',
    type: 'enum',
    default: 'arctic-light',
    options: lightThemes,
    label: L('Light theme for Auto', 'Helles Design für Automatisch'),
  },
  { key: 'accent', type: 'color', default: '', label: L('Accent color', 'Akzentfarbe') },
  { key: 'fontScale', type: 'number', default: 1, min: 0.8, max: 1.5, step: 0.05, label: L('Text size', 'Textgröße') },
  {
    key: 'transparency',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.1,
    label: L('Transparency and blur', 'Transparenz und Unschärfe'),
  },
  {
    key: 'animation',
    type: 'enum',
    default: 'auto',
    options: [
      { value: 'auto', label: L('Auto (follow system)', 'Automatisch (wie System)') },
      { value: 'full', label: L('Full', 'Voll') },
      { value: 'reduced', label: L('Reduced', 'Reduziert') },
      { value: 'off', label: L('Off', 'Aus') },
    ],
    label: L('Animations', 'Animationen'),
  },
  {
    key: 'batterySaver',
    type: 'boolean',
    default: false,
    label: L(
      'Battery saver (no particles, blur or shader wallpapers)',
      'Energiesparmodus (keine Partikel, Unschärfe oder Shader-Hintergründe)',
    ),
  },
  // Sound
  { key: 'soundMuted', type: 'boolean', default: false, label: L('Mute all sounds', 'Alle Töne stumm') },
  {
    key: 'soundMaster',
    type: 'number',
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
    label: L('Master volume', 'Gesamtlautstärke'),
  },
  {
    key: 'soundUi',
    type: 'number',
    default: 0.7,
    min: 0,
    max: 1,
    step: 0.05,
    label: L('Interface sounds', 'Oberflächentöne'),
  },
  {
    key: 'soundNotifications',
    type: 'number',
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.05,
    label: L('Notification sounds', 'Benachrichtigungstöne'),
  },
  { key: 'soundGames', type: 'number', default: 0.8, min: 0, max: 1, step: 0.05, label: L('Game sounds', 'Spieltöne') },
  {
    key: 'soundMedia',
    type: 'number',
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
    label: L('Media volume', 'Medienlautstärke'),
  },
  // Notifications
  { key: 'doNotDisturb', type: 'boolean', default: false, label: L('Do not disturb', 'Nicht stören') },
  {
    key: 'browserNotifications',
    type: 'boolean',
    default: false,
    label: L(
      'Show system notifications when Nexus is in the background',
      'Systembenachrichtigungen zeigen, wenn Nexus im Hintergrund ist',
    ),
  },
];
