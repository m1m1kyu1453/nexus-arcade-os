// Developer test app: exercises every part of ctx. Registered only in dev builds and tests.
/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.dev.test',
  name: { en: 'Kernel Test', de: 'Kernel-Test' },
  description: { en: 'Developer test app for the kernel', de: 'Entwickler-Test-App für den Kernel' },
  version: '1.0.0',
  icon: 'flask',
  category: 'system',
  keywords: ['debug', 'kernel'],
  window: { width: 480, height: 360 },
  permissions: ['vfs', 'notifications'],
  handles: [{ action: 'open', types: ['.nexustest'] }],
  commands: [
    { id: 'devtest.ping', title: { en: 'Ping the test app', de: 'Test-App anpingen' }, shortcut: 'Mod+Alt+P' },
  ],
  settings: [{ key: 'greeting', type: 'string', default: 'Hello', label: { en: 'Greeting', de: 'Begrüßung' } }],
  achievements: [
    {
      id: 'first-item',
      title: { en: 'First item', de: 'Erster Eintrag' },
      description: { en: 'Add an item', de: 'Füge einen Eintrag hinzu' },
    },
  ],
  widgets: [
    {
      id: 'ticker',
      title: { en: 'Kernel test widget', de: 'Kernel-Test-Widget' },
      size: [2, 1],
      settings: [{ key: 'prefix', type: 'string', default: 'Ticks:', label: { en: 'Prefix', de: 'Präfix' } }],
      load: () => import('./widget.js'),
    },
  ],
  storage: { version: 1, collections: { items: { indexes: { created: 'created' } } } },
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  search: () => import('./search.js'),
  load: () => import('./index.js'),
};
