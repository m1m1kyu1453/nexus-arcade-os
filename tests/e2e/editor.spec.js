// Nexus Edit main flows: write and save a new file, unsaved-changes protection (incl. a reload),
// highlighting, find, go to line, and opening files from the File Explorer (double-click, drag).
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus, waitForDesktop } from '../helpers/nexus.js';

/** @typedef {import('@playwright/test').Page} Page */

const editor = (/** @type {Page} */ page) => page.locator('.nx-windows [data-testid="editor"]');
const content = (/** @type {Page} */ page) => editor(page).locator('.nx-edit-pane:not([hidden]) .cm-content');
const activeTab = (/** @type {Page} */ page) => editor(page).locator('.nx-edit-tab.is-active');

async function palette(/** @type {Page} */ page, /** @type {string} */ query, /** @type {RegExp} */ option) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(query);
  await expect(page.getByRole('option', { name: option }).first()).toBeVisible();
  await page.keyboard.press('Enter');
}

/**
 * Drops VFS paths on an element the way a drag from the File Explorer does (a real DataTransfer
 * with the Nexus paths type). Real cross-window mouse drags are timing-sensitive under test load.
 * @param {import('@playwright/test').Locator} target
 * @param {string[]} paths
 */
async function dropPaths(target, paths) {
  await target.evaluate((el, list) => {
    const dt = new DataTransfer();
    dt.setData('application/x-nexus-paths', JSON.stringify(list));
    dt.setData('text/plain', list.join('\n'));
    for (const type of ['dragenter', 'dragover', 'drop'])
      el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
  }, paths);
}

test.describe('nexus edit', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard flows');

  test('save a new file, protect unsaved changes, highlight, find, open from the Explorer', async ({ page }) => {
    test.setTimeout(60_000); // one long flow
    const errors = collectErrors(page);
    await startNexus(page);
    await page.keyboard.press('Escape');
    await palette(page, 'Nexus Edit', /^Nexus Edit/);
    await expect(content(page)).toBeVisible();

    // Type into a new tab and save it as a JavaScript file.
    await content(page).click();
    await page.keyboard.type('const answer = 42;\n// done');
    await expect(activeTab(page)).toHaveClass(/is-dirty/);
    await page.keyboard.press('Control+s');
    const dialog = page.getByRole('dialog', { name: 'Save as' });
    await dialog.getByLabel('File name').fill('answer.js');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(activeTab(page)).toContainText('answer.js');
    await expect(activeTab(page)).not.toHaveClass(/is-dirty/);

    // Highlighting and the status bar follow the file type.
    await expect(content(page).locator('.tok-keyword').first()).toHaveText('const');
    await expect(editor(page).getByTestId('edit-language')).toHaveText('JavaScript');
    await expect(editor(page).getByTestId('edit-position')).toContainText('Ln 2');

    // Find and go to line open their panels.
    await page.keyboard.press('Control+f');
    await expect(editor(page).locator('.cm-search')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+g');
    await expect(editor(page).locator('.cm-goto-line')).toBeVisible();
    await page.keyboard.press('Escape');

    // Unsaved changes survive a reload as a draft.
    await content(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nconsole.log(answer);');
    await expect(activeTab(page)).toHaveClass(/is-dirty/);
    await page.waitForTimeout(1500);
    await page.reload();
    await waitForDesktop(page);
    await expect(content(page)).toContainText('console.log(answer);');
    await expect(activeTab(page)).toHaveClass(/is-dirty/);

    // Closing asks first; Cancel keeps the window, "Don't save" closes it.
    const win = page.locator('.nx-windows .nx-window[data-app="nexus.editor"]');
    await win.getByRole('button', { name: 'Close', exact: true }).click();
    const ask = page.getByRole('dialog', { name: /Save changes to “answer.js”/ });
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(win).toBeVisible();
    await win.getByRole('button', { name: 'Close', exact: true }).click();
    await ask.getByRole('button', { name: "Don't save" }).click();
    await expect(win).toHaveCount(0);

    // The File Explorer opens the saved file in Nexus Edit (the unsaved line is gone).
    await palette(page, 'File Explorer', /^File Explorer/);
    const files = page.locator('.nx-windows [data-testid="files"]');
    await files.locator('[data-testid="files-place"][data-location$="/Documents"]').click();
    await files.locator('.nx-files-item', { hasText: 'answer.js' }).dblclick();
    await expect(content(page)).toContainText('const answer = 42;');
    await expect(content(page)).not.toContainText('console.log');

    // A file dropped from the File Explorer opens in a new tab (here: on the code itself, which
    // must not insert the path as text).
    await files
      .locator('input[type=file]')
      .setInputFiles([{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes') }]);
    await expect(files.locator('.nx-files-item', { hasText: 'notes.md' })).toBeVisible();
    await dropPaths(content(page), ['/home/user/Documents/notes.md']);
    await expect(activeTab(page)).toContainText('notes.md');
    await editor(page).locator('.nx-edit-tab', { hasText: 'answer.js' }).locator('.nx-edit-tab-label').click();
    await expect(content(page)).not.toContainText('/home/user');
    await editor(page).locator('.nx-edit-tab', { hasText: 'notes.md' }).locator('.nx-edit-tab-label').click();
    await expect(editor(page).locator('.nx-edit-preview h1')).toHaveText('Notes');

    expect(errors).toEqual([]);
  });
});
