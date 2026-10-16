// @ts-check
// Window and workspace commands with their default shortcuts.
//
// Browsers reserve some combos for themselves (Ctrl+W, Ctrl+Tab) and the operating system
// takes Alt+Tab, so web pages never see them. Defaults therefore use combos that always work;
// the spec's combos are registered too (hidden) and fire wherever the browser delivers them,
// e.g. in Nexus fullscreen mode with keyboard lock.
import { snapForKey } from './wm/geometry.js';
import { registerCommand } from './util.js';

/** @param {import('./shell.js').ShellContext} shell */
export function registerShellCommands(shell) {
  const sys = shell.system();
  const { wm } = shell;
  const focused = () => {
    const id = wm.focusedId();
    return id ? wm.get(id) : undefined;
  };
  const windowOpen = 'appFocused && !inputFocused';

  for (const key of /** @type {const} */ (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])) {
    registerCommand(sys, {
      id: `wm.snap.${key.slice(5).toLowerCase()}`,
      title: `shell.cmd.snap${key.slice(5)}`,
      icon: 'layout-split',
      shortcut: `Mod+${key}`,
      when: windowOpen,
      run: () => {
        const w = focused();
        if (!w) return;
        const next = snapForKey(w.state === 'normal' ? null : (w.zone ?? 'max'), key);
        if (next === 'minimize') wm.minimize(w.id);
        else wm.snap(w.id, next);
      },
    });
  }
  registerCommand(sys, {
    id: 'wm.minimize',
    title: 'shell.cmd.minimize',
    icon: 'minimize',
    shortcut: 'Mod+M',
    when: 'appFocused',
    run: () => focused() && wm.minimize(/** @type {any} */ (focused()).id),
  });
  registerCommand(sys, {
    id: 'wm.maximize',
    title: 'shell.cmd.maximize',
    icon: 'maximize',
    when: 'appFocused',
    run: () => focused() && wm.toggleMaximize(/** @type {any} */ (focused()).id),
  });
  const closeWindow = () => {
    const w = focused();
    if (w) void sys.lifecycle.close(w.id);
  };
  registerCommand(sys, {
    id: 'wm.close',
    title: 'shell.cmd.close',
    icon: 'close',
    shortcut: 'Alt+W',
    when: 'appFocused',
    run: closeWindow,
  });
  registerCommand(sys, {
    id: 'wm.close.native',
    title: 'shell.cmd.close',
    shortcut: 'Mod+W',
    when: 'appFocused',
    hidden: true,
    run: closeWindow,
  });
  registerCommand(sys, {
    id: 'wm.close.f4',
    title: 'shell.cmd.close',
    shortcut: 'Alt+F4',
    when: 'appFocused',
    hidden: true,
    run: closeWindow,
  });

  const ws = () => wm.workspaces.length;
  registerCommand(sys, {
    id: 'workspace.next',
    title: 'shell.cmd.workspaceNext',
    icon: 'arrow-right',
    shortcut: 'Ctrl+Alt+ArrowRight',
    run: () => wm.switchWorkspace((wm.current + 1) % ws()),
  });
  registerCommand(sys, {
    id: 'workspace.previous',
    title: 'shell.cmd.workspacePrevious',
    icon: 'arrow-left',
    shortcut: 'Ctrl+Alt+ArrowLeft',
    run: () => wm.switchWorkspace((wm.current - 1 + ws()) % ws()),
  });
  for (let n = 1; n <= 9; n++) {
    registerCommand(sys, {
      id: `workspace.go.${n}`,
      title: 'shell.cmd.workspaceGo',
      shortcut: `Mod+${n}`,
      hidden: true,
      run: () => wm.switchWorkspace(n - 1),
    });
  }
  const moveBy = (/** @type {number} */ d) => {
    const w = focused();
    if (!w) return;
    const target = w.workspace + d;
    if (target < 0 || target >= ws()) return;
    wm.moveToWorkspace(w.id, target);
    wm.switchWorkspace(target);
    wm.focus(w.id);
  };
  registerCommand(sys, {
    id: 'workspace.moveRight',
    title: 'shell.cmd.moveRight',
    icon: 'arrow-right',
    shortcut: 'Mod+Shift+ArrowRight',
    when: windowOpen,
    run: () => moveBy(1),
  });
  registerCommand(sys, {
    id: 'workspace.moveLeft',
    title: 'shell.cmd.moveLeft',
    icon: 'arrow-left',
    shortcut: 'Mod+Shift+ArrowLeft',
    when: windowOpen,
    run: () => moveBy(-1),
  });
  registerCommand(sys, {
    id: 'workspace.add',
    title: 'shell.cmd.workspaceAdd',
    icon: 'plus',
    run: () =>
      wm.setWorkspaces(
        ws() + 1,
        wm.workspaces.map((w) => w.name),
      ),
  });
  registerCommand(sys, {
    id: 'workspace.remove',
    title: 'shell.cmd.workspaceRemove',
    icon: 'minus',
    run: () => {
      if (ws() <= 1) return;
      // Windows of the removed (last) workspace move to the one before it.
      const last = ws() - 1;
      for (const w of wm.list()) if (w.workspace === last) wm.moveToWorkspace(w.id, last - 1);
      wm.setWorkspaces(
        last,
        wm.workspaces.map((w) => w.name),
      );
    },
  });
  registerCommand(sys, {
    id: 'shell.launchApp',
    title: 'shell.cmd.launchApp',
    hidden: true,
    run: (args) => args?.appId && shell.launch(args.appId, args.args),
  });
}
