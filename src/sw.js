// Service Worker (website edition only). vite-plugin-pwa injects the precache list
// (every chunk, style, font and icon of this build, with content hashes) into self.__WB_MANIFEST.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Serve the app shell for navigations while offline. Lite is a plain download, and opening an
// icon or the manifest directly should show that file, not the desktop.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/\/nexus-lite\.html$/, /\.(?:webmanifest|png|svg|ico)$/],
  }),
);

// A new version waits until the user confirms the "Update available" toast.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
