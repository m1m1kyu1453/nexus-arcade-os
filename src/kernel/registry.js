// @ts-check
// App registry: validated manifests, categories, enable/disable, and lazy loading of each
// app's code chunk (cached; a failed load can be retried).
import { CATEGORIES, ManifestError, validateManifest } from './manifest.js';

/** @typedef {import('./types').AppManifest} AppManifest */
/** @typedef {import('./types').AppModule} AppModule */

/**
 * @param {object} options
 * @param {import('./bus.js').EventBus} options.bus
 * @param {import('./logger.js').Logger} options.log
 * @param {Iterable<string>} [options.disabled] ids disabled by the user (persisted by the caller)
 */
export function createRegistry({ bus, log, disabled = [] }) {
  /** @type {Map<string, AppManifest>} */
  const apps = new Map();
  const disabledIds = new Set(disabled);
  /** @type {Map<string, Promise<AppModule>>} */
  const modules = new Map();

  /** @param {string} id */
  function require(id) {
    const manifest = apps.get(id);
    if (!manifest) throw new Error(`Unknown app "${id}"`);
    return manifest;
  }

  return {
    /**
     * Validates and registers a manifest. Throws ManifestError listing every problem.
     * @param {AppManifest} manifest
     */
    register(manifest) {
      const problems = validateManifest(manifest);
      if (problems.length) throw new ManifestError(/** @type {any} */ (manifest)?.id ?? '', problems);
      if (apps.has(manifest.id)) throw new ManifestError(manifest.id, [`id: "${manifest.id}" is already registered`]);
      apps.set(manifest.id, Object.freeze({ ...manifest }));
      bus.emit('app:registered', { id: manifest.id });
      return manifest.id;
    },

    /**
     * Registers many manifests; invalid ones are logged and skipped so one broken app can't
     * stop the OS from booting.
     * @param {AppManifest[]} manifests
     * @returns {{ registered: string[], failed: { id: string, error: Error }[] }}
     */
    registerAll(manifests) {
      /** @type {string[]} */
      const registered = [];
      /** @type {{ id: string, error: Error }[]} */
      const failed = [];
      for (const manifest of manifests) {
        try {
          registered.push(this.register(manifest));
        } catch (error) {
          const id = String(/** @type {any} */ (manifest)?.id ?? '(unknown)');
          log.error(`App "${id}" was not registered`, error);
          failed.push({ id, error: /** @type {Error} */ (error) });
        }
      }
      return { registered, failed };
    },

    /** @param {string} id */
    unregister(id) {
      if (!apps.delete(id)) return;
      modules.delete(id);
      bus.emit('app:unregistered', { id });
    },

    /** @param {string} id */
    get: (id) => apps.get(id),
    /** @param {string} id */
    has: (id) => apps.has(id),

    /**
     * @param {{ category?: AppManifest['category'], includeDisabled?: boolean }} [filter]
     * @returns {AppManifest[]}
     */
    list({ category, includeDisabled = false } = {}) {
      return [...apps.values()].filter(
        (m) => (includeDisabled || !disabledIds.has(m.id)) && (!category || m.category === category),
      );
    },

    /** Enabled apps grouped by category, in the standard category order. */
    byCategory() {
      /** @type {Partial<Record<AppManifest['category'], AppManifest[]>>} */
      const groups = {};
      for (const category of CATEGORIES) {
        const list = this.list({ category });
        if (list.length) groups[category] = list;
      }
      return groups;
    },

    /** @param {string} id */
    isEnabled: (id) => apps.has(id) && !disabledIds.has(id),

    /**
     * @param {string} id
     * @param {boolean} enabled
     */
    setEnabled(id, enabled) {
      require(id);
      if (enabled === !disabledIds.has(id)) return;
      if (enabled) disabledIds.delete(id);
      else disabledIds.add(id);
      bus.emit('app:enabled-changed', { id, enabled });
    },

    disabledIds: () => [...disabledIds],

    /**
     * Loads (once) and returns an app's module.
     * @param {string} id
     * @returns {Promise<AppModule>}
     */
    load(id) {
      const manifest = require(id);
      let promise = modules.get(id);
      if (!promise) {
        promise = Promise.resolve()
          .then(() => manifest.load())
          .then((mod) => {
            const module = /** @type {any} */ (mod)?.default ?? mod;
            if (typeof module?.mount !== 'function') throw new Error(`App "${id}" does not export mount()`);
            return /** @type {AppModule} */ (module);
          });
        modules.set(id, promise);
        promise.catch((error) => {
          modules.delete(id); // allow a retry (e.g. chunk failed to download)
          log.error(`Failed to load app "${id}"`, error);
        });
      }
      return promise;
    },
  };
}

/** @typedef {ReturnType<typeof createRegistry>} Registry */
