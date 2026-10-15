// @ts-check
// Turns `manifest.storage` into object stores, the scoped `ctx.storage` object, and app
// migrations. An app can only reach its own collections and kv scope.
import { collectionStore, createCollection, createKeyValue } from './collections.js';
import { runMigrations } from './migrations.js';

/** @typedef {import('../../kernel/types').AppManifest} AppManifest */
/** @typedef {import('../../kernel/types').IndexDecl} IndexDecl */

/**
 * @param {string | string[] | IndexDecl} decl
 * @returns {import('./types.js').IndexSchema}
 */
export function normalizeIndex(decl) {
  if (typeof decl === 'string' || Array.isArray(decl)) return { keyPath: decl };
  return { keyPath: decl.keyPath, unique: !!decl.unique, multiEntry: !!decl.multiEntry };
}

/**
 * Object stores an app needs (one per declared collection).
 * @param {Pick<AppManifest, 'id' | 'storage'>} manifest
 * @returns {import('./types.js').DbSchema}
 */
export function appStoreSchema(manifest) {
  /** @type {import('./types.js').DbSchema} */
  const schema = {};
  for (const [name, { indexes = {} } = {}] of Object.entries(manifest.storage?.collections ?? {})) {
    schema[collectionStore(manifest.id, name)] = {
      keyPath: 'id',
      indexes: Object.fromEntries(Object.entries(indexes).map(([k, v]) => [k, normalizeIndex(v)])),
    };
  }
  return schema;
}

/**
 * The `ctx.storage` object for one app.
 * @param {object} options
 * @param {import('./types.js').Database} options.db
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {Pick<AppManifest, 'id' | 'storage'>} options.manifest
 * @param {boolean} [options.readOnly]  data is newer than this code or a migration failed
 * @param {(info: { store: string, key: unknown, reason: string }) => void} [options.onQuarantine]
 */
export function createAppStorage({ db, bus, manifest, readOnly = false, onQuarantine }) {
  const declared = new Set(Object.keys(manifest.storage?.collections ?? {}));
  /** @type {Map<string, ReturnType<typeof createCollection>>} */
  const cache = new Map();
  const target = readOnly ? readOnlyDb(db, manifest.id) : db;
  return {
    kv: createKeyValue({ db: target, scope: manifest.id, bus }),
    /** @param {string} name */
    collection(name) {
      if (!declared.has(name)) {
        throw new Error(`Collection "${name}" is not declared in ${manifest.id}'s manifest (storage.collections)`);
      }
      let collection = cache.get(name);
      if (!collection) {
        collection = createCollection({ db: target, bus, scope: manifest.id, name, onQuarantine });
        cache.set(name, collection);
      }
      return collection;
    },
  };
}

/**
 * Runs an app's pending migrations. Migrations see a context limited to the app's collections.
 * @param {object} options
 * @param {import('./types.js').Database} options.db
 * @param {Pick<AppManifest, 'id' | 'storage'>} options.manifest
 * @param {Parameters<typeof runMigrations>[0]['onProgress']} [options.onProgress]
 */
export async function migrateApp({ db, manifest, onProgress }) {
  const storage = manifest.storage;
  const stores = Object.keys(appStoreSchema(manifest));
  const list = storage?.migrations ? (await storage.migrations()).default : [];
  const migrations = list.map((m) => ({
    to: m.to,
    description: m.description,
    /** @param {import('./types.js').StoreOps} tx */
    run: (tx) =>
      m.run({
        collection(name) {
          const store = collectionStore(manifest.id, name);
          if (!stores.includes(store)) throw new Error(`Collection "${name}" is not declared`);
          return {
            get: (id) => tx.get(store, id),
            getAll: () => tx.getAll(store),
            put: async (item) => void (await tx.put(store, item)),
            delete: (id) => tx.delete(store, id),
            clear: () => tx.clear(store),
          };
        },
      }),
  }));
  return runMigrations({
    db,
    scope: manifest.id,
    target: storage?.version ?? 0,
    migrations,
    stores: [...stores, 'kv'],
    onProgress,
  });
}

/**
 * Rejects writes so an app whose data couldn't be migrated can still show it, but never
 * damage it.
 * @param {import('./types.js').Database} db
 * @param {string} appId
 * @returns {import('./types.js').Database}
 */
function readOnlyDb(db, appId) {
  const refuse = () =>
    Promise.reject(
      Object.assign(new Error(`${appId}'s data is read-only until its migration problem is resolved`), {
        name: 'ReadOnlyError',
      }),
    );
  return {
    ...db,
    put: refuse,
    delete: refuse,
    clear: refuse,
    transaction: (stores, mode, fn) => (mode === 'readwrite' ? refuse() : db.transaction(stores, mode, fn)),
  };
}
