// Service Worker registration and the update flow (website edition only).
import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/** @param {ReturnType<typeof import('./boot.js').boot>} shell */
export function registerServiceWorker(shell) {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    // New version installed and waiting: activate only when the user confirms.
    onNeedRefresh() {
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
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => navigator.onLine && registration.update(), UPDATE_CHECK_MS);
    },
  });
}
