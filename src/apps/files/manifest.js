/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.files',
  name: { en: 'File Explorer', de: 'Datei-Explorer' },
  description: {
    en: 'Browse, organize, preview and tag your files',
    de: 'Dateien durchsuchen, ordnen, ansehen und verschlagworten',
  },
  version: '1.0.0',
  icon: 'folder-open',
  category: 'system',
  keywords: ['files', 'folders', 'explorer', 'finder', 'trash', 'dateien', 'ordner', 'papierkorb'],
  window: { width: 980, height: 620, minWidth: 380, minHeight: 320 },
  permissions: ['vfs', 'intents', 'clipboard', 'system'],
  handles: [{ action: 'open', types: ['inode/directory'] }],
  commands: [
    { id: 'files.open', title: { en: 'Open File Explorer', de: 'Datei-Explorer öffnen' }, icon: 'folder-open' },
    { id: 'files.trash', title: { en: 'Open Trash', de: 'Papierkorb öffnen' }, icon: 'trash' },
  ],
  settings: [
    {
      key: 'showHidden',
      type: 'boolean',
      default: false,
      label: { en: 'Show hidden files', de: 'Versteckte Dateien anzeigen' },
    },
    {
      key: 'confirmTrash',
      type: 'boolean',
      default: false,
      label: { en: 'Ask before moving to the trash', de: 'Vor dem Verschieben in den Papierkorb fragen' },
    },
  ],
  terminal: [
    {
      name: 'explore',
      description: { en: 'Open a folder in the File Explorer', de: 'Einen Ordner im Datei-Explorer öffnen' },
      usage: 'explore [FOLDER]',
    },
  ],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  load: () => import('./index.js'),
};
