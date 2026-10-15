// Boots the OS into its root element. Shared by both editions; edition-specific work
// (Service Worker) lives in the entry files.
import '../styles/base.css';
import { builtInApps } from '../apps/index.js';
import { buildDate, edition, version } from '../env.js';
import { startSystem } from '../kernel/system.js';
import { getPersistence } from '../services/storage/persist.js';
import { checkWorkers } from '../workers/check.js';
import { createBareHost } from './bare-host.js';
import { renderPlaceholder } from './placeholder.js';
import { pickStrings } from './strings.js';
import { createToastHost } from './toast.js';

/** @param {HTMLElement} root */
export function boot(root) {
  const { t, locale } = pickStrings(navigator.languages ?? [navigator.language]);
  document.documentElement.lang = locale;

  const screen = renderPlaceholder(root, { t, locale, version, buildDate, edition });
  const apps = document.createElement('div');
  apps.className = 'nx-apps';
  root.append(apps);
  const toasts = createToastHost(root);

  screen.setOnline(navigator.onLine);
  addEventListener('online', () => screen.setOnline(true));
  addEventListener('offline', () => screen.setOnline(false));

  screen.setWorkers('checking');
  checkWorkers().then((ok) => screen.setWorkers(ok ? 'ok' : 'fail'));
  getPersistence().then(screen.setStorage);

  const system = startKernel(apps, toasts, t.dismiss).then(
    (sys) => {
      document.documentElement.dataset.kernel = 'ready';
      document.documentElement.dataset.storage = sys.engine.kind;
      // The kernel asks for persistent storage on the first data write; show the result.
      sys.bus.once('storage:changed', () => setTimeout(() => getPersistence().then(screen.setStorage), 500));
      return sys;
    },
    (error) => {
      document.documentElement.dataset.kernel = 'failed';
      console.error('Nexus could not start', error);
      throw error;
    },
  );

  return {
    t,
    system,
    /** @param {Omit<import('./toast.js').ToastOptions, 'dismissLabel'>} options */
    toast: (options) => toasts.show({ ...options, dismissLabel: t.dismiss }),
  };
}

/**
 * @param {HTMLElement} apps
 * @param {ReturnType<typeof createToastHost>} toasts
 * @param {string} dismissLabel
 */
async function startKernel(apps, toasts, dismissLabel) {
  /** @type {import('../kernel/system.js').System} */
  let system;
  const host = createBareHost({ root: apps, system: () => system });
  const manifests = [...builtInApps];
  if (import.meta.env.DEV) manifests.push((await import('../dev/test-app/manifest.js')).default);
  system = await startSystem({ edition, version, dev: import.meta.env.DEV, manifests, host });

  // Until the phase 2 notification UI: show the service's toasts in the toast host.
  /** @type {Map<string, () => void>} */
  const open = new Map();
  system.bus.on('notification:shown', (n) => {
    const action = n.actions[0];
    const close = toasts.show({
      message: n.title,
      body: n.body,
      timeoutMs: n.timeoutMs,
      dismissLabel,
      action: action && { label: action.label, run: () => system.notifications.triggerAction(n.id, action.id) },
    });
    open.set(n.id, close);
  });
  system.bus.on('notification:closed', ({ id }) => {
    open.get(id)?.();
    open.delete(id);
  });

  if (import.meta.env.DEV) {
    const showDebug = async () => {
      if (location.hash !== '#debug') return;
      const { renderDebugScreen } = await import('../dev/debug.js');
      renderDebugScreen(document.body, system, apps);
    };
    addEventListener('hashchange', showDebug);
    await showDebug();
  }
  return system;
}
