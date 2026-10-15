// @ts-check
// Wallpaper: gradients, user images (fit modes), slideshow from a folder, and live canvas
// wallpapers. Settings value formats: 'gradient:<id>', 'live:<id>', 'image:<vfs path>',
// 'slideshow' (uses slideshowFolder / slideshowMinutes). Live wallpapers pause while a window
// is maximized or the tab is hidden, and show a still frame in battery-saver/reduced motion.
import { h } from '../../ui/dom.js';
import { GRADIENTS, LIVE_WALLPAPERS } from './live-wallpapers.js';
import './wallpaper.css';

const FIT = /** @type {Record<string, { size: string, repeat: string }>} */ ({
  fill: { size: 'cover', repeat: 'no-repeat' },
  fit: { size: 'contain', repeat: 'no-repeat' },
  center: { size: 'auto', repeat: 'no-repeat' },
  tile: { size: 'auto', repeat: 'repeat' },
});

/** @param {import('../shell.js').ShellContext} shell */
export function createWallpaper(shell) {
  const sys = shell.system();
  const el = shell.layers.wallpaper;
  const image = h('div', { class: 'nx-wp-image' });
  const canvas = h('canvas', { class: 'nx-wp-canvas' });
  const dim = h('div', { class: 'nx-wp-dim' });
  el.replaceChildren(image, canvas, dim);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));

  /** @type {import('./live-wallpapers.js').Live | null} */
  let live = null;
  let raf = 0;
  let last = 0;
  let paused = false;
  /** @type {string | null} */
  let objectUrl = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let slideshow;
  let slideIndex = 0;

  const setting = (/** @type {string} */ key) => sys.settings.get('system', key);
  const stillOnly = () => !!setting('batterySaver') || sys.theme.motion !== 'full';

  function palette() {
    return {
      accent: sys.theme.token('accent') || '#3ef0ff',
      accent2: sys.theme.token('accent-2') || '#b36bff',
      bg: sys.theme.token('bg') || '#05060d',
    };
  }

  function sizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = el.clientWidth;
    const hgt = el.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(hgt * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    live?.resize(w, hgt);
    if (live && (stillOnly() || paused)) live.draw(performance.now(), 0);
  }

  /** @param {number} now */
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(64, now - last) : 16;
    // ~40 fps is plenty for a background and saves battery.
    if (dt < 24) return;
    last = now;
    live?.draw(now, dt);
  }

  function updateLoop() {
    const run = !!live && !paused && !stillOnly() && !document.hidden;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  /** @param {string} path */
  async function showImage(path) {
    try {
      const blob = /** @type {Blob} */ (await sys.vfs.readFile(path, { as: 'blob' }));
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(blob);
      image.style.backgroundImage = `url("${objectUrl}")`;
    } catch {
      image.style.background = GRADIENTS.nebula;
    }
  }

  async function apply() {
    const value = String(setting('wallpaper'));
    const [kind, id = ''] = value.includes(':')
      ? [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)]
      : [value];
    clearInterval(slideshow);
    live = null;
    image.style.background = '';
    image.style.backgroundImage = '';
    canvas.hidden = kind !== 'live';
    if (kind === 'live' && LIVE_WALLPAPERS[id]) {
      live = LIVE_WALLPAPERS[id](ctx, palette());
      sizeCanvas();
      live.draw(performance.now(), 0);
    } else if (kind === 'gradient') {
      image.style.background = GRADIENTS[id] ?? GRADIENTS.nebula;
    } else if (kind === 'image') {
      await showImage(id);
    } else if (kind === 'slideshow') {
      const folder = String(setting('slideshowFolder'));
      const files = folder
        ? (await sys.vfs.list(folder).catch(() => [])).filter((n) => n.mime.startsWith('image/'))
        : [];
      if (!files.length) image.style.background = GRADIENTS.nebula;
      else {
        const next = () => showImage(files[slideIndex++ % files.length].path);
        await next();
        slideshow = setInterval(next, Number(setting('slideshowMinutes')) * 60_000);
      }
    }
    const fit = FIT[String(setting('wallpaperFit'))] ?? FIT.fill;
    image.style.backgroundSize = fit.size;
    image.style.backgroundRepeat = fit.repeat;
    image.style.backgroundPosition = 'center';
    dim.style.background = `rgb(0 0 0 / ${setting('wallpaperDim')})`;
    el.style.setProperty('--wp-blur', `${setting('wallpaperBlur')}px`);
    updateLoop();
  }

  addEventListener('resize', sizeCanvas);
  document.addEventListener('visibilitychange', updateLoop);
  addEventListener('pointermove', (e) => live?.pointer?.(e.clientX, e.clientY), { passive: true });
  sys.bus.on('window:layout', ({ maximizedOnCurrent }) => {
    paused = !!maximizedOnCurrent;
    updateLoop();
  });
  sys.bus.on('theme:changed', () => void apply());
  sys.settings.onChange('system', '*', (_v, key) => {
    if (/^(wallpaper|slideshow|batterySaver)/.test(key)) void apply();
  });
  void apply();

  return {
    apply,
    get running() {
      return raf !== 0;
    },
  };
}

/** Options for the personalize panel. */
export const WALLPAPER_CHOICES = [
  ...Object.keys(LIVE_WALLPAPERS).map((id) => ({ value: `live:${id}`, kind: 'live', id })),
  ...Object.keys(GRADIENTS).map((id) => ({ value: `gradient:${id}`, kind: 'gradient', id })),
];
