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
  // Startup & lock
  {
    key: 'fastBoot',
    type: 'boolean',
    default: false,
    label: L('Fast boot (skip the boot animation)', 'Schnellstart (Startanimation überspringen)'),
  },
  {
    key: 'idleLockMinutes',
    type: 'number',
    default: 0,
    min: 0,
    max: 240,
    step: 1,
    label: L('Lock after idle minutes (0 = never)', 'Nach Minuten Inaktivität sperren (0 = nie)'),
  },
  // Desktop & wallpaper
  { key: 'wallpaper', type: 'string', default: 'live:particles', label: L('Wallpaper', 'Hintergrundbild') },
  {
    key: 'wallpaperFit',
    type: 'enum',
    default: 'fill',
    options: [
      { value: 'fill', label: L('Fill', 'Füllen') },
      { value: 'fit', label: L('Fit', 'Einpassen') },
      { value: 'center', label: L('Center', 'Zentriert') },
      { value: 'tile', label: L('Tile', 'Kacheln') },
    ],
    label: L('Picture position', 'Bildposition'),
  },
  {
    key: 'wallpaperDim',
    type: 'number',
    default: 0.15,
    min: 0,
    max: 0.8,
    step: 0.05,
    label: L('Dim wallpaper', 'Hintergrund abdunkeln'),
  },
  {
    key: 'wallpaperBlur',
    type: 'number',
    default: 0,
    min: 0,
    max: 30,
    step: 1,
    label: L('Blur wallpaper', 'Hintergrund weichzeichnen'),
  },
  { key: 'slideshowFolder', type: 'path', default: '', label: L('Slideshow folder', 'Ordner für Diashow') },
  {
    key: 'slideshowMinutes',
    type: 'number',
    default: 10,
    min: 1,
    max: 240,
    step: 1,
    label: L('Change picture every (minutes)', 'Bild wechseln alle (Minuten)'),
  },
  // Dock
  {
    key: 'dockPosition',
    type: 'enum',
    default: 'bottom',
    options: [
      { value: 'bottom', label: L('Bottom', 'Unten') },
      { value: 'left', label: L('Left', 'Links') },
      { value: 'right', label: L('Right', 'Rechts') },
    ],
    label: L('Dock position', 'Dock-Position'),
  },
  {
    key: 'dockAutoHide',
    type: 'boolean',
    default: false,
    label: L('Hide the dock automatically', 'Dock automatisch ausblenden'),
  },
  {
    key: 'dockMagnification',
    type: 'boolean',
    default: true,
    label: L('Magnify dock icons on hover', 'Dock-Symbole beim Überfahren vergrößern'),
  },
  {
    key: 'dockSize',
    type: 'number',
    default: 48,
    min: 32,
    max: 72,
    step: 2,
    label: L('Dock icon size', 'Größe der Dock-Symbole'),
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
  // Files
  {
    key: 'trashRetentionDays',
    type: 'number',
    default: 30,
    min: 0,
    max: 365,
    step: 1,
    label: L('Empty the trash automatically after (days)', 'Papierkorb automatisch leeren nach (Tagen)'),
    description: L('0 keeps items until you empty the trash.', '0 behält Einträge, bis du den Papierkorb leerst.'),
  },
];
