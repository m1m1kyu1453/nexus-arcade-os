// @ts-check
// Boot screen: animated logo, a progress bar driven by the kernel's real boot steps, and a
// scrolling log of real messages. Any key or click skips it. "Fast boot" turns it off; later
// visits show it much shorter than the first one.
import logo from '../ui/brand/logo.svg?raw';
import { h } from '../ui/dom.js';
import './boot-screen.css';

const FAST_BOOT_KEY = 'nexus:fastBoot';
const BOOTED_KEY = 'nexus:booted';
const STEPS = ['storage', 'profile', 'settings', 'theme', 'files', 'services', 'migrations', 'apps', 'search', 'ready'];

/** @param {string} key */
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Mirrors the "Fast boot" setting into device storage (read before any profile opens). @param {boolean} on */
export function rememberFastBoot(on) {
  try {
    localStorage.setItem(FAST_BOOT_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the boot screen simply shows.
  }
}

/**
 * @param {HTMLElement} parent
 * @param {{ steps: Record<string, string>, skip: string, title: string }} text
 */
export function showBootScreen(parent, text) {
  const fast = read(FAST_BOOT_KEY) === '1';
  const firstVisit = read(BOOTED_KEY) !== '1';
  const minMs = fast ? 0 : firstVisit ? 1800 : 450;
  const started = performance.now();
  const bar = h('div', { class: 'nx-boot-bar-fill' });
  const label = h('p', { class: 'nx-boot-step', 'aria-live': 'polite' });
  const log = h('ol', { class: 'nx-boot-log', 'aria-hidden': 'true' });
  const el = h(
    'div',
    { class: 'nx-boot', role: 'status', 'aria-label': text.title },
    h('div', { class: 'nx-boot-logo', html: logo }),
    h('div', { class: 'nx-boot-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar),
    label,
    log,
    h('p', { class: 'nx-boot-skip', text: text.skip }),
  );
  if (fast) el.hidden = true;
  parent.append(el);
  let skipped = fast;
  const skip = () => {
    skipped = true;
    hide();
  };
  addEventListener('keydown', skip, { once: true, capture: true });
  el.addEventListener('pointerdown', skip, { once: true });

  let hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    removeEventListener('keydown', skip, { capture: true });
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 320);
  }

  return {
    /** @param {string} step */
    progress(step) {
      const i = STEPS.indexOf(step);
      if (i === -1) return;
      const pct = Math.round(((i + 1) / STEPS.length) * 100);
      bar.style.width = `${pct}%`;
      el.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(pct));
      label.textContent = text.steps[step] ?? step;
    },
    /** @param {{ source: string, message: string, level: string }} entry */
    log(entry) {
      log.append(h('li', { class: `is-${entry.level}`, text: `[${entry.source}] ${entry.message}` }));
      while (log.childElementCount > 9) log.firstElementChild?.remove();
    },
    /** Waits for the minimum display time (unless skipped), then fades out. */
    async done() {
      try {
        localStorage.setItem(BOOTED_KEY, '1');
      } catch {
        // ignore
      }
      const left = minMs - (performance.now() - started);
      if (!skipped && left > 0) await new Promise((r) => setTimeout(r, left));
      hide();
    },
    hide,
  };
}
