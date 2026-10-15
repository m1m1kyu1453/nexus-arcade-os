import { expect, test } from '@playwright/test';
import { collectErrors, liteUrl } from '../helpers/nexus.js';

test('nexus-lite.html loads from file:// with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  /** @type {string[]} */
  const requests = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('data:') && !request.url().startsWith('blob:')) requests.push(request.url());
  });

  await page.goto(liteUrl);
  await expect(page.getByRole('heading', { name: 'Nexus Arcade OS' })).toBeVisible();
  await expect(page.getByTestId('edition')).toHaveAttribute('data-edition', 'lite');
  expect(await page.evaluate(() => window.NEXUS_EDITION)).toBe('lite');
  expect(await page.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();

  // Proof that workers start from an inline Blob URL on file://.
  await expect(page.getByTestId('workers')).toHaveAttribute('data-state', 'ok');
  // The whole kernel runs from file:// (IndexedDB, search worker from a Blob URL).
  await expect(page.locator('html')).toHaveAttribute('data-kernel', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-storage', 'indexeddb');

  // Fully self-contained: the only file loaded is the HTML itself.
  expect(requests).toEqual([liteUrl]);
  expect(errors).toEqual([]);
});
