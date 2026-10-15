// @ts-check
// Asks the browser to keep our data (exempt from eviction, e.g. Safari's 7-day cap).
// Call on first meaningful use, never on page load: browsers may ignore or penalise early prompts.

/** @typedef {'persistent' | 'best-effort' | 'unsupported'} PersistenceState */

/**
 * @param {StorageManager | undefined} [storage]
 * @returns {Promise<PersistenceState>}
 */
export async function getPersistence(storage = globalThis.navigator?.storage) {
  if (!storage?.persisted) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

/**
 * @param {StorageManager | undefined} [storage]
 * @returns {Promise<PersistenceState>}
 */
export async function requestPersistence(storage = globalThis.navigator?.storage) {
  const current = await getPersistence(storage);
  if (current !== 'best-effort' || !storage?.persist) return current;
  try {
    return (await storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'best-effort';
  }
}
