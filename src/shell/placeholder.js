// Phase 0 placeholder screen. Replaced by the real desktop in phase 2.
import logo from '../ui/brand/logo.svg?raw';
import './placeholder.css';

/**
 * @param {HTMLElement} root
 * @param {{ t: Record<string, string>, locale: string, version: string, buildDate: string, edition: 'web' | 'lite' }} info
 */
export function renderPlaceholder(root, { t, locale, version, buildDate, edition }) {
  const built = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(buildDate),
  );
  const main = document.createElement('main');
  main.className = 'nx-placeholder';
  main.innerHTML = `
    <div class="nx-placeholder-logo">${logo}</div>
    <h1>Nexus Arcade OS</h1>
    <p class="nx-placeholder-tagline"></p>
    <dl class="nx-placeholder-facts">
      <div><dt data-k="version"></dt><dd data-testid="version"></dd></div>
      <div><dt data-k="built"></dt><dd data-testid="build-date"></dd></div>
      <div><dt data-k="edition"></dt><dd data-testid="edition"></dd></div>
      <div><dt data-k="network"></dt><dd data-testid="network"><span class="nx-dot"></span><span></span></dd></div>
      <div><dt data-k="workers"></dt><dd data-testid="workers"></dd></div>
      <div><dt data-k="storage"></dt><dd data-testid="storage"></dd></div>
    </dl>`;
  root.append(main);

  /** @param {string} id */
  const field = (id) => /** @type {HTMLElement} */ (main.querySelector(`[data-testid="${id}"]`));
  for (const dt of main.querySelectorAll('dt')) dt.textContent = t[/** @type {HTMLElement} */ (dt).dataset.k];
  main.querySelector('.nx-placeholder-tagline').textContent = t.tagline;
  field('version').textContent = version;
  field('build-date').textContent = built;
  field('edition').textContent = edition === 'lite' ? t.editionLite : t.editionWeb;
  field('edition').dataset.edition = edition;

  return {
    /** @param {boolean} online */
    setOnline(online) {
      const el = field('network');
      el.dataset.state = online ? 'online' : 'offline';
      el.lastElementChild.textContent = online ? t.online : t.offline;
    },
    /** @param {'checking' | 'ok' | 'fail'} state */
    setWorkers(state) {
      const el = field('workers');
      el.dataset.state = state;
      el.textContent = { checking: t.checking, ok: t.workersOk, fail: t.workersFail }[state];
    },
    /** @param {import('../services/storage/persist.js').PersistenceState} state */
    setStorage(state) {
      const el = field('storage');
      el.dataset.state = state;
      el.textContent = { persistent: t.persistent, 'best-effort': t.bestEffort, unsupported: t.unsupported }[state];
    },
  };
}
