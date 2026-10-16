// Nexus Lite build: one self-contained HTML file that runs from file://.
// Runs after the website build and writes into the same dist/ folder.
import { readFileSync, renameSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { appSizesPlugin, cspPlugin, defineConstants, licensesPlugin } from './scripts/vite-shared.js';

/** Size budget for dist/nexus-lite.html. Change only with the owner's OK (see CLAUDE.md). */
const LITE_BUDGET_BYTES = 8 * 1024 * 1024;

const outDir = resolve(import.meta.dirname, 'dist');

/** Workers can't be loaded from separate files on file://, so inline them as Blob URLs. */
function inlineWorkers() {
  return {
    name: 'nexus-lite-inline-workers',
    enforce: /** @type {const} */ ('pre'),
    /** @param {string} code @param {string} id */
    transform(code, id) {
      if (!id.includes('/src/') || !code.includes('?worker')) return null;
      return { code: code.replace(/\?worker(['"])/g, '?worker&inline$1'), map: null };
    },
  };
}

/** Inline the logo as the favicon (a separate file would not travel with the single HTML file). */
function inlineFavicon() {
  const svg = readFileSync(resolve(import.meta.dirname, 'src/ui/brand/logo.svg'), 'utf8');
  return {
    name: 'nexus-lite-favicon',
    transformIndexHtml: () => [
      {
        tag: 'link',
        attrs: { rel: 'icon', type: 'image/svg+xml', href: `data:image/svg+xml,${encodeURIComponent(svg)}` },
        injectTo: /** @type {const} */ ('head'),
      },
    ],
  };
}

/** Rename lite.html → nexus-lite.html and enforce the size budget. */
function finalizeLite() {
  return {
    name: 'nexus-lite-finalize',
    apply: /** @type {const} */ ('build'),
    closeBundle() {
      const target = resolve(outDir, 'nexus-lite.html');
      renameSync(resolve(outDir, 'lite.html'), target);
      const size = statSync(target).size;
      const mb = (n) => (n / 1024 / 1024).toFixed(2);
      console.log(`\nnexus-lite.html: ${mb(size)} MB (budget ${mb(LITE_BUDGET_BYTES)} MB)`);
      if (size > LITE_BUDGET_BYTES) {
        throw new Error(`nexus-lite.html exceeds its size budget (${mb(size)} MB > ${mb(LITE_BUDGET_BYTES)} MB)`);
      }
    },
  };
}

export default defineConfig({
  define: defineConstants('lite'),
  publicDir: false,
  build: {
    target: 'es2022',
    outDir,
    emptyOutDir: false,
    rollupOptions: { input: resolve(import.meta.dirname, 'lite.html') },
  },
  worker: { format: 'iife' },
  plugins: [
    licensesPlugin(),
    appSizesPlugin(),
    cspPlugin('lite'),
    inlineFavicon(),
    inlineWorkers(),
    viteSingleFile({ removeViteModuleLoader: true }),
    finalizeLite(),
  ],
});
