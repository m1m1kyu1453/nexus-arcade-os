// @ts-check
// Mobile shell (below 768 px): one window at a time as a full-screen sheet, a bottom app bar
// instead of the dock (apps, home, switcher), swipe up from the bar for the switcher, swipe down
// from the top bar for notifications and quick settings. The launcher is already full-screen there.
import { h, icon } from '../../ui/dom.js';
import './mobile.css';

export const MOBILE_QUERY = '(max-width: 767px)';
/** A vertical swipe must travel this far (px) to count. */
const SWIPE_PX = 40;

/** @param {import('../shell.js').ShellContext} shell */
export function createMobileShell(shell) {
  const sys = shell.system();
  const { t } = shell;
  const media = matchMedia(MOBILE_QUERY);
  const root = document.documentElement;

  const tab = (/** @type {string} */ iconName, /** @type {string} */ label, /** @type {() => void} */ run) =>
    h(
      'button',
      { class: 'nx-mbar-btn', type: 'button', 'aria-label': label, onclick: run },
      icon(iconName, { size: 22 }),
      h('span', { text: label }),
    );
  const bar = h(
    'nav',
    { class: 'nx-mbar', 'aria-label': t('mobile.bar') },
    tab('apps', t('mobile.apps'), () => shell.ui.launcher?.toggle()),
    tab('home', t('mobile.home'), home),
    tab('overview', t('mobile.switcher'), () => shell.ui.overview?.toggle()),
  );
  shell.layers.chrome.append(bar);

  /** Minimizes every window on the current workspace: back to the desktop. */
  function home() {
    shell.ui.launcher?.close();
    shell.ui.overview?.close();
    for (const w of shell.wm.list()) if (w.workspace === shell.wm.current && !w.minimized) shell.wm.minimize(w.id);
    markTop();
  }

  /** Marks the one window shown as a sheet: the most recently focused visible one. */
  function markTop() {
    const mobile = media.matches;
    root.toggleAttribute('data-mobile', mobile);
    const top = mobile ? shell.wm.list().find((w) => w.workspace === shell.wm.current && !w.minimized) : undefined;
    for (const w of shell.wm.list()) w.el.classList.toggle('is-sheet', w === top);
  }

  for (const type of [
    'window:opened',
    'window:closed',
    'window:focused',
    'window:changed',
    'window:moved',
    'window:layout',
    'workspace:changed',
  ]) {
    sys.bus.on(type, () => queueMicrotask(markTop));
  }
  media.addEventListener('change', () => {
    markTop();
    shell.wm.relayout();
  });

  // Swipe up from the app bar: switcher. Swipe down from the top bar: notification center.
  /** @param {HTMLElement} el @param {1 | -1} direction @param {() => void} run */
  function swipe(el, direction, run) {
    /** @type {{ x: number, y: number, id: number } | null} */
    let start = null;
    el.addEventListener('pointerdown', (e) => {
      if (media.matches && e.pointerType !== 'mouse') start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    el.addEventListener('pointerup', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dy = (e.clientY - start.y) * direction;
      const dx = Math.abs(e.clientX - start.x);
      start = null;
      if (dy > SWIPE_PX && dy > dx) run();
    });
    el.addEventListener('pointercancel', () => (start = null));
  }
  swipe(bar, -1, () => shell.ui.overview?.open());
  const topbar = /** @type {HTMLElement | null} */ (document.querySelector('.nx-topbar'));
  if (topbar) swipe(topbar, 1, () => shell.ui.center?.open());

  markTop();
  return { isMobile: () => media.matches, home, refresh: markTop };
}
