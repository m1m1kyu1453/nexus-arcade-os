// Boots the OS into its root element. Shared by both editions; edition-specific work
// (Service Worker) lives in the entry files.
import '../styles/base.css';
import { buildDate, edition, version } from '../env.js';
import { getPersistence, requestPersistence } from '../services/storage/persist.js';
import { checkWorkers } from '../workers/check.js';
import { renderPlaceholder } from './placeholder.js';
import { pickStrings } from './strings.js';
import { createToastHost } from './toast.js';

/** @param {HTMLElement} root */
export function boot(root) {
  const { t, locale } = pickStrings(navigator.languages ?? [navigator.language]);
  document.documentElement.lang = locale;

  const screen = renderPlaceholder(root, { t, locale, version, buildDate, edition });
  const toasts = createToastHost(root);

  screen.setOnline(navigator.onLine);
  addEventListener('online', () => screen.setOnline(true));
  addEventListener('offline', () => screen.setOnline(false));

  screen.setWorkers('checking');
  checkWorkers().then((ok) => screen.setWorkers(ok ? 'ok' : 'fail'));

  // Phase 0 stand-in for "first meaningful use": the first interaction. From phase 1 the
  // storage service asks on the first real data write instead.
  getPersistence().then(screen.setStorage);
  const askOnce = () => requestPersistence().then(screen.setStorage);
  addEventListener('pointerdown', askOnce, { once: true });

  return {
    t,
    /** @param {Omit<import('./toast.js').ToastOptions, 'dismissLabel'>} options */
    toast: (options) => toasts.show({ ...options, dismissLabel: t.dismiss }),
  };
}
