// Settings main flows: search and deep links, theme, language, accessibility, shortcuts, PIN
// lock, licenses, and backup → change → restore.
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus, waitForDesktop } from '../helpers/nexus.js';

/** @typedef {import('@playwright/test').Page} Page */

const settings = (/** @type {Page} */ page) => page.locator('.nx-windows [data-testid="settings"]');
const nav = (/** @type {Page} */ page, /** @type {string} */ id) =>
  settings(page).locator(`[data-testid="settings-nav"][data-page="${id}"]`);
const row = (/** @type {Page} */ page, /** @type {string} */ id) => settings(page).locator(`[data-setting="${id}"]`);

async function openSettings(/** @type {Page} */ page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Comma');
  await expect(settings(page)).toBeVisible();
}

test.describe('settings', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows');

  test('search, theme, palette deep link, language, accessibility, shortcuts, lock, licenses', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    await startNexus(page);
    await openSettings(page);

    // Search finds a single setting and jumps to it.
    await settings(page).getByTestId('settings-search').fill('dock position');
    await settings(page).getByTestId('settings-result').first().click();
    await expect(row(page, 'system/dockPosition')).toHaveClass(/is-highlighted/);
    await expect(nav(page, 'desktop')).toHaveAttribute('aria-current', 'page');

    // Changing the theme applies at once.
    await nav(page, 'personalization').click();
    await row(page, 'system/theme').locator('select').selectOption('synthwave');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'synthwave');

    // The palette's @ mode opens a setting in Settings.
    await page.keyboard.press('Control+k');
    await page.keyboard.type('@Keyboard focus ring');
    await expect(page.getByRole('option', { name: /Keyboard focus ring/ }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Open in Settings' }).click();
    await expect(nav(page, 'accessibility')).toHaveAttribute('aria-current', 'page');
    await expect(row(page, 'system/focusRing')).toHaveClass(/is-highlighted/);

    // Accessibility options take effect on the whole OS.
    await row(page, 'system/focusRing')
      .getByRole('radio', { name: /Strong/ })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-focus-ring', 'strong');
    await row(page, 'system/largeTargets').locator('input').check({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-large-targets', 'true');

    // Language: the whole app switches.
    await nav(page, 'language').click();
    await row(page, 'system/language').getByRole('radio', { name: 'German' }).click();
    await expect(nav(page, 'language')).toContainText('Sprache & Region');
    await row(page, 'system/language').getByRole('radio', { name: 'Englisch' }).click();
    await expect(nav(page, 'language')).toContainText('Language & Region');

    // Shortcuts: record a new one for "Change theme…".
    await nav(page, 'shortcuts').click();
    await settings(page).getByPlaceholder('Filter shortcuts').fill('change theme');
    const themeRow = settings(page).locator('[data-command="system.theme.pick"]');
    await themeRow.getByRole('button', { name: 'Change', exact: true }).click();
    await page.keyboard.press('Control+Alt+j');
    await expect(themeRow.locator('kbd')).toHaveText('Ctrl+Alt+J');
    await page.keyboard.press('Control+Alt+j');
    await expect(page.locator('.nx-palette-input')).toBeFocused();
    await page.keyboard.press('Escape'); // back from the theme list
    await page.keyboard.press('Escape'); // close the palette
    await expect(page.locator('.nx-palette-input')).toBeHidden();

    // PIN lock: set, then remove.
    await nav(page, 'profiles').click();
    await settings(page).getByRole('button', { name: 'Set a PIN or password' }).click();
    const pin = page.getByRole('dialog', { name: 'Set a PIN or password' });
    await pin.getByLabel('New PIN or password').fill('2468');
    await pin.getByLabel('Repeat').fill('2468');
    await pin.getByRole('button', { name: 'Save' }).click();
    await expect(settings(page)).toContainText('Locked with a PIN');
    await settings(page).getByRole('button', { name: 'Remove lock' }).click();
    const remove = page.getByRole('dialog', { name: 'Remove lock' });
    await remove.getByLabel('Current PIN or password').fill('2468');
    await remove.getByRole('button', { name: 'Remove lock' }).click();
    await expect(settings(page)).toContainText('No lock');

    // About lists the bundled licenses.
    await nav(page, 'about').click();
    await expect(
      settings(page).getByTestId('licenses').locator('details', { hasText: 'codemirror' }).first(),
    ).toBeVisible();
    await expect(settings(page).getByTestId('licenses').locator('details', { hasText: 'JetBrains Mono' })).toHaveCount(
      1,
    );

    // The page survives a reload.
    await page.waitForTimeout(1200);
    await page.reload();
    await waitForDesktop(page);
    await expect(nav(page, 'about')).toHaveAttribute('aria-current', 'page');
    expect(errors).toEqual([]);
  });

  test('backup → change → restore brings the data back', async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    await startNexus(page);
    await openSettings(page);
    await nav(page, 'personalization').click();
    await row(page, 'system/theme').locator('select').selectOption('matrix');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');

    // Export with a password.
    await nav(page, 'backup').click();
    await settings(page).getByLabel('Password (optional)').fill('secret');
    await settings(page).getByLabel('Repeat password').fill('secret');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      settings(page).getByTestId('backup-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.nexus-backup$/);
    const file = await download.path();

    // Change something, then restore the backup (replace).
    await nav(page, 'personalization').click();
    await row(page, 'system/theme').locator('select').selectOption('paper');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
    await nav(page, 'backup').click();
    await settings(page).getByTestId('backup-file').setInputFiles(file);
    const preview = settings(page).getByTestId('backup-preview');
    await expect(preview).toContainText('encrypted');
    await preview.getByLabel('Password (optional)').fill('secret');
    await preview.getByRole('button', { name: 'Open' }).click();
    await expect(preview).toContainText('Made with');
    await preview.getByTestId('backup-restore').click();
    await page.locator('.nx-modal').getByRole('button', { name: 'Restore', exact: true }).click();
    await waitForDesktop(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
    expect(errors).toEqual([]);
  });
});
