import { describe, expect, it, vi } from 'vitest';
import { getPersistence, requestPersistence } from '../../src/services/storage/persist.js';

/** @param {{ persisted?: boolean, grant?: boolean, throws?: boolean }} options */
function fakeStorage({ persisted = false, grant = false, throws = false } = {}) {
  return /** @type {StorageManager} */ (
    /** @type {unknown} */ ({
      persisted: vi.fn(async () => {
        if (throws) throw new Error('denied');
        return persisted;
      }),
      persist: vi.fn(async () => grant),
    })
  );
}

describe('storage persistence', () => {
  it('reports unsupported without the StorageManager API', async () => {
    expect(await getPersistence(undefined)).toBe('unsupported');
    expect(await requestPersistence(undefined)).toBe('unsupported');
  });

  it('reports the current state without asking', async () => {
    const storage = fakeStorage({ persisted: false });
    expect(await getPersistence(storage)).toBe('best-effort');
    expect(storage.persist).not.toHaveBeenCalled();
  });

  it('asks only when not yet persistent', async () => {
    const already = fakeStorage({ persisted: true });
    expect(await requestPersistence(already)).toBe('persistent');
    expect(already.persist).not.toHaveBeenCalled();

    const granted = fakeStorage({ grant: true });
    expect(await requestPersistence(granted)).toBe('persistent');

    const refused = fakeStorage({ grant: false });
    expect(await requestPersistence(refused)).toBe('best-effort');
  });

  it('treats a throwing API as unsupported', async () => {
    expect(await requestPersistence(fakeStorage({ throws: true }))).toBe('unsupported');
  });
});
