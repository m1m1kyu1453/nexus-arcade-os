/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.settings',
  name: { en: 'Settings', de: 'Einstellungen' },
  description: {
    en: 'Personalize Nexus and manage storage, backups, shortcuts and profiles',
    de: 'Nexus anpassen und Speicher, Backups, Tastenkürzel und Profile verwalten',
  },
  version: '1.0.0',
  icon: 'settings',
  category: 'system',
  keywords: ['preferences', 'options', 'control panel', 'system', 'einstellungen', 'optionen'],
  window: { width: 980, height: 660, minWidth: 360, minHeight: 360, singleInstance: true },
  permissions: ['vfs', 'notifications', 'intents', 'system'],
  commands: [
    {
      id: 'settings.open',
      title: { en: 'Open Settings', de: 'Einstellungen öffnen' },
      icon: 'settings',
      shortcut: 'Mod+,',
    },
  ],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  load: () => import('./index.js'),
};
