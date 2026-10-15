// Guards the test environment the storage and VFS tests (phase 1) rely on.
import { describe, expect, it } from 'vitest';

/** @param {IDBRequest} request */
const done = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

async function openDb() {
  const request = indexedDB.open('probe', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('items');
  return /** @type {Promise<IDBDatabase>} */ (done(request));
}

describe('unit test environment', () => {
  it('stores and reads back Blobs in IndexedDB', async () => {
    const db = await openDb();
    const blob = new Blob(['hello nexus'], { type: 'text/plain' });
    await done(db.transaction('items', 'readwrite').objectStore('items').put(blob, 'greeting'));
    const read = await done(db.transaction('items').objectStore('items').get('greeting'));
    expect(read.type).toBe('text/plain');
    expect(await read.text()).toBe('hello nexus');
    db.close();
  });

  it('starts every test with an empty IndexedDB', async () => {
    const db = await openDb();
    const keys = await done(db.transaction('items').objectStore('items').getAllKeys());
    expect(keys).toEqual([]);
    db.close();
  });
});
