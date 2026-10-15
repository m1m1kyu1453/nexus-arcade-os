// Generates the PWA icons in public/icons/ from src/ui/brand/logo.svg.
// Renders with Playwright's Chromium, so no image tool is needed. Run `npm run icons` after
// changing the logo and commit the output (the deploy build does not run this).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'public/icons');
const logo = readFileSync(resolve(root, 'src/ui/brand/logo.svg'), 'utf8');
const logoInner = logo.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

const BG = '#05060d';

/**
 * App icon: the logo on a dark tile. `maskable` fills the whole square and keeps the logo
 * inside the 80% safe zone; the regular icon is a rounded tile.
 * @param {{ maskable?: boolean }} options
 */
function iconSvg({ maskable = false } = {}) {
  const logoSize = maskable ? 36 : 44;
  const offset = (64 - logoSize) / 2;
  const tile = maskable
    ? `<rect width="64" height="64" fill="${BG}"/>`
    : `<rect x="2" y="2" width="60" height="60" rx="14" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${tile}<svg x="${offset}" y="${offset}" width="${logoSize}" height="${logoSize}" viewBox="0 0 64 64" fill="none">${logoInner}</svg></svg>`;
}

const targets = [
  { file: 'icon-192.png', size: 192, svg: iconSvg() },
  { file: 'icon-512.png', size: 512, svg: iconSvg() },
  { file: 'maskable-512.png', size: 512, svg: iconSvg({ maskable: true }) },
  { file: 'apple-touch-icon.png', size: 180, svg: iconSvg({ maskable: true }) },
];

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon.svg'), iconSvg() + '\n');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, size, svg } of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path: resolve(outDir, file), omitBackground: true });
    console.log(`public/icons/${file}`);
  }
} finally {
  await browser.close();
}
