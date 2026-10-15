import { describe, expect, it } from 'vitest';
import {
  decrypt,
  decryptText,
  encrypt,
  hashSecret,
  PBKDF2_ITERATIONS,
  verifySecret,
  WrongPasswordError,
} from '../../src/services/crypto.js';

// Full-strength iterations are covered once; other tests use fewer for speed.
const FAST = { iterations: 1000 };

describe('crypto', () => {
  it('uses at least 600,000 PBKDF2 iterations by default', async () => {
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const record = await hashSecret('1234');
    expect(record.iterations).toBe(PBKDF2_ITERATIONS);
    expect(await verifySecret('1234', record)).toBe(true);
  });

  it('hashes secrets with a random salt and verifies them', async () => {
    const a = await hashSecret('correct horse', FAST);
    const b = await hashSecret('correct horse', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(await verifySecret('correct horse', a)).toBe(true);
    expect(await verifySecret('correct hors', a)).toBe(false);
    // Unicode normalization: é composed vs decomposed are the same secret.
    const c = await hashSecret('café', FAST);
    expect(await verifySecret('café', c)).toBe(true);
  });

  it('encrypts and decrypts with a fresh salt and IV each time', async () => {
    const one = await encrypt('secret note', 'pw', FAST);
    const two = await encrypt('secret note', 'pw', FAST);
    expect(one.iv).not.toBe(two.iv);
    expect(one.kdf.salt).not.toBe(two.kdf.salt);
    expect(one.data).not.toBe(two.data);
    expect(await decryptText(one, 'pw')).toBe('secret note');
    const bytes = new Uint8Array([0, 255, 7]);
    expect([...(await decrypt(await encrypt(bytes, 'pw', FAST), 'pw'))]).toEqual([0, 255, 7]);
  });

  it('rejects wrong passwords and tampered data', async () => {
    const payload = await encrypt('secret', 'pw', FAST);
    await expect(decrypt(payload, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
    const tampered = {
      ...payload,
      data: payload.data.slice(0, -4) + (payload.data.endsWith('AAAA') ? 'BBBB' : 'AAAA'),
    };
    await expect(decrypt(tampered, 'pw')).rejects.toBeInstanceOf(WrongPasswordError);
    await expect(decrypt({ ...payload, v: 2 }, 'pw')).rejects.toThrow(/Unsupported/);
  });
});
