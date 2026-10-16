// @ts-check
// Clipboard: the async Clipboard API with fallbacks, plus a history of what was copied inside
// Nexus (for the Clipboard app). Copies marked `sensitive` (passwords) never enter history.

const HISTORY_LIMIT = 50;
const MAX_TEXT_IN_HISTORY = 100_000;

/**
 * @typedef {object} ClipEntry
 * @property {string} id
 * @property {'text' | 'image'} kind
 * @property {string} [text]
 * @property {Blob} [image]
 * @property {string} app    who copied
 * @property {number} at
 */

/**
 * @param {object} options
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {Pick<Clipboard, 'writeText' | 'readText' | 'write'> | undefined} [options.api]
 * @param {Document} [options.document]  for the execCommand fallback
 * @param {() => number} [options.now]
 * @param {() => string} [options.newId]
 */
export function createClipboard({
  store,
  bus,
  api = globalThis.navigator?.clipboard,
  document = globalThis.document,
  now = Date.now,
  newId = () => crypto.randomUUID(),
}) {
  /** @type {ClipEntry[]} */
  let history = [];
  /** Files copied/cut inside Nexus (Explorer, desktop). VFS paths only; never persisted. */
  let files = { paths: /** @type {string[]} */ ([]), cut: false };

  /** @param {ClipEntry} entry */
  async function remember(entry) {
    history = [entry, ...history.filter((h) => !(h.kind === 'text' && h.text === entry.text))].slice(0, HISTORY_LIMIT);
    await store.set('history', history);
    bus.emit('clipboard:changed', { id: entry.id });
  }

  /** Legacy copy for browsers/contexts without the async API (e.g. some file:// cases). @param {string} text */
  function legacyCopy(text) {
    if (!document?.body) return false;
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    let ok;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  return {
    async load() {
      const saved = await store.get('history');
      history = Array.isArray(saved) ? saved : [];
    },

    /**
     * @param {string} text
     * @param {{ app?: string, sensitive?: boolean }} [options]
     */
    async writeText(text, { app = 'system', sensitive = false } = {}) {
      let copied = false;
      try {
        if (api?.writeText) {
          await api.writeText(text);
          copied = true;
        }
      } catch {
        copied = false;
      }
      if (!copied && !legacyCopy(text)) throw new Error('The browser did not allow copying to the clipboard');
      if (!sensitive && text.length <= MAX_TEXT_IN_HISTORY)
        await remember({ id: newId(), kind: 'text', text, app, at: now() });
    },

    /**
     * Copies an image (PNG Blob) where the browser supports it.
     * @param {Blob} image
     * @param {{ app?: string }} [options]
     */
    async writeImage(image, { app = 'system' } = {}) {
      const Item = globalThis.ClipboardItem;
      if (!api?.write || !Item) throw new Error('This browser cannot copy images');
      await api.write([new Item({ [image.type || 'image/png']: image })]);
      await remember({ id: newId(), kind: 'image', image, app, at: now() });
    },

    /** Reads text (the browser may ask the user for permission). */
    async readText() {
      if (!api?.readText)
        throw new Error('This browser does not allow reading the clipboard; paste with Ctrl+V instead');
      return api.readText();
    },

    /** @returns {ClipEntry[]} newest first */
    history: () => history.slice(),

    /** @param {string} id */
    async remove(id) {
      history = history.filter((h) => h.id !== id);
      await store.set('history', history);
      bus.emit('clipboard:changed', {});
    },

    /** @returns {{ paths: string[], cut: boolean }} */
    files: () => ({ paths: files.paths.slice(), cut: files.cut }),

    /** @param {string[]} paths @param {{ cut?: boolean }} [options] */
    setFiles(paths, { cut = false } = {}) {
      files = { paths: [...paths], cut };
      bus.emit('clipboard:files-changed', { count: paths.length, cut });
    },

    async clearHistory() {
      history = [];
      await store.set('history', history);
      bus.emit('clipboard:changed', {});
    },
  };
}

/** @typedef {ReturnType<typeof createClipboard>} ClipboardService */
