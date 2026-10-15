import { expect, test } from '@playwright/test';
import { collectErrors, startNexus } from '../helpers/nexus.js';

/** The desktop is up: kernel ready, top bar, and the Welcome window on first start. */
async function expectDesktop(page) {
  await expect(page.locator('html')).toHaveAttribute('data-kernel', 'ready');
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByRole('dialog', { name: /Welcome|Willkommen/ }).first()).toBeVisible();
}

test('website loads the desktop with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expectDesktop(page);
  await expect(page.locator('html')).toHaveAttribute('data-storage', 'indexeddb');
  await expect(page.locator('html')).toHaveAttribute('data-search', 'worker');
  expect(await page.evaluate(() => window.NEXUS_EDITION)).toBe('web');
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(errors).toEqual([]);
});

test('still loads after going offline and reloading', async ({ page, context }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  // The first visit installs the Service Worker and precaches the app.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expectDesktop(page);

  await context.setOffline(true);
  await page.reload();
  // The kernel (incl. lazily loaded chunks like the search worker and the app) boots offline.
  await expectDesktop(page);
  // Fonts come from the precache too.
  expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
  expect(errors).toEqual([]);
});

test('starts with a clean profile and seed data', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('leftover', 'from a previous test'));

  await startNexus(page, { seed: (value) => localStorage.setItem('seeded', value), seedArg: 'yes' });

  expect(await page.evaluate(() => localStorage.getItem('leftover'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('seeded'))).toBe('yes');
});

test('serves the web app manifest and icons', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Nexus Arcade OS', display: 'standalone', start_url: '/' });
  for (const icon of manifest.icons) {
    expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
  }
});
