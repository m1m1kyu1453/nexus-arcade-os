/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.editor',
  name: { en: 'Nexus Edit', de: 'Nexus Edit' },
  description: {
    en: 'Text and code editor with syntax highlighting, find & replace and tabs',
    de: 'Text- und Code-Editor mit Syntaxhervorhebung, Suchen & Ersetzen und Tabs',
  },
  version: '1.0.0',
  icon: 'file-code',
  category: 'system',
  keywords: ['text', 'editor', 'code', 'notepad', 'markdown', 'texteditor'],
  window: { width: 900, height: 620, minWidth: 360, minHeight: 260, singleInstance: true },
  permissions: ['vfs', 'intents'],
  handles: [
    {
      action: 'open',
      types: [
        'text/*',
        'application/json',
        'application/xml',
        'application/yaml',
        'application/x-sh',
        'application/sql',
        'image/svg+xml',
        '.nsh',
        '.env',
      ],
    },
    { action: 'share', types: ['text/plain'] },
  ],
  commands: [{ id: 'editor.new', title: { en: 'New text file', de: 'Neue Textdatei' }, icon: 'file-plus' }],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  changelog: () => import('./changelog.md?raw'),
  screenshots: () => import('./screenshots/index.js'),
  load: () => import('./index.js'),
};
