// Boots the OS into its root element. Shared by both editions; edition-specific work
// (Service Worker) lives in the entry files.
import '../styles/base.css';
import { registerShellCommands } from './commands.js';
import { createNotificationCenter } from './center/center.js';
import { createDesktop } from './desktop/desktop.js';
import { createWallpaper } from './desktop/wallpaper.js';
import { createDock } from './dock.js';
import { createLauncher } from './launcher/launcher.js';
import { createPalette } from './palette/palette.js';
import { createPersonalize } from './personalize/personalize.js';
import { startShell } from './shell.js';
import { pickStrings } from './strings.js';
import { createToastHost } from './toast.js';
import { createTopBar } from './topbar.js';
import { createOverview } from './wm/overview.js';
import { createSwitcher } from './wm/switcher.js';

/** @param {HTMLElement} root */
export function boot(root) {
  const { t, locale } = pickStrings(navigator.languages ?? [navigator.language]);
  document.documentElement.lang = locale;
  const toasts = createToastHost(document.body);

  const system = startShell(root).then(
    (shell) => {
      const sys = shell.system();
      shell.ui.wallpaper = createWallpaper(shell);
      shell.ui.desktop = createDesktop(shell);
      shell.ui.topbar = createTopBar(shell);
      shell.ui.dock = createDock(shell);
      registerShellCommands(shell);
      shell.ui.palette = createPalette(shell);
      shell.ui.launcher = createLauncher(shell);
      shell.ui.center = createNotificationCenter(shell);
      shell.ui.personalize = createPersonalize(shell);
      shell.ui.overview = createOverview(shell);
      shell.ui.switcher = createSwitcher(shell);
      shell.wm.relayout();
      if (!shell.wm.list().length && !shell.session.data.windows.length) void shell.launch('nexus.welcome');
      showNotificationToasts(sys, toasts, t.dismiss);
      document.documentElement.dataset.kernel = 'ready';
      document.documentElement.dataset.storage = sys.engine.kind;
      document.documentElement.dataset.search = sys.search.backendKind;
      return sys;
    },
    (error) => {
      document.documentElement.dataset.kernel = 'failed';
      console.error('Nexus could not start', error);
      throw error;
    },
  );

  return {
    t,
    system,
    /** @param {Omit<import('./toast.js').ToastOptions, 'dismissLabel'>} options */
    toast: (options) => toasts.show({ ...options, dismissLabel: t.dismiss }),
  };
}

/**
 * Shows the notification service's toasts.
 * @param {import('../kernel/system.js').System} system
 * @param {ReturnType<typeof createToastHost>} toasts
 * @param {string} dismissLabel
 */
function showNotificationToasts(system, toasts, dismissLabel) {
  /** @type {Map<string, () => void>} */
  const open = new Map();
  system.bus.on('notification:shown', (n) => {
    const action = n.actions[0];
    const close = toasts.show({
      message: n.title,
      body: n.body,
      timeoutMs: n.timeoutMs,
      dismissLabel,
      action: action && { label: action.label, run: () => system.notifications.triggerAction(n.id, action.id) },
    });
    open.set(n.id, close);
  });
  system.bus.on('notification:closed', ({ id }) => {
    open.get(id)?.();
    open.delete(id);
  });
}
