// E2E tests run against the production build: `npm run build` first.
// Projects: the website (desktop + phone viewport) via `vite preview`, and Nexus Lite via file://.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'web',
      testIgnore: /lite\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'web-mobile',
      testIgnore: /lite\.spec\.js/,
      use: { ...devices['Pixel 7'], baseURL: `http://localhost:${PORT}` },
    },
    {
      name: 'lite',
      testMatch: /lite\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
