// @ts-check
// Recently opened files (Explorer sidebar, "Recent" searches). A file counts as opened when an
// intent hands it to an app. Paths follow renames/moves and drop out when the file is trashed
// or deleted, so the list never points at something that isn't there.
import { isInside } from './path.js';

const LIMIT = 30;

/**
 * @param {object} options
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {() => number} [options.now]
 */
export function createRecentFiles({ store, bus, now = Date.now }) {
  /** @type {{ path: string, at: number }[]} newest first */
  let items = [];
  const save = () => {
    void store.set('items', items);
    bus.emit('vfs:recent-changed', { count: items.length });
  };

  bus.on('vfs:changed', (change) => {
    const { type, path, oldPath } = /** @type {{ type: string, path: string, oldPath?: string }} */ (change);
    if (type === 'moved' && oldPath) {
      let touched = false;
      items = items.map((i) => {
        if (!isInside(oldPath, i.path)) return i;
        touched = true;
        return { ...i, path: path + i.path.slice(oldPath.length) };
      });
      if (touched) save();
    } else if (type === 'trashed' || type === 'deleted') {
      const gone = oldPath ?? path;
      const before = items.length;
      items = items.filter((i) => !isInside(gone, i.path));
      if (items.length !== before) save();
    }
  });

  return {
    async load() {
      const saved = await store.get('items');
      items = Array.isArray(saved) ? saved.filter((i) => typeof i?.path === 'string') : [];
    },
    /** @param {string} path */
    add(path) {
      items = [{ path, at: now() }, ...items.filter((i) => i.path !== path)].slice(0, LIMIT);
      save();
    },
    /** @returns {{ path: string, at: number }[]} */
    list: () => items.slice(),
    clear() {
      items = [];
      save();
    },
  };
}

/** @typedef {ReturnType<typeof createRecentFiles>} RecentFiles */
