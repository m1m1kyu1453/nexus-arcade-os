// Phase 2 "done when": the shell works entirely with the keyboard, with the mouse and with touch,
// and everything is restored after a reload.
import { expect, test } from '@playwright/test';
import { collectErrors, startNexus, waitForDesktop } from '../helpers/nexus.js';

const windows = (/** @type {import('@playwright/test').Page} */ page) => page.locator('.nx-windows .nx-window');
const appBar = (/** @type {import('@playwright/test').Page} */ page) =>
  page.getByRole('navigation', { name: 'App bar' });
const welcome = (/** @type {import('@playwright/test').Page} */ page) =>
  page.getByRole('dialog', { name: /Welcome|Willkommen/ });

/** Session saves are debounced; give them time before reloading. */
async function reloadDesktop(/** @type {import('@playwright/test').Page} */ page) {
  await page.waitForTimeout(1200);
  await page.reload();
  await waitForDesktop(page);
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop flows');

  test('keyboard only: palette, snapping, workspaces, launcher, theme; restored after reload', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    await expect(welcome(page)).toBeFocused();

    // Snap the Welcome window to the left half.
    await page.keyboard.press('Control+ArrowLeft');
    await expect(windows(page).first()).toHaveClass(/is-snapped/);

    // A second window from the command palette, snapped right.
    await page.keyboard.press('Control+k');
    await expect(page.locator('.nx-palette-input')).toBeFocused();
    await page.keyboard.type('Welcome');
    await expect(page.getByRole('option', { name: /Welcome/ }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(windows(page)).toHaveCount(2);
    await page.keyboard.press('Control+ArrowRight');
    await expect(windows(page).nth(1)).toHaveClass(/is-snapped/);

    // Move it to workspace 2 (the view follows the window).
    await page.keyboard.press('Control+Shift+ArrowRight');
    await expect(page.locator('.nx-workspace.is-current')).toHaveAttribute('data-index', '1');
    await expect(page.locator('.nx-workspace.is-current .nx-window')).toHaveCount(1);

    // Launcher and shortcut overlay open and close with the keyboard.
    await page.keyboard.press('Control+Space');
    await expect(page.locator('.nx-launcher-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.nx-launcher-backdrop')).toBeHidden();
    await page.keyboard.press('Control+/');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();

    // Change the theme through the palette.
    const theme = await page.locator('html').getAttribute('data-theme');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('>Next theme');
    await expect(page.getByRole('option', { name: /Next theme/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', theme ?? '');
    const newTheme = await page.locator('html').getAttribute('data-theme');

    await reloadDesktop(page);
    await expect(windows(page)).toHaveCount(2);
    await expect(page.locator('.nx-workspace.is-current')).toHaveAttribute('data-index', '1');
    await expect(page.locator('.nx-windows .nx-window.is-snapped')).toHaveCount(2);
    await expect(page.locator('html')).toHaveAttribute('data-theme', newTheme ?? '');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('mouse: drag to snap, add a widget from the desktop menu; restored after reload', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    const bar = welcome(page).locator('.nx-titlebar');
    const box = /** @type {{ x: number, y: number, width: number }} */ (await bar.boundingBox());
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(200, 300, { steps: 5 });
    await page.mouse.move(1, 300, { steps: 5 });
    await page.mouse.up();
    await expect(windows(page).first()).toHaveClass(/is-snapped/);

    await page.locator('.nx-desk-grid').click({ button: 'right', position: { x: 900, y: 600 } });
    await page.getByRole('menuitem', { name: /Add widgets/ }).click();
    await page.locator('.nx-widget-card[data-key="nexus.widgets/clock"]').click();
    await expect(page.locator('.nx-widget[data-key="nexus.widgets/clock"] .nx-wclock-time')).toBeVisible();

    await reloadDesktop(page);
    await expect(windows(page).first()).toHaveClass(/is-snapped/);
    await expect(page.locator('.nx-widget[data-key="nexus.widgets/clock"] .nx-wclock-time')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('mobile', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch flows');

  /** @param {import('@playwright/test').Page} page @param {string} selector @param {number} dy */
  async function swipe(page, selector, dy) {
    const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (
      await page.locator(selector).boundingBox()
    );
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const init = { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true, clientX: x };
    await page.locator(selector).dispatchEvent('pointerdown', { ...init, clientY: y });
    await page.locator(selector).dispatchEvent('pointerup', { ...init, clientY: y + dy });
  }

  test('touch only: app bar, sheets, switcher, swipes and long-press; restored after reload', async ({ page }) => {
    const errors = collectErrors(page);
    await startNexus(page);
    await expect(page.locator('html')).toHaveAttribute('data-mobile', '');
    await expect(page.locator('.nx-windows .nx-window.is-sheet')).toHaveCount(1);

    // Home shows the desktop; Apps opens the full-screen launcher.
    await appBar(page).getByRole('button', { name: 'Home' }).tap();
    await expect(page.locator('.nx-windows .nx-window.is-sheet')).toHaveCount(0);
    await appBar(page).getByRole('button', { name: 'Apps' }).tap();
    await expect(page.locator('.nx-launcher-backdrop')).toBeVisible();
    await page.locator('.nx-launcher-tile', { hasText: 'Welcome' }).first().tap();
    await expect(page.locator('.nx-windows .nx-window.is-sheet')).toHaveCount(1);

    // Swipe up from the app bar: switcher. Swipe down from the top bar: notification center.
    await swipe(page, '.nx-mbar', -120);
    await expect(page.locator('.nx-overview')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.nx-overview')).toBeHidden();
    await swipe(page, '.nx-topbar', 160);
    await expect(page.locator('.nx-center-backdrop')).toBeVisible();
    await page.keyboard.press('Escape');

    // Long-press on the desktop opens its context menu.
    await appBar(page).getByRole('button', { name: 'Home' }).tap();
    const grid = page.locator('.nx-desk-grid');
    const g = /** @type {{ x: number, y: number }} */ (await grid.boundingBox());
    const touch = {
      pointerType: 'touch',
      pointerId: 9,
      isPrimary: true,
      bubbles: true,
      clientX: g.x + 200,
      clientY: g.y + 400,
    };
    await grid.dispatchEvent('pointerdown', touch);
    await expect(page.getByRole('menu')).toBeVisible();
    await grid.dispatchEvent('pointerup', touch);

    await page.keyboard.press('Escape');
    const count = await windows(page).count();
    await reloadDesktop(page);
    await expect(windows(page)).toHaveCount(count);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
