// @ts-check
// Small helpers shared by shell components.

/** @param {import('../kernel/system.js').System} system @param {string} appId */
export function appName(system, appId) {
  const m = system.registry.get(appId);
  return m ? system.localize(m.name) : appId;
}

/**
 * Key-value store in the profile database for shell state.
 * @param {import('../kernel/system.js').System} system
 * @param {string} scope
 */
export function createStore(system, scope) {
  return {
    get: (/** @type {string} */ key) => system.db.get('kv', [scope, key]).then((r) => r?.value),
    set: (/** @type {string} */ key, /** @type {unknown} */ value) =>
      system.db.put('kv', { scope, key, value }).then(() => {}),
  };
}

/**
 * A command title that follows language switches (resolved when the palette lists it).
 * @param {import('../kernel/system.js').System} system
 * @param {string} key system message key
 * @returns {import('../kernel/types').L10n}
 */
export function liveText(system, key) {
  const get = () => system.i18n.t('system', key);
  return {
    get en() {
      return get();
    },
    get de() {
      return get();
    },
  };
}

/**
 * Registers a shell command with a localized title and optional default shortcut.
 * @param {import('../kernel/system.js').System} system
 * @param {{ id: string, title: string, icon?: string, shortcut?: string, when?: string, hidden?: boolean, category?: string, run: (args?: any) => unknown, pick?: () => any, preview?: (value: any) => void, cancelPreview?: () => void }} command
 *   `title` and `category` are system message keys
 */
export function registerCommand(system, { title, shortcut, category = 'shell.category', ...rest }) {
  system.commands.register({ ...rest, title: liveText(system, title), category: liveText(system, category) });
  if (shortcut) system.shortcuts.setDefault(rest.id, shortcut);
}
