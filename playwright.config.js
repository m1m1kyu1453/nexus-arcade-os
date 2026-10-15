// E2E tests run against the production build: `npm run build` first.
// Projects: the website (desktop + phone viewport) via `vite preview`, and Nexus Lite via file://.
// Set NEXUS_BASE_URL to run the website projects against a deployed site instead (`npm run test:live`).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const baseURL = process.env.NEXUS_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: process.env.NEXUS_BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    {
      name: 'web',
      testIgnore: /lite\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL },
    },
    {
      name: 'web-mobile',
      testIgnore: /lite\.spec\.js/,
      use: { ...devices['Pixel 7'], baseURL },
    },
    {
      name: 'lite',
      testMatch: /lite\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
