// Build settings shared by the website (vite.config.js) and Nexus Lite (vite.lite.config.js).
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * Compile-time constants. Declared for type checking in src/globals.d.ts.
 * @param {'web' | 'lite'} edition
 */
export function defineConstants(edition) {
  return {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __EDITION__: JSON.stringify(edition),
  };
}

/**
 * Content Security Policy, injected as a meta tag in production builds only
 * (Vite's dev server needs inline scripts and a websocket for HMR).
 * Lite needs 'unsafe-inline' because every script and style is inlined into one file.
 * @param {'web' | 'lite'} edition
 */
export function cspPlugin(edition) {
  const inline = edition === 'lite' ? " 'unsafe-inline'" : '';
  const policy = [
    "default-src 'self'",
    `script-src 'self'${inline}`,
    `style-src 'self'${inline}`,
    "img-src 'self' data: blob:",
    // File previews: audio/video and the browser's PDF viewer read VFS files as blob: URLs.
    "media-src 'self' blob:",
    "frame-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob: data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'nexus-csp',
    apply: /** @type {const} */ ('build'),
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: /** @type {const} */ ('head-prepend'),
      },
    ],
  };
}
