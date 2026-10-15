// @ts-check
// Password-based crypto on Web Crypto: PBKDF2-SHA256 (600,000 iterations, OWASP 2023) for
// hashing secrets and deriving keys, AES-GCM-256 with a random salt and IV per encryption.
// Used for profile locks, encrypted backups, and (later) notes, journal and the password vault.
// A lost password means lost data: there is no recovery, and the UI must say so.
import { base64ToBytes, bytesToBase64 } from './storage/serialize.js';

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** @param {number} n */
export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** @param {string} secret */
const encodeSecret = (secret) => new TextEncoder().encode(secret.normalize('NFC'));

/**
 * @param {string} secret
 * @param {Uint8Array} salt
 * @param {number} iterations
 */
async function pbkdf2Key(secret, salt, iterations) {
  const material = await crypto.subtle.importKey('raw', encodeSecret(secret), 'PBKDF2', false, [
    'deriveBits',
    'deriveKey',
  ]);
  return {
    material,
    params: { name: 'PBKDF2', hash: 'SHA-256', salt: /** @type {BufferSource} */ (salt), iterations },
  };
}

/**
 * @typedef {object} SecretHash
 * @property {'PBKDF2-SHA256'} algorithm
 * @property {number} iterations
 * @property {string} salt  base64
 * @property {string} hash  base64
 */

/**
 * Hashes a PIN or password for later verification.
 * @param {string} secret
 * @param {{ iterations?: number }} [options]
 * @returns {Promise<SecretHash>}
 */
export async function hashSecret(secret, { iterations = PBKDF2_ITERATIONS } = {}) {
  const salt = randomBytes(SALT_BYTES);
  const { material, params } = await pbkdf2Key(secret, salt, iterations);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(params, material, 256));
  return { algorithm: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(salt), hash: bytesToBase64(bits) };
}

/**
 * @param {string} secret
 * @param {SecretHash} record
 */
export async function verifySecret(secret, record) {
  const { material, params } = await pbkdf2Key(secret, base64ToBytes(record.salt), record.iterations);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(params, material, 256));
  const expected = base64ToBytes(record.hash);
  // Constant-time comparison.
  let diff = bits.length ^ expected.length;
  for (let i = 0; i < Math.min(bits.length, expected.length); i++) diff |= bits[i] ^ expected[i];
  return diff === 0;
}

/**
 * @typedef {object} EncryptedPayload
 * @property {1} v
 * @property {{ name: 'PBKDF2-SHA256', iterations: number, salt: string }} kdf
 * @property {'AES-GCM-256'} cipher
 * @property {string} iv          base64
 * @property {string} data        base64 ciphertext (includes the GCM tag)
 */

/**
 * @param {Uint8Array | string} plaintext
 * @param {string} password
 * @param {{ iterations?: number }} [options]
 * @returns {Promise<EncryptedPayload>}
 */
export async function encrypt(plaintext, password, { iterations = PBKDF2_ITERATIONS } = {}) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveAesKey(password, salt, iterations);
  const bytes = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, /** @type {BufferSource} */ (bytes));
  return {
    v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations, salt: bytesToBase64(salt) },
    cipher: 'AES-GCM-256',
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export class WrongPasswordError extends Error {
  name = 'WrongPasswordError';
}

/**
 * @param {EncryptedPayload} payload
 * @param {string} password
 * @returns {Promise<Uint8Array>}
 */
export async function decrypt(payload, password) {
  if (payload?.v !== 1 || payload.cipher !== 'AES-GCM-256' || payload.kdf?.name !== 'PBKDF2-SHA256') {
    throw new Error('Unsupported encrypted format');
  }
  const key = await deriveAesKey(password, base64ToBytes(payload.kdf.salt), payload.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: /** @type {BufferSource} */ (base64ToBytes(payload.iv)) },
      key,
      /** @type {BufferSource} */ (base64ToBytes(payload.data)),
    );
    return new Uint8Array(plain);
  } catch {
    // GCM authentication failure: wrong password or tampered data (indistinguishable by design).
    throw new WrongPasswordError('Wrong password, or the data was changed');
  }
}

/** @param {EncryptedPayload} payload @param {string} password */
export async function decryptText(payload, password) {
  return new TextDecoder().decode(await decrypt(payload, password));
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 */
async function deriveAesKey(password, salt, iterations) {
  const { material, params } = await pbkdf2Key(password, salt, iterations);
  return crypto.subtle.deriveKey(params, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
