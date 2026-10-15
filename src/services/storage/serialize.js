// @ts-check
// Converts structured-cloneable data to JSON-safe values and back. Preserves Date, Blob/File,
// ArrayBuffer, typed arrays, Map, Set, undefined, NaN, ±Infinity and -0. Encoding is async
// because reading a Blob is.

const TAG = '$nx';

/** @param {Uint8Array} bytes */
export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** @param {string} base64 */
export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const TYPED_ARRAYS = /** @type {const} */ ({
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  DataView,
});

/**
 * @param {unknown} value
 * @returns {Promise<unknown>} JSON-safe value
 */
export async function encode(value) {
  if (value === undefined) return { [TAG]: 'undefined' };
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { [TAG]: 'NaN' };
    if (!Number.isFinite(value)) return { [TAG]: value > 0 ? 'Infinity' : '-Infinity' };
    if (Object.is(value, -0)) return { [TAG]: '-0' };
    return value;
  }
  if (typeof value === 'bigint') return { [TAG]: 'bigint', v: value.toString() };
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return { [TAG]: 'date', v: value.getTime() };
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const v = bytesToBase64(new Uint8Array(await value.arrayBuffer()));
    if (typeof File !== 'undefined' && value instanceof File) {
      return { [TAG]: 'file', v, type: value.type, name: value.name, lastModified: value.lastModified };
    }
    return { [TAG]: 'blob', v, type: value.type };
  }
  if (value instanceof ArrayBuffer) return { [TAG]: 'buffer', v: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { [TAG]: 'view', ctor: value.constructor.name, v: bytesToBase64(bytes) };
  }
  if (value instanceof Map) return { [TAG]: 'map', v: await encode([...value.entries()]) };
  if (value instanceof Set) return { [TAG]: 'set', v: await encode([...value.values()]) };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = await encode(v);
  // A user object that happens to have our tag key is wrapped so it isn't mistaken for a tag.
  return TAG in out ? { [TAG]: 'object', v: out } : out;
}

/**
 * @param {unknown} value JSON-safe value produced by `encode`
 * @returns {any}
 */
export function decode(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  const obj = /** @type {Record<string, any>} */ (value);
  if (TAG in obj) {
    switch (obj[TAG]) {
      case 'undefined':
        return undefined;
      case 'NaN':
        return NaN;
      case 'Infinity':
        return Infinity;
      case '-Infinity':
        return -Infinity;
      case '-0':
        return -0;
      case 'bigint':
        return BigInt(obj.v);
      case 'date':
        return new Date(obj.v);
      case 'blob':
        return new Blob([base64ToBytes(obj.v)], { type: obj.type });
      case 'file':
        return new File([base64ToBytes(obj.v)], obj.name, { type: obj.type, lastModified: obj.lastModified });
      case 'buffer':
        return base64ToBytes(obj.v).buffer;
      case 'view': {
        const bytes = base64ToBytes(obj.v);
        const Ctor = TYPED_ARRAYS[/** @type {keyof typeof TYPED_ARRAYS} */ (obj.ctor)] ?? Uint8Array;
        if (Ctor === DataView) return new DataView(bytes.buffer);
        const size = /** @type {{ BYTES_PER_ELEMENT: number }} */ (/** @type {unknown} */ (Ctor)).BYTES_PER_ELEMENT;
        return new /** @type {any} */ (Ctor)(bytes.buffer, 0, bytes.byteLength / size);
      }
      case 'map':
        return new Map(decode(obj.v));
      case 'set':
        return new Set(decode(obj.v));
      case 'object':
        return decodeObject(obj.v);
      default:
        throw new Error(`Unknown encoded type "${obj[TAG]}"`);
    }
  }
  return decodeObject(obj);
}

/** @param {Record<string, unknown>} obj */
function decodeObject(obj) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = decode(v);
  return out;
}
