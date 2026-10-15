// @ts-check
// Strings needed before the kernel's i18n is ready (update prompts from the Service Worker).

const en = {
  updateAvailable: 'Update available — reload to get the new version.',
  reload: 'Reload',
  offlineReady: 'Nexus is ready to work offline.',
  dismiss: 'Dismiss',
};

/** @type {typeof en} */
const de = {
  updateAvailable: 'Update verfügbar – neu laden, um die neue Version zu erhalten.',
  reload: 'Neu laden',
  offlineReady: 'Nexus ist bereit für die Offline-Nutzung.',
  dismiss: 'Schließen',
};

/** @param {readonly string[]} languages browser preference list */
export function pickStrings(languages) {
  const lang = languages
    .find((l) => /^(en|de)\b/i.test(l))
    ?.slice(0, 2)
    .toLowerCase();
  return lang === 'de' ? { locale: 'de', t: de } : { locale: 'en', t: en };
}
