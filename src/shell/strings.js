// @ts-check
// Phase 0 strings. Moves to the i18n service (JSON per language) in phase 1.

const en = {
  tagline: 'Phase 1 — kernel ready',
  version: 'Version',
  built: 'Built',
  edition: 'Edition',
  editionWeb: 'Website',
  editionLite: 'Lite (single file)',
  network: 'Network',
  online: 'Online',
  offline: 'Offline',
  workers: 'Web Workers',
  checking: 'Checking…',
  workersOk: 'Running',
  workersFail: 'Unavailable in this browser',
  storage: 'Storage',
  persistent: 'Persistent',
  bestEffort: 'Not guaranteed — the browser may clear it',
  unsupported: 'Persistence not supported',
  updateAvailable: 'Update available — reload to get the new version.',
  reload: 'Reload',
  offlineReady: 'Nexus is ready to work offline.',
  dismiss: 'Dismiss',
};

/** @type {typeof en} */
const de = {
  tagline: 'Phase 1 — Kernel bereit',
  version: 'Version',
  built: 'Erstellt',
  edition: 'Edition',
  editionWeb: 'Website',
  editionLite: 'Lite (Einzeldatei)',
  network: 'Netzwerk',
  online: 'Online',
  offline: 'Offline',
  workers: 'Web Worker',
  checking: 'Wird geprüft …',
  workersOk: 'Laufen',
  workersFail: 'In diesem Browser nicht verfügbar',
  storage: 'Speicher',
  persistent: 'Dauerhaft',
  bestEffort: 'Nicht garantiert – der Browser kann Daten löschen',
  unsupported: 'Dauerhafter Speicher nicht unterstützt',
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
