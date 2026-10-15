// @ts-check
// Corrupt-data quarantine: records that fail validation are moved here (never silently
// dropped) and listed in Settings → Storage, where the user can inspect, export or delete them.

export const QUARANTINE_STORE_SCHEMA = {
  quarantine: { keyPath: 'id', autoIncrement: true, indexes: { store: { keyPath: 'store' } } },
};

/**
 * @typedef {object} QuarantinedRecord
 * @property {number} id
 * @property {string} store     where the record came from
 * @property {unknown} key      its primary key there (if it had one)
 * @property {unknown} value    the record as found
 * @property {string} reason
 * @property {number} at        timestamp
 */

/**
 * Moves a record into quarantine (removing it from its store) in one transaction.
 * @param {import('./types.js').Database} db
 * @param {{ store: string, key: import('./keys.js').Key | undefined, value: unknown, reason: string, now?: number }} record
 */
export async function quarantineRecord(db, { store, key, value, reason, now = Date.now() }) {
  const stores = key === undefined ? ['quarantine'] : ['quarantine', store];
  await db.transaction(stores, 'readwrite', async (tx) => {
    await tx.put('quarantine', { store, key, value, reason, at: now });
    if (key !== undefined) await tx.delete(store, key);
  });
}

/**
 * @param {import('./types.js').Database} db
 * @returns {Promise<QuarantinedRecord[]>}
 */
export function listQuarantine(db) {
  return db.getAll('quarantine');
}

/**
 * Puts a quarantined record back (e.g. after the user fixed it via export/import) and removes
 * it from quarantine.
 * @param {import('./types.js').Database} db
 * @param {number} id
 * @param {unknown} [replacement] value to restore instead of the original
 */
export async function restoreQuarantined(db, id, replacement) {
  const record = /** @type {QuarantinedRecord | undefined} */ (await db.get('quarantine', id));
  if (!record) return;
  await db.transaction(['quarantine', record.store], 'readwrite', async (tx) => {
    await tx.put(record.store, replacement ?? record.value);
    await tx.delete('quarantine', id);
  });
}

/** @param {import('./types.js').Database} db @param {number} id */
export function deleteQuarantined(db, id) {
  return db.delete('quarantine', id);
}
