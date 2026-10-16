/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vanillajs" />

// Compile-time constants injected by Vite `define` (scripts/vite-shared.js).
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;
declare const __EDITION__: 'web' | 'lite';

interface Window {
  /** Set by the entry point (src/main.js or src/lite.js). */
  NEXUS_EDITION: 'web' | 'lite';
}
declare module 'virtual:nexus-licenses' {
  const list: { name: string; version: string; license: string; kind: 'library' | 'font'; text: string }[];
  export default list;
}
declare module 'virtual:nexus-app-sizes' {
  const sizes: Record<string, number>;
  export default sizes;
}
