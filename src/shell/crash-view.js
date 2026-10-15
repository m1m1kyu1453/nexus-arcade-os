// @ts-check
// "This app stopped working" view, shown inside a crashed app's window.
import { formatCrashReport } from '../kernel/error-boundary.js';
import './crash-view.css';

/**
 * @param {HTMLElement} container
 * @param {object} options
 * @param {import('../kernel/error-boundary.js').CrashReport} options.report
 * @param {string} options.appName
 * @param {{ t: (key: string, vars?: Record<string, unknown>) => string }} options.i18n  system scope
 * @param {{ writeText(text: string): Promise<void> }} options.clipboard
 * @param {{ restart(): void, close(): void }} options.actions
 */
export function renderCrashView(container, { report, appName, i18n, clipboard, actions }) {
  const text = formatCrashReport(report);
  const view = document.createElement('section');
  view.className = 'nx-crash';
  view.setAttribute('role', 'alert');
  view.innerHTML = `
    <svg class="nx-crash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2 class="nx-crash-title"></h2>
    <p class="nx-crash-body"></p>
    <details class="nx-crash-details"><summary></summary><pre></pre></details>
    <div class="nx-crash-actions">
      <button type="button" data-action="copy"></button>
      <button type="button" data-action="close"></button>
      <button type="button" data-action="restart" class="nx-crash-primary"></button>
    </div>`;
  /** @param {string} selector */
  const $ = (selector) => /** @type {HTMLElement} */ (view.querySelector(selector));
  $('.nx-crash-title').textContent = i18n.t('crash.title', { app: appName });
  $('.nx-crash-body').textContent = i18n.t('crash.body');
  $('summary').textContent = i18n.t('crash.details');
  $('pre').textContent = text;
  const copy = $('[data-action="copy"]');
  copy.textContent = i18n.t('crash.copy');
  $('[data-action="close"]').textContent = i18n.t('crash.close');
  $('[data-action="restart"]').textContent = i18n.t('crash.restart');

  copy.addEventListener('click', async () => {
    try {
      await clipboard.writeText(text);
      copy.textContent = i18n.t('crash.copied');
    } catch {
      // Copy failed (permissions): the report stays visible in Details to select manually.
      /** @type {HTMLDetailsElement} */ (view.querySelector('details')).open = true;
    }
  });
  $('[data-action="close"]').addEventListener('click', () => actions.close());
  $('[data-action="restart"]').addEventListener('click', () => actions.restart());

  container.replaceChildren(view);
  $('[data-action="restart"]').focus();
  return view;
}
