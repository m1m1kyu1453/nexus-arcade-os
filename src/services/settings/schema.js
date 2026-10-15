// @ts-check
// Setting validation and coercion. A stored value that no longer fits its declaration (the
// type or options changed between versions) is coerced if that is unambiguous ("800" → 800),
// otherwise the default applies. This is the settings migration strategy: never crash, never
// keep an invalid value.

/** @typedef {import('../../kernel/types').SettingDecl} SettingDecl */

/**
 * @param {SettingDecl} decl
 * @param {unknown} value
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function validateSetting(decl, value) {
  switch (decl.type) {
    case 'boolean':
      return typeof value === 'boolean' ? ok(value) : fail('must be true or false');
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail('must be a number');
      if (decl.min !== undefined && value < decl.min) return fail(`must be at least ${decl.min}`);
      if (decl.max !== undefined && value > decl.max) return fail(`must be at most ${decl.max}`);
      return ok(value);
    }
    case 'enum':
      return decl.options.some((o) => o.value === value)
        ? ok(value)
        : fail(`must be one of ${decl.options.map((o) => o.value).join(', ')}`);
    case 'color':
      // '' means "use the theme's default".
      return typeof value === 'string' && (value === '' || /^#[0-9a-f]{6}$/i.test(value))
        ? ok(value.toLowerCase())
        : fail('must be a hex color like #3ef0ff');
    case 'shortcut':
      return typeof value === 'string' && value.length <= 64 ? ok(value) : fail('must be a shortcut like "Mod+K"');
    case 'path':
      return typeof value === 'string' && (value === '' || value.startsWith('/'))
        ? ok(value)
        : fail('must be an absolute path');
    case 'string':
      return typeof value === 'string' && value.length <= 10_000 ? ok(value) : fail('must be text');
    default:
      return fail('has an unknown type');
  }
}

/**
 * Best-effort conversion of an old stored value; returns the default if impossible.
 * @param {SettingDecl} decl
 * @param {unknown} value
 */
export function coerceSetting(decl, value) {
  const direct = validateSetting(decl, value);
  if (direct.ok) return direct.value;
  let candidate = value;
  if (decl.type === 'number' && typeof value === 'string' && value.trim() !== '') candidate = Number(value);
  if (decl.type === 'boolean' && (value === 'true' || value === 'false')) candidate = value === 'true';
  if (decl.type === 'number' && typeof candidate === 'number' && Number.isFinite(candidate)) {
    candidate = Math.min(decl.max ?? Infinity, Math.max(decl.min ?? -Infinity, candidate));
  }
  if (['string', 'color', 'shortcut', 'path', 'enum'].includes(decl.type) && typeof value === 'number')
    candidate = String(value);
  const converted = validateSetting(decl, candidate);
  return converted.ok ? converted.value : decl.default;
}

/** @param {unknown} value */
const ok = (value) => /** @type {const} */ ({ ok: true, value });
/** @param {string} error */
const fail = (error) => /** @type {const} */ ({ ok: false, error });
