// In-memory implementation of the Web Storage API (localStorage) with an optional quota.
export class FakeStorage {
  /** @param {{ quotaBytes?: number }} [options] */
  constructor({ quotaBytes = Infinity } = {}) {
    this.map = new Map();
    this.quotaBytes = quotaBytes;
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    const value = String(v);
    let size = 0;
    for (const [key, val] of this.map) if (key !== k) size += key.length + val.length;
    if (size + k.length + value.length > this.quotaBytes) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(k, value);
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
