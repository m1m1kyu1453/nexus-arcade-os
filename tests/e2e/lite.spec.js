import { expect, test } from '@playwright/test';
import { collectErrors, liteUrl } from '../helpers/nexus.js';

test('nexus-lite.html runs the desktop from file:// with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  /** @type {string[]} */
  const requests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('data:') && !request.url().startsWith('blob:')) requests.push(request.url());
  });

  await page.goto(liteUrl);
  await expect(page.locator('html')).toHaveAttribute('data-kernel', 'ready');
  expect(await page.evaluate(() => window.NEXUS_EDITION)).toBe('lite');
  expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
  await expect(page.getByRole('dialog', { name: /Welcome|Willkommen/ }).first()).toBeVisible();
  // IndexedDB works on file://, and the search worker starts from an inline Blob URL.
  await expect(page.locator('html')).toHaveAttribute('data-storage', 'indexeddb');
  await expect(page.locator('html')).toHaveAttribute('data-search', 'worker');

  // Fully self-contained: the only file loaded is the HTML itself.
  expect(requests).toEqual([liteUrl]);
  expect(errors).toEqual([]);
});
