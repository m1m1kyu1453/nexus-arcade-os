// File Explorer main flows: create, upload, preview, views, copy/paste, rename, trash/restore,
// undo, tags and search; the location survives a reload.
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus, waitForDesktop } from '../helpers/nexus.js';

/** @typedef {import('@playwright/test').Page} Page */

const files = (/** @type {Page} */ page) => page.locator('.nx-windows [data-testid="files"]');
const item = (/** @type {Page} */ page, /** @type {string} */ name) =>
  files(page).locator('.nx-files-view .nx-files-item', {
    has: page.locator('.nx-files-name', { hasText: new RegExp(`^${name.replace(/[.()]/g, '\\$&')}$`) }),
  });
const status = (/** @type {Page} */ page) => files(page).getByTestId('files-status');

async function openExplorer(/** @type {Page} */ page) {
  await page.keyboard.press('Escape'); // leave the Welcome window
  await page.keyboard.press('Control+k');
  await page.keyboard.type('File Explorer');
  await expect(page.getByRole('option', { name: /File Explorer/ }).first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(files(page)).toBeVisible();
}

async function upload(
  /** @type {Page} */ page,
  /** @type {{ name: string, mimeType: string, buffer: Buffer }[]} */ list,
) {
  await files(page).locator('input[type=file]').setInputFiles(list);
  for (const f of list) await expect(item(page, f.name)).toBeVisible();
}

// 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

test.describe('file explorer', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows (the mobile run covers the sheet layout)');

  test('create, upload, preview, views, copy/paste, rename, trash, restore, undo, tags, search', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    await openExplorer(page);

    // Documents from the sidebar; a new folder named inline.
    await files(page).locator('[data-testid="files-place"][data-location$="/Documents"]').click();
    await expect(files(page).getByTestId('files-crumbs')).toContainText('Documents');
    await files(page)
      .getByTestId('files-view')
      .click({ position: { x: 300, y: 200 } });
    await page.keyboard.press('Control+Shift+N');
    await expect(files(page).locator('.nx-files-rename')).toBeFocused();
    await page.keyboard.type('Work');
    await page.keyboard.press('Enter');
    await expect(item(page, 'Work')).toBeVisible();

    await upload(page, [
      { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Plan\n\nShip **phase 3**.') },
      { name: 'app.js', mimeType: 'text/javascript', buffer: Buffer.from('const answer = 42;\n') },
      { name: 'pixel.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(status(page)).toContainText('4 items');

    // Preview pane: rendered Markdown, highlighted code, an image.
    await page.keyboard.press('Alt+p');
    const preview = files(page).getByTestId('files-preview');
    await item(page, 'notes.md').click();
    await expect(preview.locator('h1')).toHaveText('Plan');
    await item(page, 'app.js').click();
    await expect(preview.locator('.tok-keyword').first()).toHaveText('const');
    await item(page, 'pixel.png').click();
    const img = preview.locator('img.nx-files-preview-img');
    await expect.poll(() => img.evaluate((el) => /** @type {HTMLImageElement} */ (el).naturalWidth)).toBe(1);

    // Details view sorts by size (largest first on the first click).
    await files(page).locator('.nx-files-views [data-view="details"]').click();
    await files(page).locator('.nx-files-header button', { hasText: 'Size' }).click();
    await expect(files(page).locator('.nx-files-view .nx-files-item').nth(1)).toContainText('pixel.png');

    // Column view: a column per folder from home down.
    await files(page).locator('.nx-files-views [data-view="columns"]').click();
    await expect(files(page).locator('.nx-files-column')).toHaveCount(2);
    await files(page).locator('.nx-files-views [data-view="list"]').click();

    // Copy notes.md into Work with the keyboard.
    await item(page, 'notes.md').click();
    await page.keyboard.press('Control+c');
    await item(page, 'Work').dblclick();
    await expect(files(page).getByTestId('files-crumbs')).toContainText('Work');
    await files(page)
      .getByTestId('files-view')
      .click({ position: { x: 300, y: 200 } });
    await page.keyboard.press('Control+v');
    await expect(item(page, 'notes.md')).toBeVisible();

    // Rename (F2), then undo it.
    await item(page, 'notes.md').click();
    await page.keyboard.press('F2');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('plan.md');
    await page.keyboard.press('Enter');
    await expect(item(page, 'plan.md')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(item(page, 'notes.md')).toBeVisible();

    // Back, then trash app.js; it shows in the trash with its original location; restore it.
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(item(page, 'app.js')).toBeVisible();
    await item(page, 'app.js').click();
    await page.keyboard.press('Delete');
    await expect(item(page, 'app.js')).toHaveCount(0);
    await files(page).locator('[data-testid="files-place"][data-location="/.trash"]').click();
    await files(page).locator('.nx-files-views [data-view="details"]').click();
    await expect(item(page, 'app.js')).toContainText('~/Documents');
    await item(page, 'app.js').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Restore' }).click();
    await expect(item(page, 'app.js')).toHaveCount(0);
    await expect(files(page).getByText('The trash is empty')).toBeVisible();

    // Tag a file in Properties; it appears under Tags in the sidebar.
    await files(page).locator('[data-testid="files-place"][data-location$="/Documents"]').click();
    await item(page, 'app.js').click();
    await page.keyboard.press('Alt+Enter');
    const dialog = page.getByRole('dialog', { name: /Properties of/ });
    await dialog.getByTestId('files-props-tags').fill('code, phase3');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const tag = files(page).locator('[data-testid="files-place"][data-location="tag:phase3"]');
    await expect(tag).toBeVisible();
    await tag.click();
    await expect(item(page, 'app.js')).toBeVisible();

    // Search below the home folder finds the copy inside Work.
    await files(page).locator('[data-testid="files-place"][data-location$="/Documents"]').click();
    await files(page).getByTestId('files-search').fill('notes');
    await expect(files(page).locator('.nx-files-view .nx-files-item')).toHaveCount(2);
    await expect(status(page)).toContainText('2 results');
    await files(page).getByTestId('files-search').fill('');

    // Typed path, then reload: the window comes back in the same folder.
    await page.keyboard.press('F4');
    await page.keyboard.type('~/Documents/Work');
    await page.keyboard.press('Enter');
    await expect(files(page).getByTestId('files-crumbs')).toContainText('Work');
    await page.waitForTimeout(1200);
    await page.reload();
    await waitForDesktop(page);
    await expect(files(page).getByTestId('files-crumbs')).toContainText('Work');
    await expect(item(page, 'notes.md')).toBeVisible();

    expect(errors).toEqual([]);
  });
});

test.describe('file explorer on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout');

  test('places open as an overlay and navigate', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    await openExplorer(page);
    await expect(files(page).locator('.nx-files-sidebar')).toBeHidden();
    await files(page).getByRole('button', { name: 'Places' }).tap();
    await files(page).locator('[data-testid="files-place"][data-location$="/Music"]').tap();
    await expect(files(page).getByTestId('files-crumbs')).toContainText('Music');
    await expect(files(page).locator('.nx-files-sidebar')).toBeHidden();
    expect(errors).toEqual([]);
  });
});
