/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.terminal',
  name: { en: 'Terminal', de: 'Terminal' },
  description: {
    en: 'A shell for files and apps: pipes, redirection, history, tabs',
    de: 'Eine Shell für Dateien und Apps: Pipes, Umleitung, Verlauf, Tabs',
  },
  version: '1.0.0',
  icon: 'terminal',
  category: 'system',
  keywords: ['shell', 'console', 'command line', 'bash', 'cli', 'konsole', 'kommandozeile'],
  window: { width: 780, height: 500, minWidth: 360, minHeight: 240 },
  permissions: ['vfs', 'intents', 'clipboard', 'notifications', 'system'],
  commands: [
    {
      id: 'terminal.open',
      title: { en: 'Open Terminal', de: 'Terminal öffnen' },
      icon: 'terminal',
      shortcut: 'Mod+Alt+T',
    },
  ],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  changelog: () => import('./changelog.md?raw'),
  screenshots: () => import('./screenshots/index.js'),
  load: () => import('./index.js'),
};
