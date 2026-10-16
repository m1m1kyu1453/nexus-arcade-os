// Service Worker registration and the update flow (website edition only). Settings → Updates
// uses `ctx.system.updates` (set here) to check now and to apply a waiting update.
import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** @param {ReturnType<typeof import('./boot.js').boot>} shell */
export function registerServiceWorker(shell) {
  if (!('serviceWorker' in navigator)) return;

  /** @type {ServiceWorkerRegistration | undefined} */
  let registration;
  let waiting = false;

  const updateSW = registerSW({
    immediate: true,
    // New version installed and waiting: activate only when the user confirms.
    onNeedRefresh() {
      waiting = true;
      shell.toast({
        message: shell.t.updateAvailable,
        timeoutMs: 0,
        action: { label: shell.t.reload, run: () => updateSW(true) },
      });
    },
    onOfflineReady() {
      shell.toast({ message: shell.t.offlineReady });
    },
    // Long-lived tabs only check for updates on navigation; check hourly as well.
    onRegisteredSW(_url, reg) {
      registration = reg;
      if (reg) setInterval(() => navigator.onLine && reg.update(), UPDATE_CHECK_MS);
    },
  });

  const updates = {
    /** True once a new version is installed and waits for a reload. */
    get available() {
      return waiting;
    },
    /** @returns {Promise<'available' | 'current' | 'offline' | 'unavailable'>} */
    async check() {
      if (waiting) return 'available';
      if (!registration) return 'unavailable';
      if (!navigator.onLine) return 'offline';
      await registration.update();
      waiting ||= !!(registration.waiting || registration.installing);
      return waiting ? 'available' : 'current';
    },
    /** Activates the waiting version and reloads. */
    apply: () => updateSW(true),
  };
  void shell.system.then((sys) => Object.assign(sys.systemHost, { updates })).catch(() => {});
}
