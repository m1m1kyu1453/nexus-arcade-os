// @ts-check
// Settings service: system settings + per-app settings declared in manifests.
//
// - Values are cached in memory after `load()`, so `get()` is synchronous (UI code can read
//   settings while rendering).
// - Only values that differ from the default are stored; resetting deletes the record, so a
//   changed default in a newer version applies automatically.
// - Changes apply live through 'settings:changed' events (also from other tabs via the relay).
import { coerceSetting, validateSetting } from './schema.js';

export const SETTINGS_STORE_SCHEMA = { settings: { keyPath: ['scope', 'key'] } };
const STORE = 'settings';

/** @typedef {import('../../kernel/types').SettingDecl} SettingDecl */

export class SettingError extends Error {
  name = 'SettingError';
}

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.db
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {import('../../kernel/logger.js').Logger} options.log
 */
export function createSettings({ db, bus, log }) {
  /** @type {Map<string, Map<string, SettingDecl>>} scope → key → declaration */
  const schemas = new Map();
  /** @type {Map<string, unknown>} 'scope\0key' → stored (non-default) value */
  const values = new Map();
  /** @type {Map<string, unknown>} raw stored values for scopes not registered yet */
  const pending = new Map();
  const id = (/** @type {string} */ scope, /** @type {string} */ key) => `${scope}\u0000${key}`;

  /** @param {string} scope @param {string} key */
  function declOf(scope, key) {
    const decl = schemas.get(scope)?.get(key);
    if (!decl) throw new SettingError(`Unknown setting "${key}" in "${scope}"`);
    return decl;
  }

  /** @param {string} scope @param {SettingDecl} decl @param {unknown} raw */
  function adopt(scope, decl, raw) {
    const value = coerceSetting(decl, raw);
    if (value !== raw)
      log.warn(`Setting ${scope}/${decl.key} had an invalid stored value; using ${JSON.stringify(value)}`);
    if (sameValue(value, decl.default)) values.delete(id(scope, decl.key));
    else values.set(id(scope, decl.key), value);
  }

  // Changes from other tabs: update the cache before anyone else reacts.
  bus.on('settings:changed', (p) => {
    if (!p?.remote) return;
    const decl = schemas.get(p.scope)?.get(p.key);
    if (decl) adopt(p.scope, decl, p.value);
  });

  return {
    /**
     * Declares the settings of a scope ('system' or an app id). Re-registering replaces them.
     * @param {string} scope
     * @param {SettingDecl[]} decls
     */
    register(scope, decls) {
      schemas.set(scope, new Map(decls.map((d) => [d.key, d])));
      for (const decl of decls) {
        const key = id(scope, decl.key);
        if (pending.has(key)) {
          adopt(scope, decl, pending.get(key));
          pending.delete(key);
        }
      }
    },

    /** Reads all stored values. Call once after opening the profile database. */
    async load() {
      values.clear();
      pending.clear();
      for (const { scope, key, value } of await db.getAll(STORE)) {
        const decl = schemas.get(scope)?.get(key);
        if (decl) adopt(scope, decl, value);
        else pending.set(id(scope, key), value);
      }
    },

    /**
     * @param {string} scope
     * @param {string} key
     */
    get(scope, key) {
      const decl = declOf(scope, key);
      const k = id(scope, key);
      return values.has(k) ? values.get(k) : decl.default;
    },

    /**
     * Validates, stores and announces a new value.
     * @param {string} scope
     * @param {string} key
     * @param {unknown} value
     */
    async set(scope, key, value) {
      const decl = declOf(scope, key);
      const result = validateSetting(decl, value);
      if (!result.ok) throw new SettingError(`Setting "${key}" ${result.error}`);
      const k = id(scope, key);
      const previous = values.has(k) ? values.get(k) : decl.default;
      if (sameValue(previous, result.value)) return;
      if (sameValue(result.value, decl.default)) {
        await db.delete(STORE, [scope, key]);
        values.delete(k);
      } else {
        await db.put(STORE, { scope, key, value: result.value });
        values.set(k, result.value);
      }
      bus.emit('settings:changed', { scope, key, value: result.value });
    },

    /** @param {string} scope @param {string} key */
    async reset(scope, key) {
      await this.set(scope, key, declOf(scope, key).default);
    },

    /** Resets every setting of one scope (e.g. one app). */
    async resetScope(/** @type {string} */ scope) {
      for (const key of schemas.get(scope)?.keys() ?? []) await this.reset(scope, key);
    },

    /** Resets every registered setting. */
    async resetAll() {
      for (const scope of schemas.keys()) await this.resetScope(scope);
    },

    /**
     * Calls `fn(value, key)` when a setting changes. `key` '*' = any setting of the scope.
     * @param {string} scope
     * @param {string} key
     * @param {(value: unknown, key: string) => void} fn
     */
    onChange(scope, key, fn) {
      return bus.on('settings:changed', (p) => {
        if (p.scope === scope && (key === '*' || p.key === key)) fn(this.get(scope, p.key), p.key);
      });
    },

    /** Declarations with current values, for the Settings app. */
    describe(/** @type {string} */ scope) {
      return [...(schemas.get(scope)?.values() ?? [])].map((decl) => ({
        ...decl,
        value: this.get(scope, decl.key),
        isDefault: !values.has(id(scope, decl.key)),
      }));
    },

    scopes: () => [...schemas.keys()],
  };
}

/** @param {unknown} a @param {unknown} b */
function sameValue(a, b) {
  return Object.is(a, b);
}

/** @typedef {ReturnType<typeof createSettings>} Settings */
