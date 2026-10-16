/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.appcenter',
  name: { en: 'App Center', de: 'App Center' },
  description: {
    en: 'All apps by category: details, permissions, install and uninstall',
    de: 'Alle Apps nach Kategorie: Details, Berechtigungen, installieren und deinstallieren',
  },
  version: '1.0.0',
  icon: 'apps',
  category: 'system',
  keywords: ['apps', 'store', 'install', 'uninstall', 'software', 'installieren', 'deinstallieren'],
  window: { width: 920, height: 620, minWidth: 360, minHeight: 320, singleInstance: true },
  permissions: ['system'],
  commands: [{ id: 'appcenter.open', title: { en: 'Open App Center', de: 'App Center öffnen' }, icon: 'apps' }],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  changelog: () => import('./changelog.md?raw'),
  screenshots: () => import('./screenshots/index.js'),
  load: () => import('./index.js'),
};
