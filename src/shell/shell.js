// @ts-check
// The shell: builds the desktop layers, boots the kernel with the window manager as app host,
// restores the last session (windows, workspaces, dock) and wires the shell components.
import { builtInApps } from '../apps/index.js';
import { edition, version } from '../env.js';
import { bootKernel } from '../kernel/system.js';
import { h } from '../ui/dom.js';
import { installTooltips } from '../ui/overlay.js';
import { consumeLoginRequest, loginScreen } from './lock/lock.js';
import { createSession } from './session.js';
import { appName, createStore } from './util.js';
import './shell.css';
import { createWindowManager } from './wm/window-manager.js';

const TOP_BAR_HEIGHT = 36;

/**
 * Everything shell components share. Components add themselves under `ui`.
 * @typedef {object} ShellContext
 * @property {HTMLElement} root
 * @property {{ wallpaper: HTMLElement, desktop: HTMLElement, windows: HTMLElement, chrome: HTMLElement }} layers
 * @property {() => import('../kernel/system.js').System} system
 * @property {import('./wm/window-manager.js').WindowManager} wm
 * @property {import('./session.js').Session} session
 * @property {(key: string, vars?: Record<string, unknown>) => string} t
 * @property {(appId: string, args?: import('../kernel/types').LaunchArgs) => Promise<string | null>} launch
 * @property {() => import('./wm/geometry.js').Rect} workArea
 * @property {Record<string, any>} ui
 */

/**
 * @param {HTMLElement} root
 * @param {{ onProgress?: (step: string) => void, onLog?: (entry: any) => void, beforeLogin?: () => void }} [options]
 * @returns {Promise<ShellContext>}
 */
export async function startShell(root, { onProgress, onLog, beforeLogin } = {}) {
  const layers = {
    wallpaper: h('div', { class: 'nx-wallpaper', 'aria-hidden': 'true' }),
    desktop: h('div', { class: 'nx-desktop' }),
    windows: h('div', { class: 'nx-windows' }),
    chrome: h('div', { class: 'nx-chrome' }),
  };
  root.classList.add('nx-shell');
  root.append(layers.wallpaper, layers.desktop, layers.windows, layers.chrome);
  installTooltips();

  /** @type {import('../kernel/system.js').System} */
  let system = /** @type {any} */ (null);
  /** @type {ShellContext} */
  const shell = /** @type {any} */ ({ root, layers, ui: {} });
  shell.system = () => system;
  shell.t = (key, vars) => system.i18n.t('system', key, vars);
  shell.workArea = () => {
    const ui = shell.ui.dock?.reserved?.() ?? { bottom: 0, left: 0, right: 0 };
    const y = TOP_BAR_HEIGHT;
    return {
      x: ui.left,
      y,
      w: Math.max(200, window.innerWidth - ui.left - ui.right),
      h: Math.max(160, window.innerHeight - y - ui.bottom),
    };
  };
  shell.wm = createWindowManager({
    layer: layers.windows,
    system: () => system,
    workArea: () => shell.workArea(),
    dockIconRect: (appId) => shell.ui.dock?.iconRect?.(appId) ?? null,
    onChange: () => shell.session?.schedule(),
  });

  const manifests = [...builtInApps];
  if (import.meta.env.DEV) manifests.push((await import('../dev/test-app/manifest.js')).default);
  const kernel = await bootKernel({
    edition,
    version,
    dev: import.meta.env.DEV,
    manifests,
    host: shell.wm.host,
    onProgress,
    onLog,
  });
  shell.kernel = kernel;
  // Login screen when the last profile is locked, or after "Switch profile" / "Log out".
  const last = await kernel.lastProfile();
  let profile;
  if (consumeLoginRequest() || last?.locked) {
    beforeLogin?.();
    profile = await loginScreen({ parent: document.body, kernel });
  } else profile = await kernel.defaultProfile();
  system = await kernel.openProfile(profile);
  // What ctx.system needs from the shell.
  Object.assign(system.systemHost, {
    windowTitle: (/** @type {string} */ id) => shell.wm.get(id)?.title,
    windowNodes: (/** @type {string} */ id) => shell.wm.get(id)?.body.getElementsByTagName('*').length ?? null,
  });

  // Session: workspaces, pinned apps, windows.
  shell.session = createSession(createStore(system, 'system:shell'), system.logger.child('shell'));
  const data = await shell.session.load();
  shell.wm.setWorkspaces(data.workspaces.count, data.workspaces.names);
  shell.wm.setCurrent(data.workspaces.current);
  shell.session.setCollector(() => ({
    workspaces: {
      count: shell.wm.workspaces.length,
      names: shell.wm.workspaces.map((w) => w.name),
      current: shell.wm.current,
    },
    windows: shell.wm.list().map((w) => {
      const info = system.lifecycle.get(w.id);
      const { restoredState: _old, ...args } = info?.args ?? {};
      return {
        appId: w.appId,
        args,
        state: system.lifecycle.appState(w.id),
        layout: /** @type {import('./wm/window-manager.js').SavedWindow} */ (shell.wm.layoutOf(w.id)),
      };
    }),
  }));

  shell.launch = async (appId, args = {}) => {
    try {
      const id = await system.lifecycle.launch(appId, args);
      shell.session.noteLaunch(appId);
      return id;
    } catch (error) {
      system.logger.child('shell').warn(`Could not open ${appId}`, error);
      await system.notifications.notify({
        title: shell.t('shell.openFailed', { app: appName(system, appId) }),
        body: String(/** @type {Error} */ (error)?.message ?? error),
      });
      return null;
    }
  };

  // Restore windows in their saved order (oldest focus last so the top one ends up focused).
  const saved = [...data.windows].reverse().filter((w) => system.registry.isEnabled(w.appId));
  shell.wm.queueRestore(saved.map((w) => w.layout));
  for (const w of saved) {
    await system.lifecycle
      .launch(w.appId, { ...w.args, ...(w.state === undefined ? {} : { restoredState: w.state }) })
      .catch(() => {});
  }
  addEventListener('pagehide', () => void shell.session.save());
  document.addEventListener('visibilitychange', () => document.hidden && void shell.session.save());

  return shell;
}
