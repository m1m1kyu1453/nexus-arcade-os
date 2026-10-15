// @ts-check
// Strings needed before the kernel's i18n is ready (update prompts from the Service Worker).

const en = {
  updateAvailable: 'Update available — reload to get the new version.',
  reload: 'Reload',
  offlineReady: 'Nexus is ready to work offline.',
  dismiss: 'Dismiss',
  bootTitle: 'Nexus is starting',
  bootSkip: 'Press any key to skip',
  bootSteps: {
    storage: 'Opening storage…',
    profile: 'Loading your profile…',
    settings: 'Reading settings…',
    theme: 'Applying the theme…',
    files: 'Mounting files…',
    services: 'Starting services…',
    migrations: 'Checking saved data…',
    apps: 'Registering apps…',
    search: 'Building the search index…',
    ready: 'Ready',
  },
};

/** @type {typeof en} */
const de = {
  updateAvailable: 'Update verfügbar – neu laden, um die neue Version zu erhalten.',
  reload: 'Neu laden',
  offlineReady: 'Nexus ist bereit für die Offline-Nutzung.',
  dismiss: 'Schließen',
  bootTitle: 'Nexus startet',
  bootSkip: 'Beliebige Taste zum Überspringen',
  bootSteps: {
    storage: 'Speicher wird geöffnet …',
    profile: 'Profil wird geladen …',
    settings: 'Einstellungen werden gelesen …',
    theme: 'Design wird angewendet …',
    files: 'Dateien werden eingebunden …',
    services: 'Dienste werden gestartet …',
    migrations: 'Gespeicherte Daten werden geprüft …',
    apps: 'Apps werden registriert …',
    search: 'Suchindex wird aufgebaut …',
    ready: 'Bereit',
  },
};

/** @param {readonly string[]} languages browser preference list */
export function pickStrings(languages) {
  const lang = languages
    .find((l) => /^(en|de)\b/i.test(l))
    ?.slice(0, 2)
    .toLowerCase();
  return lang === 'de' ? { locale: 'de', t: de } : { locale: 'en', t: en };
}
