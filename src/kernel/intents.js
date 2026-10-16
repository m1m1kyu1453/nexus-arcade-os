// @ts-check
// Intents: "open this file" and "share this data" across apps, via the `handles` that apps
// declare in their manifests. Choosing between several apps (and remembering "Always use this
// app") is delegated to a chooser the shell provides (the "Open with…" dialog).
import { matchesType, mimeFromPath } from '../services/vfs/mime.js';

/** @typedef {import('./types').AppManifest} AppManifest */

export class NoHandlerError extends Error {
  name = 'NoHandlerError';
}

/**
 * @typedef {object} Choice
 * @property {string} appId
 * @property {boolean} [always]  remember as the default for this file type
 */

/**
 * @typedef {object} ChooseRequest
 * @property {'open' | 'share'} action
 * @property {string} type        mime type
 * @property {string} [path]
 * @property {AppManifest[]} candidates
 */

/**
 * @param {object} options
 * @param {import('./registry.js').Registry} options.registry
 * @param {{ launch(appId: string, args: import('./types').LaunchArgs): Promise<string> }} options.lifecycle
 * @param {(request: ChooseRequest) => Promise<Choice | null>} options.choose   null = cancelled
 * @param {{ get(key: string): Promise<string | undefined>, set(key: string, appId: string): Promise<void>, delete(key: string): Promise<void> }} options.defaults
 * @param {(path: string) => void} [options.onOpened]  a file was handed to an app (recent files)
 */
export function createIntents({ registry, lifecycle, choose, defaults, onOpened = () => {} }) {
  /**
   * @param {'open' | 'share'} action
   * @param {{ mime: string, path?: string }} file
   */
  function candidates(action, file) {
    return registry
      .list()
      .filter((m) => (m.handles ?? []).some((h) => h.action === action && h.types.some((t) => matchesType(t, file))));
  }

  /**
   * Default-app key: the extension when there is one ('.md'), else the mime type.
   * @param {{ mime: string, path?: string }} file
   */
  const defaultKey = ({ mime, path }) => {
    const ext = path?.match(/(\.[^./]+)$/)?.[1]?.toLowerCase();
    return `open:${ext ?? mime}`;
  };

  /**
   * Opens a file with the right app.
   * @param {string | { path: string, mime?: string }} target VFS path or entry
   * @param {{ with?: string }} [options]
   * @returns {Promise<string | null>} instance id, or null if the user cancelled
   */
  async function open(target, options = {}) {
    const instance = await openWith(target, options);
    if (instance) onOpened(typeof target === 'string' ? target : target.path);
    return instance;
  }

  /**
   * @param {string | { path: string, mime?: string }} target
   * @param {{ with?: string }} options
   * @returns {Promise<string | null>}
   */
  async function openWith(target, options) {
    const path = typeof target === 'string' ? target : target.path;
    const mime = (typeof target === 'object' && target.mime) || mimeFromPath(path);
    const file = { mime, path };
    const intent = { action: /** @type {const} */ ('open'), type: mime, path };

    if (options.with) return lifecycle.launch(options.with, { intent });

    const apps = candidates('open', file);
    if (apps.length === 0) throw new NoHandlerError(`No app can open "${path}" (${mime})`);

    const key = defaultKey(file);
    const preferred = await defaults.get(key);
    if (preferred && apps.some((a) => a.id === preferred)) return lifecycle.launch(preferred, { intent });
    if (preferred) await defaults.delete(key); // that app is gone or no longer handles this type

    if (apps.length === 1) return lifecycle.launch(apps[0].id, { intent });
    const choice = await choose({ action: 'open', type: mime, path, candidates: apps });
    if (!choice) return null;
    if (!apps.some((a) => a.id === choice.appId)) throw new Error(`"${choice.appId}" cannot open this file`);
    if (choice.always) await defaults.set(key, choice.appId);
    return lifecycle.launch(choice.appId, { intent });
  }

  /**
   * Sends data (text, a file path, an image Blob…) to an app that accepts this type.
   * @param {unknown} data
   * @param {string} type mime type of the data
   * @param {{ to?: string }} [options]
   * @returns {Promise<string | null>}
   */
  async function share(data, type, options = {}) {
    const intent = { action: /** @type {const} */ ('share'), type, data };
    if (options.to) return lifecycle.launch(options.to, { intent });
    const apps = candidates('share', { mime: type });
    if (apps.length === 0) throw new NoHandlerError(`No app accepts shared ${type}`);
    if (apps.length === 1) return lifecycle.launch(apps[0].id, { intent });
    const choice = await choose({ action: 'share', type, candidates: apps });
    if (!choice) return null;
    return lifecycle.launch(choice.appId, { intent });
  }

  return {
    open,
    share,
    /** Apps that could open this path (for "Open with…" menus). */
    openersFor: (/** @type {string} */ path, mime = mimeFromPath(path)) => candidates('open', { mime, path }),
    /** Apps that accept shared data of this type. */
    shareTargetsFor: (/** @type {string} */ type) => candidates('share', { mime: type }),
    /** @param {string} path */
    getDefault: (path) => defaults.get(defaultKey({ mime: mimeFromPath(path), path })),
    /** "Always open this file type with …". @param {string} path @param {string} appId */
    async setDefault(path, appId) {
      if (!candidates('open', { mime: mimeFromPath(path), path }).some((m) => m.id === appId))
        throw new Error(`"${appId}" cannot open this file`);
      await defaults.set(defaultKey({ mime: mimeFromPath(path), path }), appId);
    },
    /** @param {string} path */
    clearDefault: (path) => defaults.delete(defaultKey({ mime: mimeFromPath(path), path })),
  };
}

/** @typedef {ReturnType<typeof createIntents>} Intents */
