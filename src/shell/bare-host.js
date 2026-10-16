// @ts-check
// A minimal app host for phase 1 (debug screen and tests): each instance gets a framed
// container with its name and a close button. Phase 2 replaces it with the window manager.
import './bare-host.css';
import { renderCrashView } from './crash-view.js';

/**
 * @param {object} options
 * @param {HTMLElement} options.root
 * @param {() => import('../kernel/system.js').System} options.system  available after boot
 */
export function createBareHost({ root, system }) {
  /** @type {Map<string, { frame: HTMLElement, container: HTMLElement }>} */
  const frames = new Map();

  /** @type {import('../kernel/lifecycle.js').Host} */
  const host = {
    open(manifest, { instanceId }) {
      const sys = system();
      const frame = document.createElement('section');
      frame.className = 'nx-bare-frame';
      frame.dataset.instance = instanceId;
      frame.setAttribute('role', 'region');
      const name = sys.localize(manifest.name);
      frame.setAttribute('aria-label', name);
      const bar = document.createElement('header');
      const title = document.createElement('span');
      title.textContent = name;
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '×';
      close.setAttribute('aria-label', sys.i18n.t('system', 'crash.close'));
      close.addEventListener('click', () => sys.lifecycle.close(instanceId));
      bar.append(title, close);
      const container = document.createElement('div');
      container.className = 'nx-bare-content';
      frame.append(bar, container);
      frame.addEventListener('pointerdown', () => sys.lifecycle.get(instanceId) && sys.lifecycle.focus(instanceId));
      root.append(frame);
      frames.set(instanceId, { frame, container });
      return {
        container,
        window: {
          /** @param {string} text */
          setTitle: (text) => void (title.textContent = text),
          close: () => sys.lifecycle.close(instanceId),
          focus: () => sys.lifecycle.focus(instanceId),
          stateChanged: () => {},
        },
      };
    },
    close(instanceId) {
      frames.get(instanceId)?.frame.remove();
      frames.delete(instanceId);
    },
    focus(instanceId) {
      for (const [id, { frame }] of frames) frame.classList.toggle('is-focused', id === instanceId);
    },
    showCrash(instanceId, report, actions) {
      const entry = frames.get(instanceId);
      if (!entry) return;
      const sys = system();
      const manifest = sys.registry.get(report.appId);
      renderCrashView(entry.container, {
        report,
        appName: manifest ? sys.localize(manifest.name) : report.appId,
        i18n: sys.i18n.scoped('system'),
        clipboard: sys.clipboard,
        actions,
      });
    },
  };
  return host;
}
