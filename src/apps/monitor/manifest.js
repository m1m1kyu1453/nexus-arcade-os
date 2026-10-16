/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.monitor',
  name: { en: 'System Monitor', de: 'Systemmonitor' },
  description: {
    en: 'Windows, performance, storage, the system log and network activity',
    de: 'Fenster, Leistung, Speicher, Systemprotokoll und Netzwerkaktivität',
  },
  version: '1.0.0',
  icon: 'activity',
  category: 'system',
  keywords: ['task manager', 'processes', 'performance', 'fps', 'log', 'memory', 'taskmanager', 'prozesse', 'leistung'],
  window: { width: 860, height: 560, minWidth: 360, minHeight: 300, singleInstance: true },
  permissions: ['system'],
  commands: [
    { id: 'monitor.open', title: { en: 'Open System Monitor', de: 'Systemmonitor öffnen' }, icon: 'activity' },
  ],
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  help: () => import('./help.md?raw'),
  load: () => import('./index.js'),
};
