/** @type {import('../../kernel/types').AppManifest} */
export default {
  id: 'nexus.welcome',
  name: { en: 'Welcome', de: 'Willkommen' },
  description: { en: 'A quick tour of Nexus', de: 'Eine kurze Tour durch Nexus' },
  version: '1.0.0',
  icon: 'sparkles',
  category: 'system',
  keywords: ['tour', 'help', 'start', 'shortcuts', 'hilfe'],
  window: { width: 640, height: 520, minWidth: 360, minHeight: 320 },
  messages: { en: () => import('./i18n/en.json'), de: () => import('./i18n/de.json') },
  load: () => import('./index.js'),
};
