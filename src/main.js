// Website entry: boots Nexus and registers the Service Worker for offline use and updates.
import { boot } from './shell/boot.js';
import { registerServiceWorker } from './shell/pwa.js';

window.NEXUS_EDITION = 'web';

const shell = boot(document.getElementById('nexus-root'));
registerServiceWorker(shell);
