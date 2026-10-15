// @ts-check
// Built-in widgets, declared like an app manifest's `widgets` so the host treats them the same.
// "Today's tasks" and "Now playing" come with the Tasks and Music apps (they need their data).

/** @type {import('../../../kernel/types').L10n} */
const ZONES_HELP = {
  en: 'IANA time zones separated by commas, e.g. Europe/Berlin, America/New_York. Empty = local time.',
  de: 'IANA-Zeitzonen durch Kommas getrennt, z. B. Europe/Berlin, America/New_York. Leer = Ortszeit.',
};

/** @type {import('../../../kernel/types').AppManifest} */
export const BUILTIN_WIDGETS = {
  id: 'nexus.widgets',
  name: { en: 'Widgets', de: 'Widgets' },
  description: { en: 'Built-in desktop widgets', de: 'Eingebaute Desktop-Widgets' },
  version: '1.0.0',
  icon: 'layout-quarters',
  category: 'system',
  load: async () => ({ mount: () => ({}) }),
  widgets: [
    {
      id: 'clock',
      title: { en: 'Clock', de: 'Uhr' },
      icon: 'clock',
      size: [2, 2],
      settings: [
        {
          key: 'style',
          type: 'enum',
          default: 'digital',
          label: { en: 'Style', de: 'Stil' },
          options: [
            { value: 'digital', label: { en: 'Digital', de: 'Digital' } },
            { value: 'analog', label: { en: 'Analog', de: 'Analog' } },
            { value: 'world', label: { en: 'World clock', de: 'Weltuhr' } },
          ],
        },
        { key: 'seconds', type: 'boolean', default: false, label: { en: 'Show seconds', de: 'Sekunden anzeigen' } },
        {
          key: 'zones',
          type: 'string',
          default: '',
          label: { en: 'Time zones', de: 'Zeitzonen' },
          description: ZONES_HELP,
        },
      ],
      load: () => import('./clock.js'),
    },
    {
      id: 'calendar',
      title: { en: 'Calendar', de: 'Kalender' },
      icon: 'calendar',
      size: [3, 3],
      minSize: [2, 2],
      load: () => import('./calendar.js'),
    },
    {
      id: 'status',
      title: { en: 'System status', de: 'Systemstatus' },
      icon: 'activity',
      size: [2, 2],
      load: () => import('./status.js'),
    },
    {
      id: 'note',
      title: { en: 'Quick note', de: 'Schnellnotiz' },
      icon: 'sticky-note',
      size: [2, 2],
      settings: [
        {
          key: 'path',
          type: 'path',
          default: '',
          label: { en: 'File', de: 'Datei' },
          description: {
            en: 'A text file in Nexus. Empty = Documents/Quick note.md',
            de: 'Eine Textdatei in Nexus. Leer = Dokumente/Quick note.md',
          },
        },
      ],
      load: () => import('./note.js'),
    },
    {
      id: 'pomodoro',
      title: { en: 'Pomodoro', de: 'Pomodoro' },
      icon: 'timer',
      size: [2, 2],
      settings: [
        {
          key: 'work',
          type: 'number',
          default: 25,
          min: 1,
          max: 120,
          label: { en: 'Focus minutes', de: 'Fokus-Minuten' },
        },
        {
          key: 'break',
          type: 'number',
          default: 5,
          min: 1,
          max: 60,
          label: { en: 'Break minutes', de: 'Pausen-Minuten' },
        },
      ],
      load: () => import('./pomodoro.js'),
    },
    {
      id: 'countdown',
      title: { en: 'Countdown', de: 'Countdown' },
      icon: 'hourglass',
      size: [2, 1],
      settings: [
        { key: 'date', type: 'date', default: '', label: { en: 'Date', de: 'Datum' } },
        { key: 'label', type: 'string', default: '', label: { en: 'Name', de: 'Name' } },
      ],
      load: () => import('./countdown.js'),
    },
    {
      id: 'launcher',
      title: { en: 'App launcher', de: 'App-Starter' },
      icon: 'apps',
      size: [2, 2],
      settings: [
        {
          key: 'source',
          type: 'enum',
          default: 'pinned',
          label: { en: 'Show', de: 'Anzeigen' },
          options: [
            { value: 'pinned', label: { en: 'Dock apps', de: 'Dock-Apps' } },
            { value: 'recent', label: { en: 'Recent apps', de: 'Zuletzt verwendete Apps' } },
            { value: 'all', label: { en: 'All apps', de: 'Alle Apps' } },
          ],
        },
      ],
      load: () => import('./launcher.js'),
    },
  ],
};
