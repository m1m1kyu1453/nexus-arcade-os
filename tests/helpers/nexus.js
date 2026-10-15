// Playwright helpers: start Nexus with a clean profile and optional seed data, and catch console errors.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';

/** file:// URL of the built Lite file. */
export const liteUrl = pathToFileURL(resolve(import.meta.dirname, '../../dist/nexus-lite.html')).href;

/**
 * Records console errors and uncaught exceptions. Call before navigating; assert with
 * `expect(errors).toEqual([])` at the end of the test.
 * @param {import('@playwright/test').Page} page
 */
export function collectErrors(page) {
  /** @type {string[]} */
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * Opens Nexus with an empty profile (all IndexedDB databases, localStorage and sessionStorage
 * deleted), runs `seed`, then loads the desktop on exactly that data. Storage is cleared from a
 * same-origin page without the app (the icon), so no open connection blocks the deletion.
 * Service Worker caches are kept: they are the installed app, not user data.
 * @template T
 * @param {import('@playwright/test').Page} page
 * @param {{ url?: string, seed?: (arg: T) => unknown, seedArg?: T }} [options]
 */
export async function startNexus(page, { url = '/', seed, seedArg } = {}) {
  await page.goto('/icons/icon.svg');
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    const databases = (await indexedDB.databases?.()) ?? [];
    await Promise.all(
      databases.map(
        ({ name }) =>
          new Promise((done) => {
            const request = indexedDB.deleteDatabase(/** @type {string} */ (name));
            request.onsuccess = request.onerror = request.onblocked = done;
          }),
      ),
    );
  });
  if (seed) await page.evaluate(seed, /** @type {T} */ (seedArg));
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-kernel', 'ready', { timeout: 15_000 });
}
