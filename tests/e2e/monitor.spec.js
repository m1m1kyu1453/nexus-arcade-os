// System Monitor main flows: processes with End task, live performance numbers, the log with
// filters and export, and the network state.
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus } from '../helpers/nexus.js';

/** @typedef {import('@playwright/test').Page} Page */

const monitor = (/** @type {Page} */ page) => page.locator('.nx-windows [data-testid="monitor"]');
const tab = (/** @type {Page} */ page, /** @type {string} */ id) =>
  monitor(page).locator(`[data-testid="monitor-tab"][data-tab="${id}"]`);

async function palette(/** @type {Page} */ page, /** @type {string} */ query, /** @type {RegExp} */ option) {
  await page.keyboard.press('Control+k');
  await page.keyboard.type(query);
  await expect(page.getByRole('option', { name: option }).first()).toBeVisible();
  await page.keyboard.press('Enter');
}

test.describe('system monitor', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows');

  test('processes, end task, performance, log and network', async ({ page, context }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    await startNexus(page);
    await page.keyboard.press('Escape');
    await palette(page, 'File Explorer', /^File Explorer/);
    await expect(page.locator('.nx-windows [data-testid="files"]')).toBeVisible();
    await palette(page, 'System Monitor', /^System Monitor/);
    await expect(monitor(page)).toBeVisible();

    // Processes lists the Explorer; End task closes it.
    const table = monitor(page).getByTestId('process-table');
    const explorerRow = table.locator('tr[data-window^="nexus.files"]');
    await expect(explorerRow).toBeVisible();
    await expect(explorerRow.locator('td').nth(3)).toContainText('%');
    await explorerRow.getByTestId('end-task').click();
    await expect(page.locator('.nx-windows [data-testid="files"]')).toHaveCount(0);
    await expect(explorerRow).toHaveCount(0);

    // Performance shows live frames per second.
    await tab(page, 'performance').click();
    await expect(monitor(page).getByTestId('stat-fps').locator('strong')).not.toHaveText('0', { timeout: 5000 });
    await expect(monitor(page).getByTestId('stat-elements').locator('strong')).not.toHaveText('0');

    // The log has entries; filters narrow them; export downloads a text file.
    await tab(page, 'log').click();
    const log = monitor(page).getByTestId('log-list');
    await expect(log.locator('.nx-mon-entry').first()).toBeVisible();
    await monitor(page).getByPlaceholder('Search messages').fill('Ready:');
    await expect(log.locator('.nx-mon-entry')).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      monitor(page).getByTestId('log-export').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^nexus-log-.*\.txt$/);

    // Network: online, then offline (keyboard tab navigation).
    await tab(page, 'log').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'network')).toHaveAttribute('aria-selected', 'true');
    await expect(monitor(page).getByTestId('network-state')).toHaveText('Online');
    await context.setOffline(true);
    await expect(monitor(page).getByTestId('network-state')).toContainText('Offline');
    await context.setOffline(false);

    expect(errors).toEqual([]);
  });
});
