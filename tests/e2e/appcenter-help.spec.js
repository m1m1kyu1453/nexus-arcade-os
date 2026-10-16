// App Center (uninstall hides an app everywhere and survives a reload; install brings it back)
// and Help (F1 opens the focused app's page; links, search, table of contents).
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus, waitForDesktop } from '../helpers/nexus.js';

/** @typedef {import('@playwright/test').Page} Page */

async function palette(/** @type {Page} */ page, /** @type {string} */ query, /** @type {RegExp} */ option) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(query);
  await expect(page.getByRole('option', { name: option }).first()).toBeVisible();
  await page.keyboard.press('Enter');
}

test.describe('app center and help', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows');

  test('uninstall hides an app everywhere, survives a reload, install brings it back', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    await startNexus(page);
    await page.keyboard.press('Escape');
    await palette(page, 'App Center', /^App Center/);
    const center = page.locator('.nx-windows [data-testid="appcenter"]');
    await center.locator('[data-testid="appcenter-card"][data-app="nexus.terminal"] button').click();
    await expect(center.getByTestId('appcenter-name')).toHaveText('Terminal');
    await expect(center.getByTestId('permissions')).toContainText('Files');
    const shot = center.locator('.nx-ac-shots img').first();
    await expect
      .poll(() => shot.evaluate((el) => /** @type {HTMLImageElement} */ (el).naturalWidth))
      .toBeGreaterThan(100);
    await expect(center.locator('.nx-ac-changelog')).toContainText('1.0.0');

    // Uninstall: gone from the palette and its shortcut does nothing.
    await center.getByTestId('uninstall').click();
    await page.locator('.nx-modal').getByRole('button', { name: 'Uninstall' }).click();
    await expect(center.getByTestId('install')).toBeVisible();
    await page.keyboard.press('Control+k');
    await page.keyboard.type('Terminal');
    await page.waitForTimeout(500);
    await expect(page.getByRole('option', { name: /^Terminal/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Still uninstalled after a reload.
    await page.waitForTimeout(1200);
    await page.reload();
    await waitForDesktop(page);
    await page.keyboard.press('Control+Alt+t');
    await page.waitForTimeout(500);
    await expect(page.locator('.nx-windows [data-testid="terminal"]')).toHaveCount(0);
    await center.locator('[data-category="hidden"]').click();
    await center.locator('[data-testid="appcenter-card"][data-app="nexus.terminal"] button').click();
    await center.getByTestId('install').click();
    await expect(center.getByTestId('uninstall')).toBeVisible();
    await page.keyboard.press('Control+Alt+t');
    await expect(page.locator('.nx-windows [data-testid="terminal"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('F1 opens help for the focused app; links, search and table of contents work', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Alt+t');
    const input = page.locator('.nx-windows [data-testid="term-input"]');
    await expect(input).toBeFocused();
    await page.keyboard.press('F1');
    const help = page.locator('.nx-windows [data-testid="help"]');
    const article = help.getByTestId('help-article');
    await expect(article.locator('h1')).toHaveText('Terminal');
    await expect(help.locator('.nx-help-toc-link', { hasText: 'Keys' })).toBeVisible();

    // A link to another page.
    await help.locator('[data-page="general/getting-started"]').click();
    await expect(article.locator('h1')).toHaveText('Getting started');
    await article.getByRole('link', { name: 'File Explorer' }).click();
    await expect(article.locator('h1')).toHaveText('File Explorer');

    // Search finds a passage on another page.
    await help.getByTestId('help-search').fill('encrypted');
    await help
      .getByTestId('help-result')
      .filter({ has: page.locator('strong', { hasText: /^Backups$/ }) })
      .click();
    await expect(article.locator('h1')).toHaveText('Backups');
    await expect(article.locator('.is-found')).toContainText('encrypted');

    // Code blocks are highlighted.
    await help.locator('[data-page="app/nexus.terminal"]').click();
    await expect(article.locator('pre .tok-comment').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
