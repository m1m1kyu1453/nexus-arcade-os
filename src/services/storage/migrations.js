// @ts-check
// Data migrations per scope (an app id, or 'system:<service>').
//
// - The data version of each scope lives in the 'meta' store ({ id: 'schema:<scope>', version }).
// - Each migration runs in its own transaction together with the version update, so a failing
//   migration rolls back completely: old data stays intact, the version stays at the last
//   successful step, and the failure is reported. Data is never wiped.
// - If stored data is newer than the code (an old tab or an old Lite file), nothing runs and
//   the result says 'newer'; callers must not write to that scope.

export const META_STORE_SCHEMA = { meta: { keyPath: 'id' } };

/**
 * @typedef {object} Migration
 * @property {number} to   version this step produces
 * @property {(tx: import('./types.js').StoreOps) => Promise<void>} run  use only `tx` (no other async work)
 * @property {string} [description]
 */

/**
 * @typedef {object} MigrationResult
 * @property {string} scope
 * @property {'ok' | 'newer' | 'failed'} status
 * @property {number} from
 * @property {number} version   version after running (equals target on success)
 * @property {number} target
 * @property {unknown} [error]
 */

/** @param {string} scope */
const metaId = (scope) => `schema:${scope}`;

/**
 * @param {import('./types.js').Database} db
 * @param {string} scope
 * @returns {Promise<number>} 0 if never versioned
 */
export async function getDataVersion(db, scope) {
  const record = await db.get('meta', metaId(scope));
  return record?.version ?? 0;
}

/**
 * @param {object} options
 * @param {import('./types.js').Database} options.db
 * @param {string} options.scope
 * @param {number} options.target       version the code expects
 * @param {Migration[]} [options.migrations]
 * @param {string[]} options.stores      stores the migrations may touch
 * @param {(progress: { scope: string, step: number, total: number, to: number, description?: string }) => void} [options.onProgress]
 * @returns {Promise<MigrationResult>}
 */
export async function runMigrations({ db, scope, target, migrations = [], stores, onProgress }) {
  validateMigrations(migrations, target);
  const from = await getDataVersion(db, scope);
  if (from > target) return { scope, status: 'newer', from, version: from, target };
  if (from === target) return { scope, status: 'ok', from, version: from, target };

  const pending = migrations.filter((m) => m.to > from && m.to <= target).sort((a, b) => a.to - b.to);
  let version = from;
  for (const [i, migration] of pending.entries()) {
    onProgress?.({ scope, step: i + 1, total: pending.length, to: migration.to, description: migration.description });
    try {
      await db.transaction([...new Set([...stores, 'meta'])], 'readwrite', async (tx) => {
        await migration.run(tx);
        await tx.put('meta', { id: metaId(scope), version: migration.to });
      });
      version = migration.to;
    } catch (error) {
      return { scope, status: 'failed', from, version, target, error };
    }
  }
  if (version !== target) {
    // No migration step leads to the target (e.g. a version bump without data changes).
    await db.put('meta', { id: metaId(scope), version: target });
    version = target;
  }
  return { scope, status: 'ok', from, version, target };
}

/**
 * @param {Migration[]} migrations
 * @param {number} target
 */
function validateMigrations(migrations, target) {
  if (!Number.isInteger(target) || target < 0) throw new Error(`Invalid schema version ${target}`);
  const seen = new Set();
  for (const m of migrations) {
    if (!Number.isInteger(m.to) || m.to < 1) throw new Error(`Migration has invalid "to": ${m.to}`);
    if (m.to > target) throw new Error(`Migration to ${m.to} is beyond the declared version ${target}`);
    if (seen.has(m.to)) throw new Error(`Two migrations produce version ${m.to}`);
    if (typeof m.run !== 'function') throw new Error(`Migration to ${m.to} has no run()`);
    seen.add(m.to);
  }
}
