// @ts-check
// Manifest validation. Returns every problem at once, with the path of the bad field, so a
// broken manifest gets one clear error message instead of a crash somewhere later.

/** @typedef {import('./types').AppManifest} AppManifest */

export const CATEGORIES = /** @type {const} */ ([
  'productivity',
  'study',
  'office',
  'dev',
  'cslab',
  'games',
  'media',
  'ai',
  'system',
]);
export const PERMISSIONS = /** @type {const} */ ([
  'vfs',
  'notifications',
  'clipboard',
  'network',
  'ai',
  'scheduler',
  'intents',
  // Privileged ctx.system (built-in system apps only; plugins can never be granted it).
  'system',
]);
export const LOCALES = /** @type {const} */ (['en', 'de']);

const ID = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const NAME = /^[a-z0-9][a-z0-9_-]*$/;
const SETTING_TYPES = ['string', 'number', 'boolean', 'enum', 'color', 'shortcut', 'path', 'date'];

export class ManifestError extends Error {
  /** @param {string} id @param {string[]} problems */
  constructor(id, problems) {
    super(`Invalid manifest${id ? ` "${id}"` : ''}:\n- ${problems.join('\n- ')}`);
    this.name = 'ManifestError';
    this.problems = problems;
  }
}

/**
 * @param {unknown} manifest
 * @returns {string[]} problems (empty when valid)
 */
export function validateManifest(manifest) {
  /** @type {string[]} */
  const problems = [];
  const fail = (/** @type {string} */ path, /** @type {string} */ message) => problems.push(`${path}: ${message}`);

  if (!isObject(manifest)) return ['manifest: must be an object'];
  const m = /** @type {Record<string, any>} */ (manifest);

  if (typeof m.id !== 'string' || !ID.test(m.id))
    fail('id', 'must look like "nexus.notes" (lower-case, dot-separated)');
  l10n(m.name, 'name', fail);
  l10n(m.description, 'description', fail);
  if (typeof m.version !== 'string' || !SEMVER.test(m.version)) fail('version', 'must be semver like "1.0.0"');
  if (typeof m.icon !== 'string' || !m.icon) fail('icon', 'must be an icon id');
  if (!CATEGORIES.includes(m.category)) fail('category', `must be one of ${CATEGORIES.join(', ')}`);
  if (typeof m.load !== 'function') fail('load', 'must be a function returning import("./index.js")');

  optionalArray(m, 'keywords', fail, (k, path) => typeof k === 'string' || fail(path, 'must be a string'));

  if (m.window !== undefined) {
    if (!isObject(m.window)) fail('window', 'must be an object');
    else {
      for (const key of ['width', 'height', 'minWidth', 'minHeight']) {
        const v = m.window[key];
        if (v !== undefined && !(Number.isFinite(v) && v > 0)) fail(`window.${key}`, 'must be a positive number');
      }
      if (m.window.minWidth > m.window.width) fail('window.minWidth', 'must not exceed width');
      if (m.window.minHeight > m.window.height) fail('window.minHeight', 'must not exceed height');
      for (const key of ['resizable', 'singleInstance']) {
        if (m.window[key] !== undefined && typeof m.window[key] !== 'boolean')
          fail(`window.${key}`, 'must be a boolean');
      }
    }
  }

  optionalArray(m, 'permissions', fail, (p, path) =>
    PERMISSIONS.includes(p) ? true : fail(path, `unknown permission "${p}" (${PERMISSIONS.join(', ')})`),
  );

  optionalArray(m, 'handles', fail, (h, path) => {
    if (!isObject(h)) return fail(path, 'must be an object');
    if (h.action !== 'open' && h.action !== 'share') fail(`${path}.action`, 'must be "open" or "share"');
    if (!Array.isArray(h.types) || h.types.length === 0) fail(`${path}.types`, 'must be a non-empty array');
    else
      h.types.forEach((/** @type {unknown} */ t, /** @type {number} */ i) => {
        if (typeof t !== 'string' || !(/^\.[a-z0-9]+$/i.test(t) || /^[\w.+-]+\/[\w.+*-]+$/.test(t))) {
          fail(`${path}.types[${i}]`, 'must be a mime type ("text/markdown", "image/*") or extension (".md")');
        }
      });
  });

  const commandIds = new Set();
  optionalArray(m, 'commands', fail, (c, path) => {
    if (!isObject(c)) return fail(path, 'must be an object');
    if (typeof c.id !== 'string' || !c.id) fail(`${path}.id`, 'must be a non-empty string');
    else if (commandIds.has(c.id)) fail(`${path}.id`, `duplicate command id "${c.id}"`);
    commandIds.add(c.id);
    l10n(c.title, `${path}.title`, fail);
    if (c.shortcut !== undefined && typeof c.shortcut !== 'string') fail(`${path}.shortcut`, 'must be a string');
    if (c.when !== undefined && typeof c.when !== 'string') fail(`${path}.when`, 'must be a string');
    if ('run' in c) fail(`${path}.run`, "manifests are data-only; put the handler in the module's `commands`");
  });

  const terminalNames = new Set();
  optionalArray(m, 'terminal', fail, (c, path) => {
    if (!isObject(c)) return fail(path, 'must be an object');
    if (typeof c.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(c.name))
      fail(`${path}.name`, 'must be a lowercase command name');
    else if (terminalNames.has(c.name)) fail(`${path}.name`, `duplicate terminal command "${c.name}"`);
    terminalNames.add(c.name);
    l10n(c.description, `${path}.description`, fail);
    if (c.usage !== undefined && typeof c.usage !== 'string') fail(`${path}.usage`, 'must be a string');
    if ('run' in c) fail(`${path}.run`, "manifests are data-only; put the handler in the module's `terminal`");
  });
  if (m.help !== undefined && typeof m.help !== 'function')
    fail('help', 'must be a function returning import("./help.md?raw")');
  if (m.changelog !== undefined && typeof m.changelog !== 'function')
    fail('changelog', 'must be a function returning import("./changelog.md?raw")');
  if (m.screenshots !== undefined && typeof m.screenshots !== 'function')
    fail('screenshots', 'must be a function returning import("./screenshots/index.js")');

  const settingKeys = new Set();
  optionalArray(m, 'settings', fail, (s, path) => {
    if (!isObject(s)) return fail(path, 'must be an object');
    if (typeof s.key !== 'string' || !NAME.test(s.key.toLowerCase())) fail(`${path}.key`, 'must be an identifier');
    else if (settingKeys.has(s.key)) fail(`${path}.key`, `duplicate setting "${s.key}"`);
    settingKeys.add(s.key);
    l10n(s.label, `${path}.label`, fail);
    if (!SETTING_TYPES.includes(s.type)) return fail(`${path}.type`, `must be one of ${SETTING_TYPES.join(', ')}`);
    const expected = { number: 'number', boolean: 'boolean' }[/** @type {string} */ (s.type)] ?? 'string';
    if (typeof s.default !== expected) fail(`${path}.default`, `must be a ${expected}`);
    if (s.type === 'enum') {
      if (!Array.isArray(s.options) || s.options.length === 0) fail(`${path}.options`, 'must be a non-empty array');
      else if (!s.options.some((/** @type {{ value: unknown }} */ o) => o?.value === s.default)) {
        fail(`${path}.default`, 'must be one of the options');
      }
    }
    if (s.type === 'number' && typeof s.default === 'number') {
      if (s.min !== undefined && s.default < s.min) fail(`${path}.default`, 'is below min');
      if (s.max !== undefined && s.default > s.max) fail(`${path}.default`, 'is above max');
    }
  });

  optionalArray(m, 'widgets', fail, (w, path) => {
    if (!isObject(w)) return fail(path, 'must be an object');
    if (typeof w.id !== 'string' || !w.id) fail(`${path}.id`, 'must be a non-empty string');
    l10n(w.title, `${path}.title`, fail);
    if (
      !Array.isArray(w.size) ||
      w.size.length !== 2 ||
      !w.size.every((/** @type {unknown} */ n) => Number.isInteger(n) && /** @type {number} */ (n) > 0)
    ) {
      fail(`${path}.size`, 'must be [columns, rows] with positive integers');
    }
    if (
      w.minSize !== undefined &&
      !(
        Array.isArray(w.minSize) &&
        w.minSize.length === 2 &&
        w.minSize.every((/** @type {unknown} */ n) => Number.isInteger(n) && /** @type {number} */ (n) > 0)
      )
    ) {
      fail(`${path}.minSize`, 'must be [columns, rows] with positive integers');
    }
    if (w.settings !== undefined && !Array.isArray(w.settings)) fail(`${path}.settings`, 'must be an array');
    if (typeof w.load !== 'function') fail(`${path}.load`, 'must be a function');
  });

  const achievementIds = new Set();
  optionalArray(m, 'achievements', fail, (a, path) => {
    if (!isObject(a)) return fail(path, 'must be an object');
    if (typeof a.id !== 'string' || !a.id) fail(`${path}.id`, 'must be a non-empty string');
    else if (achievementIds.has(a.id)) fail(`${path}.id`, `duplicate achievement "${a.id}"`);
    achievementIds.add(a.id);
    l10n(a.title, `${path}.title`, fail);
    l10n(a.description, `${path}.description`, fail);
    if (a.goal !== undefined && !(Number.isInteger(a.goal) && a.goal > 0))
      fail(`${path}.goal`, 'must be a positive integer');
  });

  if (m.search !== undefined && typeof m.search !== 'function') fail('search', 'must be a function returning import()');

  if (m.messages !== undefined) {
    if (!isObject(m.messages)) fail('messages', 'must be { en: () => import(…), de: () => import(…) }');
    else
      for (const locale of LOCALES) {
        if (typeof m.messages[locale] !== 'function')
          fail(`messages.${locale}`, 'must be a function returning import()');
      }
  }

  if (m.storage !== undefined) {
    const s = m.storage;
    if (!isObject(s)) fail('storage', 'must be an object');
    else {
      if (!Number.isInteger(s.version) || s.version < 0) fail('storage.version', 'must be an integer ≥ 0');
      if (s.collections !== undefined) {
        if (!isObject(s.collections)) fail('storage.collections', 'must be an object');
        else
          for (const [name, decl] of Object.entries(s.collections)) {
            const path = `storage.collections.${name}`;
            if (!NAME.test(name)) fail(path, 'collection names are lower-case identifiers');
            if (!isObject(decl)) {
              fail(path, 'must be an object');
              continue;
            }
            for (const [indexName, index] of Object.entries(decl.indexes ?? {})) {
              const keyPath = isObject(index) ? index.keyPath : index;
              const valid =
                (typeof keyPath === 'string' && keyPath !== '') ||
                (Array.isArray(keyPath) && keyPath.length > 0 && keyPath.every((k) => typeof k === 'string' && k));
              if (!valid) fail(`${path}.indexes.${indexName}`, 'needs a key path (string or array of strings)');
            }
          }
      }
      if (s.migrations !== undefined && typeof s.migrations !== 'function') {
        fail('storage.migrations', 'must be a function returning import()');
      }
    }
  }

  return problems;
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(path: string, message: string) => void} fail
 */
function l10n(value, path, fail) {
  if (!isObject(value)) return fail(path, `must be { ${LOCALES.map((l) => `${l}: "…"`).join(', ')} }`);
  for (const locale of LOCALES) {
    if (typeof value[locale] !== 'string' || value[locale].trim() === '')
      fail(`${path}.${locale}`, 'must be a non-empty string');
  }
}

/**
 * @param {Record<string, any>} m
 * @param {string} key
 * @param {(path: string, message: string) => void} fail
 * @param {(item: any, path: string) => unknown} each
 */
function optionalArray(m, key, fail, each) {
  if (m[key] === undefined) return;
  if (!Array.isArray(m[key])) return fail(key, 'must be an array');
  m[key].forEach((/** @type {unknown} */ item, /** @type {number} */ i) => each(item, `${key}[${i}]`));
}
