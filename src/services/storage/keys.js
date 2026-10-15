// @ts-check
// IndexedDB key semantics for the non-IndexedDB engines (memory, localStorage), so every engine
// sorts, compares and extracts keys exactly like IndexedDB does.
// Order: number < Date < string < binary < array (arrays compare element-wise).

/** @typedef {IDBValidKey} Key  number | string | Date | BufferSource | Key[] */
/** @typedef {Key[]} KeyArray */
/** @typedef {string | string[]} KeyPath */
/**
 * @typedef {object} KeyRange
 * @property {Key} [only]
 * @property {Key} [lower]
 * @property {Key} [upper]
 * @property {boolean} [lowerOpen]
 * @property {boolean} [upperOpen]
 */

export class DataError extends Error {
  name = 'DataError';
}

/** @param {unknown} key @returns {number} type rank, or -1 if not a valid key */
function rank(key) {
  if (typeof key === 'number') return Number.isNaN(key) ? -1 : 0;
  if (key instanceof Date) return Number.isNaN(key.getTime()) ? -1 : 1;
  if (typeof key === 'string') return 2;
  if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) return 3;
  if (Array.isArray(key)) return key.every((k) => rank(k) !== -1) ? 4 : -1;
  return -1;
}

/** @param {unknown} key @returns {key is Key} */
export function isValidKey(key) {
  return rank(key) !== -1;
}

/** @param {unknown} key @returns {Key} */
export function assertKey(key) {
  if (!isValidKey(key)) throw new DataError(`Invalid key: ${describe(key)}`);
  return key;
}

/** @param {ArrayBuffer | ArrayBufferView} b */
function bytes(b) {
  return b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}

/**
 * Like indexedDB.cmp(): -1, 0 or 1.
 * @param {Key} a
 * @param {Key} b
 * @returns {-1 | 0 | 1}
 */
export function compareKeys(a, b) {
  const ra = rank(a);
  const rb = rank(b);
  if (ra === -1 || rb === -1) throw new DataError('Cannot compare invalid keys');
  if (ra !== rb) return ra < rb ? -1 : 1;
  switch (ra) {
    case 0:
    case 2:
      return a < b ? -1 : a > b ? 1 : 0;
    case 1: {
      const x = /** @type {Date} */ (a).getTime();
      const y = /** @type {Date} */ (b).getTime();
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 3: {
      const x = bytes(/** @type {ArrayBuffer} */ (a));
      const y = bytes(/** @type {ArrayBuffer} */ (b));
      for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
      return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
    }
    default: {
      const x = /** @type {KeyArray} */ (a);
      const y = /** @type {KeyArray} */ (b);
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const c = compareKeys(x[i], y[i]);
        if (c !== 0) return c;
      }
      return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
    }
  }
}

/**
 * Stable string form of a key, for use as a Map key (equal keys ↔ equal strings).
 * @param {Key} key
 * @returns {string}
 */
export function encodeKey(key) {
  switch (rank(key)) {
    case 0:
      return `n${Object.is(key, -0) ? 0 : key}`;
    case 1:
      return `d${/** @type {Date} */ (key).getTime()}`;
    case 2:
      return `s${key}`;
    case 3:
      return `b${Array.from(bytes(/** @type {ArrayBuffer} */ (key))).join(',')}`;
    case 4:
      return `a${JSON.stringify(/** @type {KeyArray} */ (key).map(encodeKey))}`;
    default:
      throw new DataError(`Invalid key: ${describe(key)}`);
  }
}

/**
 * Evaluates a key path against a value. Returns undefined when any part is missing.
 * @param {unknown} value
 * @param {KeyPath} keyPath
 * @returns {unknown}
 */
export function evaluateKeyPath(value, keyPath) {
  if (Array.isArray(keyPath)) {
    const parts = keyPath.map((p) => evaluateKeyPath(value, p));
    return parts.some((p) => p === undefined) ? undefined : parts;
  }
  if (keyPath === '') return value;
  /** @type {any} */
  let current = value;
  for (const part of keyPath.split('.')) {
    if (current === null || typeof current !== 'object' || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Writes `key` into `value` at a (single, string) key path, creating objects on the way.
 * @param {Record<string, any>} value
 * @param {string} keyPath
 * @param {Key} key
 */
export function injectKey(value, keyPath, key) {
  const parts = keyPath.split('.');
  let current = value;
  for (const part of parts.slice(0, -1)) {
    if (current[part] === undefined) current[part] = {};
    current = current[part];
  }
  current[/** @type {string} */ (parts.at(-1))] = key;
}

/**
 * Index keys a record contributes to an index (none if the key path is missing or invalid).
 * @param {unknown} value
 * @param {{ keyPath: KeyPath, multiEntry?: boolean }} index
 * @returns {Key[]}
 */
export function indexKeys(value, { keyPath, multiEntry }) {
  const key = evaluateKeyPath(value, keyPath);
  if (key === undefined) return [];
  if (multiEntry && Array.isArray(key)) {
    /** @type {Map<string, Key>} */
    const unique = new Map();
    for (const k of key) if (isValidKey(k)) unique.set(encodeKey(k), k);
    return [...unique.values()];
  }
  return isValidKey(key) ? [key] : [];
}

/**
 * @param {Key} key
 * @param {KeyRange | undefined} range
 */
export function inRange(key, range) {
  if (!range) return true;
  if ('only' in range) return compareKeys(key, /** @type {Key} */ (range.only)) === 0;
  if (range.lower !== undefined) {
    const c = compareKeys(key, range.lower);
    if (c < 0 || (c === 0 && range.lowerOpen)) return false;
  }
  if (range.upper !== undefined) {
    const c = compareKeys(key, range.upper);
    if (c > 0 || (c === 0 && range.upperOpen)) return false;
  }
  return true;
}

/** @param {unknown} value */
function describe(value) {
  try {
    return typeof value === 'object' ? Object.prototype.toString.call(value) : String(value);
  } catch {
    return typeof value;
  }
}
