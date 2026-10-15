// @ts-check
// App icons: the manifest's icon on a rounded tile colored by category, used by the dock,
// launcher, desktop, switcher and overview so apps look the same everywhere.
import { icon } from '../ui/dom.js';
import './app-icon.css';

/**
 * @param {Pick<import('../kernel/types').AppManifest, 'icon' | 'category'>} manifest
 * @param {number} [size] tile size in px
 */
export function appIcon(manifest, size = 40) {
  const tile = document.createElement('span');
  tile.className = 'nx-app-icon';
  tile.dataset.category = manifest.category;
  tile.style.setProperty('--size', `${size}px`);
  tile.append(icon(manifest.icon, { size: Math.round(size * 0.52) }));
  return tile;
}
