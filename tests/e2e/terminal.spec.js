// Terminal main flows: real work across apps with pipes and files, completion, history,
// Ctrl+C, the pager, app commands, tabs; tabs and folders survive a reload.
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus, waitForDesktop } from '../helpers/nexus.js';

/** @typedef {import('@playwright/test').Page} Page */

const term = (/** @type {Page} */ page) => page.locator('.nx-windows [data-testid="terminal"]');
const input = (/** @type {Page} */ page) =>
  term(page).locator('.nx-term-session:not([hidden]) [data-testid="term-input"]');
const output = (/** @type {Page} */ page) =>
  term(page).locator('.nx-term-session:not([hidden]) [data-testid="term-output"]');

/** Types a command and waits until it has finished (the prompt is back). */
async function run(/** @type {Page} */ page, /** @type {string} */ line) {
  await input(page).fill(line);
  await input(page).press('Enter');
  await expect(input(page)).toBeVisible();
}

test.describe('terminal', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard flows');

  test('files, pipes, completion, history, Ctrl+C, less, apps, tabs; restored after reload', async ({ page }) => {
    test.setTimeout(60_000); // one long flow
    const errors = collectErrors(page);
    await startNexus(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Alt+t');
    await expect(input(page)).toBeFocused();

    // Real work: folders, files, redirection and pipes.
    await run(page, 'mkdir -p ~/Projects/demo && cd ~/Projects/demo');
    await run(page, 'echo -e "pear\\napple\\npear\\nfig" > fruit.txt');
    await run(page, 'sort fruit.txt | uniq -c | sort -rn | head -1');
    await expect(output(page)).toContainText('2 pear');
    await run(page, 'grep -c p fruit.txt && echo FOUND || echo MISSING');
    await expect(output(page)).toContainText('FOUND');
    await run(page, 'cat nothing.txt');
    await expect(output(page).locator('.nx-term-err').last()).toContainText('No such file or folder');

    // Tab completion of a path.
    await input(page).fill('cat fr');
    await input(page).press('Tab');
    await expect(input(page)).toHaveValue('cat fruit.txt ');
    await input(page).fill('');

    // History: ↑ recalls, !! repeats.
    await input(page).press('ArrowUp');
    await expect(input(page)).toHaveValue('cat nothing.txt');
    await run(page, 'echo once');
    await run(page, '!!');
    await expect(output(page).getByText('once', { exact: true })).toHaveCount(2);

    // Ctrl+C stops a running command; Ctrl+L clears.
    await input(page).fill('sleep 30');
    await input(page).press('Enter');
    await expect(input(page)).toBeHidden();
    await page.keyboard.press('Control+c');
    await expect(input(page)).toBeVisible();
    await expect(output(page)).toContainText('^C');
    await input(page).press('Control+l');
    await expect(output(page)).not.toContainText('^C');
    await expect(page.locator('.nx-lock')).toHaveCount(0); // Ctrl+L didn't lock the screen

    // less pages through text and quits with q.
    await input(page).fill('less fruit.txt');
    await input(page).press('Enter');
    const pager = term(page).getByTestId('term-pager');
    await expect(pager).toContainText('apple');
    await page.keyboard.press('q');
    await expect(pager).toHaveCount(0);
    await expect(input(page)).toBeFocused();

    // Across apps: an app's terminal command opens the File Explorer in this folder.
    await run(page, 'explore .');
    const files = page.locator('.nx-windows [data-testid="files"]');
    await expect(files.getByTestId('files-crumbs')).toContainText('demo');
    await expect(files.locator('.nx-files-item', { hasText: 'fruit.txt' })).toBeVisible();
    await page.locator('.nx-windows .nx-window[data-app="nexus.terminal"]').click({ position: { x: 200, y: 200 } });
    await run(page, 'kill nexus.files');
    await expect(files).toHaveCount(0);

    // A second tab starts in the same folder.
    await page.keyboard.press('Alt+t');
    await expect(term(page).locator('.nx-term-tab')).toHaveCount(2);
    await run(page, 'cd .. && pwd');
    await expect(output(page)).toContainText('/Projects');

    // Reload: both tabs come back in their folders.
    await page.waitForTimeout(1200);
    await page.reload();
    await waitForDesktop(page);
    await expect(term(page).locator('.nx-term-tab')).toHaveCount(2);
    await expect(term(page).locator('.nx-term-tab.is-active')).toContainText('Projects');
    await term(page).locator('.nx-term-tab-label').first().click();
    await run(page, 'pwd');
    await expect(output(page)).toContainText('/Projects/demo');

    expect(errors).toEqual([]);
  });

  test('"Open terminal here" from the File Explorer starts in that folder', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('File Explorer');
    await expect(page.getByRole('option', { name: /File Explorer/ }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    const files = page.locator('.nx-windows [data-testid="files"]');
    await files.locator('.nx-files-item', { hasText: 'Music' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open terminal here' }).click();
    await expect(input(page)).toBeFocused();
    await run(page, 'pwd');
    await expect(output(page)).toContainText('/Music');
    expect(errors).toEqual([]);
  });
});
