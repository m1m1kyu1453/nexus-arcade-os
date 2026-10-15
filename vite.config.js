// Website build: multi-file, code-split, PWA with a precaching Service Worker.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { cspPlugin, defineConstants } from './scripts/vite-shared.js';

export default defineConfig({
  define: defineConstants('web'),
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    cspPlugin('web'),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Lite is a download, not part of the app shell (and is several MB).
        globIgnores: ['nexus-lite.html'],
      },
      manifest: {
        name: 'Nexus Arcade OS',
        short_name: 'Nexus',
        description: 'A futuristic desktop operating system in your browser. Works offline.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#05060d',
        theme_color: '#05060d',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
