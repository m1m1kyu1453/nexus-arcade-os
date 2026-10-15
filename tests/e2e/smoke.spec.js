import { expect, test } from '@playwright/test';
import { collectErrors, startNexus } from '../helpers/nexus.js';

test('website loads with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Nexus Arcade OS' })).toBeVisible();
  await expect(page.getByTestId('edition')).toHaveAttribute('data-edition', 'web');
  await expect(page.getByTestId('network')).toHaveAttribute('data-state', 'online');
  await expect(page.getByTestId('workers')).toHaveAttribute('data-state', 'ok');
  await page.evaluate(() => navigator.serviceWorker.ready);
  expect(errors).toEqual([]);
});

test('still loads after going offline and reloading', async ({ page, context }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  // The first visit installs the Service Worker and precaches the app.
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Nexus Arcade OS' })).toBeVisible();
  await expect(page.getByTestId('network')).toHaveAttribute('data-state', 'offline');
  await expect(page.getByTestId('workers')).toHaveAttribute('data-state', 'ok');
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
