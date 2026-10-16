/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.help',
  name: { en: 'Help', de: 'Hilfe' },
  description: {
    en: 'Guides for Nexus and every app, with search',
    de: 'Anleitungen zu Nexus und jeder App, mit Suche',
  },
  version: '1.0.0',
  icon: 'help',
  category: 'system',
  keywords: ['help', 'docs', 'manual', 'guide', 'faq', 'hilfe', 'anleitung', 'handbuch'],
  window: { width: 920, height: 640, minWidth: 360, minHeight: 320, singleInstance: true },
  permissions: ['system'],
  commands: [
    { id: 'help.open', title: { en: 'Open Help', de: 'Hilfe öffnen' }, icon: 'help' },
    { id: 'help.forApp', title: { en: 'Help for this app', de: 'Hilfe zu dieser App' }, icon: 'help', shortcut: 'F1' },
  ],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  changelog: () => import('./changelog.md?raw'),
  screenshots: () => import('./screenshots/index.js'),
  load: () => import('./index.js'),
};
