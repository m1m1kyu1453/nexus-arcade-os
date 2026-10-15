import { describe, expect, it } from 'vitest';
import { selectEngine } from '../../src/services/storage/select.js';
import { FakeStorage } from '../helpers/fake-storage.js';

const brokenIdb = {
  open() {
    const error = new Error('The operation is insecure.');
    error.name = 'SecurityError';
    throw error;
  },
};

const throwingStorage = {
  setItem() {
    throw Object.assign(new Error('denied'), { name: 'SecurityError' });
  },
};

describe('engine selection', () => {
  it('uses IndexedDB when it works, and removes the probe database', async () => {
    const result = await selectEngine();
    expect(result.engine.kind).toBe('indexeddb');
    expect(result.warning).toBeNull();
    const names = (await indexedDB.databases()).map((d) => d.name);
    expect(names).not.toContain('nexus-probe');
  });

  it('falls back to localStorage with a warning', async () => {
    const result = await selectEngine({ indexedDB: brokenIdb, localStorage: new FakeStorage() });
    expect(result.engine.kind).toBe('localstorage');
    expect(result.warning).toBe('localstorage');
    expect(result.reasons[0]).toMatch(/SecurityError/);
  });

  it('falls back to memory as a last resort', async () => {
    const result = await selectEngine({ indexedDB: brokenIdb, localStorage: throwingStorage });
    expect(result.engine.kind).toBe('memory');
    expect(result.warning).toBe('memory');
    expect(result.reasons).toHaveLength(2);
  });
});
