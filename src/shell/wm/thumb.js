// @ts-check
// "Live-ish" window thumbnails: a scaled, inert clone of the window's DOM (canvas content
// isn't cloned by the browser, so canvases show as their background).

/**
 * @param {import('./window-manager.js').Win} w
 * @param {number} maxW
 * @param {number} maxH
 */
export function windowThumb(w, maxW, maxH) {
  const box = document.createElement('div');
  box.className = 'nx-thumb';
  box.setAttribute('aria-hidden', 'true');
  const clone = /** @type {HTMLElement} */ (w.el.cloneNode(true));
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  clone.removeAttribute('id');
  clone.classList.remove('is-minimized', 'is-focused', 'is-opening');
  const scale = Math.min(maxW / w.rect.w, maxH / w.rect.h, 1);
  Object.assign(clone.style, {
    left: '0',
    top: '0',
    transform: `scale(${scale})`,
    transformOrigin: '0 0',
    visibility: 'visible',
    pointerEvents: 'none',
    position: 'absolute',
  });
  clone.inert = true;
  box.style.width = `${Math.round(w.rect.w * scale)}px`;
  box.style.height = `${Math.round(w.rect.h * scale)}px`;
  box.append(clone);
  return box;
}
