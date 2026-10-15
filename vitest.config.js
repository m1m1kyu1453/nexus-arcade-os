import { defineConfig } from 'vitest/config';
import { defineConstants } from './scripts/vite-shared.js';

export default defineConfig({
  define: defineConstants('web'),
  test: {
    include: ['tests/unit/**/*.test.js'],
    // Node by default (real Blob + structuredClone for IndexedDB tests).
    // DOM tests opt in with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    setupFiles: ['tests/helpers/setup-unit.js'],
    restoreMocks: true,
  },
});
