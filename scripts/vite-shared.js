// Build settings shared by the website (vite.config.js) and Nexus Lite (vite.lite.config.js).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

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

/** Bundled although they are dev dependencies (the Service Worker and its registration). */
const ALSO_BUNDLED = ['workbox-core', 'workbox-precaching', 'workbox-routing', 'workbox-window'];
/** In the lockfile without being bundled (type definitions). */
const NOT_BUNDLED = new Set(['@types/trusted-types']);
const FONTS = [
  { name: 'Inter', version: '', license: 'OFL-1.1', file: 'src/styles/fonts/Inter-OFL.txt' },
  { name: 'JetBrains Mono', version: '', license: 'OFL-1.1', file: 'src/styles/fonts/JetBrainsMono-OFL.txt' },
];

/**
 * `virtual:nexus-licenses`: every third-party package and font in the build with its license
 * text, for Settings → About. Read from the lockfile and node_modules at build time, so the list
 * can't go stale.
 */
export function licensesPlugin() {
  const id = 'virtual:nexus-licenses';
  const resolved = `\0${id}`;
  const root = new URL('../', import.meta.url);
  const read = (/** @type {string} */ path) => readFileSync(new URL(path, root), 'utf8');
  /** @param {string} name */
  function licenseText(name) {
    for (const file of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE', 'COPYING']) {
      const path = `node_modules/${name}/${file}`;
      if (existsSync(new URL(path, root))) return read(path).trim();
    }
    return '';
  }
  return {
    name: 'nexus-licenses',
    /** @param {string} source */
    resolveId: (source) => (source === id ? resolved : null),
    /** @param {string} loadId */
    load(loadId) {
      if (loadId !== resolved) return null;
      const lock = JSON.parse(read('package-lock.json'));
      /** @type {Map<string, { name: string, version: string, license: string }>} */
      const packages = new Map();
      for (const [path, info] of Object.entries(lock.packages)) {
        if (!path.startsWith('node_modules/') || info.dev) continue;
        const name = path.slice(path.lastIndexOf('node_modules/') + 13);
        if (!NOT_BUNDLED.has(name)) packages.set(name, { name, version: info.version, license: info.license });
      }
      for (const name of ALSO_BUNDLED) {
        const info = lock.packages[`node_modules/${name}`];
        if (info) packages.set(name, { name, version: info.version, license: info.license });
      }
      const list = [
        ...[...packages.values()].map((p) => ({ ...p, kind: 'library', text: licenseText(p.name) })),
        ...FONTS.map(({ file, ...f }) => ({ ...f, kind: 'font', text: read(file).trim() })),
      ].sort((a, b) => a.name.localeCompare(b.name));
      return `export default ${JSON.stringify(list)};`;
    },
  };
}

/**
 * `virtual:nexus-app-sizes`: approximate code size per app id (bytes of its source folder:
 * scripts, styles, messages, images), for the App Center. Shared libraries are not included.
 */
export function appSizesPlugin() {
  const id = 'virtual:nexus-app-sizes';
  const resolved = `\0${id}`;
  const appsDir = new URL('../src/apps/', import.meta.url);
  /** @param {URL} dir @returns {number} */
  const folderSize = (dir) => {
    let total = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      total += entry.isDirectory() ? folderSize(url) : statSync(url).size;
    }
    return total;
  };
  return {
    name: 'nexus-app-sizes',
    /** @param {string} source */
    resolveId: (source) => (source === id ? resolved : null),
    /** @param {string} loadId */
    load(loadId) {
      if (loadId !== resolved) return null;
      /** @type {Record<string, number>} */
      const sizes = {};
      for (const entry of readdirSync(appsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = new URL(`${entry.name}/`, appsDir);
        const manifest = new URL('manifest.js', dir);
        if (!existsSync(manifest)) continue;
        const appId = /id:\s*'([^']+)'/.exec(readFileSync(manifest, 'utf8'))?.[1];
        if (appId) sizes[appId] = folderSize(dir);
      }
      return `export default ${JSON.stringify(sizes)};`;
    },
  };
}
