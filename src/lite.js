// Nexus Lite entry: same OS, single file, runs from file://. No Service Worker, no PWA install.
import { boot } from './shell/boot.js';

window.NEXUS_EDITION = 'lite';

boot(document.getElementById('nexus-root'));
