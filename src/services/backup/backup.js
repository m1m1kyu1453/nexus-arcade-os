// @ts-check
// Backup and restore of a whole profile as one `.nexus-backup` file.
//
// Format (version 1): a zip containing
//   nexus-backup.json        manifest: format, versions, profile, record counts per store
//   stores/<store>.json      [[key, value], …] encoded with serialize.js
//   blobs/<n>                raw binary content (files, images) referenced from the JSON
// With a password, the zip bytes are encrypted (AES-GCM, PBKDF2 600k) and wrapped in a small
// JSON envelope; nothing but the format name is readable without the password.
//
// Restore modes: 'replace' (wipe the profile's stores, then load — atomic) or 'merge' (add and
// overwrite records; records that would clash, e.g. a different file at the same path, are
// skipped and counted). Stores unknown to this version are reported, not created. Migrations
// run on the next boot (the caller reloads), so old backups load into new versions.
import { decrypt, encrypt } from '../crypto.js';
import { decode, encode } from '../storage/serialize.js';

export const BACKUP_FORMAT = 'nexus-backup';
const ENCRYPTED_FORMAT = 'nexus-backup-encrypted';
const FORMAT_VERSION = 1;
const MANIFEST = 'nexus-backup.json';
/** Never exported: transient or device-specific. */
const SKIP_STORES = new Set(['quarantine']);

export class InvalidBackupError extends Error {
  name = 'InvalidBackupError';
}

/**
 * @typedef {object} BackupManifest
 * @property {typeof BACKUP_FORMAT} format
 * @property {number} formatVersion
 * @property {string} nexusVersion
 * @property {string} createdAt            ISO date
 * @property {{ name: string, username: string, accent: string }} profile
 * @property {Record<string, number>} stores   record count per store
 * @property {number} blobs
 * @property {number} bytes                   uncompressed size of all stores + blobs
 */

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.db   the profile database
 * @param {() => { name: string, username: string, accent: string }} options.profile
 * @param {string} options.nexusVersion
 * @param {{ iterations?: number }} [options.cryptoOptions]   lower only in tests
 * @param {() => Date} [options.now]
 */
export function createBackup({ db, profile, nexusVersion, cryptoOptions, now = () => new Date() }) {
  const fflate = () => import('fflate');

  /**
   * @param {{ password?: string, onProgress?: (done: number, total: number) => void }} [options]
   * @returns {Promise<{ blob: Blob, filename: string, manifest: BackupManifest }>}
   */
  async function exportBackup({ password, onProgress } = {}) {
    const { zipSync, strToU8 } = await fflate();
    /** @type {Record<string, Uint8Array>} */
    const files = {};
    /** @type {Record<string, number>} */
    const counts = {};
    let blobCount = 0;
    let bytes = 0;
    const put = (/** @type {Uint8Array} */ data) => {
      const ref = String(++blobCount);
      files[`blobs/${ref}`] = data;
      bytes += data.byteLength;
      return ref;
    };
    const stores = db.storeNames().filter((s) => !SKIP_STORES.has(s));
    for (const [i, store] of stores.entries()) {
      /** @type {[unknown, unknown][]} */
      const entries = [];
      await db.iterate(store, undefined, (value, _key, primaryKey) => void entries.push([primaryKey, value]));
      counts[store] = entries.length;
      const json = JSON.stringify(await encode(entries, { put }));
      bytes += json.length;
      files[`stores/${encodeURIComponent(store)}.json`] = strToU8(json);
      onProgress?.(i + 1, stores.length);
    }
    const p = profile();
    /** @type {BackupManifest} */
    const manifest = {
      format: BACKUP_FORMAT,
      formatVersion: FORMAT_VERSION,
      nexusVersion,
      createdAt: now().toISOString(),
      profile: { name: p.name, username: p.username, accent: p.accent },
      stores: counts,
      blobs: blobCount,
      bytes,
    };
    files[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));
    // Binary content (images, audio) is usually compressed already: store it as-is.
    const zipped = zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, data]) => [name, name.startsWith('blobs/') ? [data, { level: 0 }] : data]),
      ),
    );
    const date = manifest.createdAt.slice(0, 10);
    const filename = `nexus-${p.username}-${date}.nexus-backup`;
    if (!password)
      return { blob: new Blob([/** @type {BlobPart} */ (zipped)], { type: 'application/zip' }), filename, manifest };
    const payload = await encrypt(zipped, password, cryptoOptions);
    const envelope = JSON.stringify({ format: ENCRYPTED_FORMAT, formatVersion: FORMAT_VERSION, payload });
    return { blob: new Blob([envelope], { type: 'application/json' }), filename, manifest };
  }

  /**
   * Reads a backup file. Throws InvalidBackupError, or WrongPasswordError for a wrong password.
   * @param {Blob} file
   * @param {string} [password]
   */
  async function open(file, password) {
    const { unzipSync, strFromU8 } = await fflate();
    /** @type {Uint8Array} */
    let bytes = new Uint8Array(await file.arrayBuffer());
    let encrypted = false;
    if (bytes[0] === 0x7b /* { */) {
      /** @type {any} */
      let envelope;
      try {
        envelope = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new InvalidBackupError('This is not a Nexus backup file');
      }
      if (envelope?.format !== ENCRYPTED_FORMAT) throw new InvalidBackupError('This is not a Nexus backup file');
      encrypted = true;
      if (password === undefined) return { encrypted, needsPassword: true, manifest: null, files: null };
      bytes = await decrypt(envelope.payload, password);
    }
    /** @type {Record<string, Uint8Array>} */
    let files;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new InvalidBackupError('The backup file is damaged or not a Nexus backup');
    }
    if (!files[MANIFEST]) throw new InvalidBackupError('The backup has no manifest');
    /** @type {BackupManifest} */
    const manifest = JSON.parse(strFromU8(files[MANIFEST]));
    if (manifest.format !== BACKUP_FORMAT) throw new InvalidBackupError('This is not a Nexus backup file');
    if (manifest.formatVersion > FORMAT_VERSION) {
      throw new InvalidBackupError(
        `This backup was made by a newer Nexus (format ${manifest.formatVersion}); update Nexus first`,
      );
    }
    return { encrypted, needsPassword: false, manifest, files };
  }

  return {
    export: exportBackup,

    /**
     * What's inside, without changing anything (for the import preview).
     * @param {Blob} file
     * @param {string} [password]
     * @returns {Promise<{ encrypted: boolean, needsPassword: boolean, manifest: BackupManifest | null, unknownStores: string[] }>}
     */
    async inspect(file, password) {
      const { encrypted, needsPassword, manifest } = await open(file, password);
      const known = new Set(db.storeNames());
      return {
        encrypted,
        needsPassword,
        manifest,
        unknownStores: manifest ? Object.keys(manifest.stores).filter((s) => !known.has(s)) : [],
      };
    },

    /**
     * @param {Blob} file
     * @param {{ mode: 'replace' | 'merge', password?: string }} options
     * @returns {Promise<{ restored: Record<string, number>, skipped: number, unknownStores: string[] }>}
     */
    async restore(file, { mode, password }) {
      const { needsPassword, manifest, files } = await open(file, password);
      if (needsPassword || !manifest || !files)
        throw new InvalidBackupError('This backup is encrypted: enter its password');
      const { strFromU8 } = await fflate();
      const get = (/** @type {string} */ ref) => {
        const data = files[`blobs/${ref}`];
        if (!data) throw new InvalidBackupError(`The backup is missing binary content #${ref}`);
        return data;
      };
      const known = new Set(db.storeNames());
      const stores = Object.keys(manifest.stores).filter((s) => known.has(s) && !SKIP_STORES.has(s));
      /** @type {Map<string, [any, any][]>} */
      const data = new Map();
      for (const store of stores) {
        const raw = files[`stores/${encodeURIComponent(store)}.json`];
        if (!raw) throw new InvalidBackupError(`The backup is missing the data of "${store}"`);
        data.set(store, decode(JSON.parse(strFromU8(raw)), { get }));
      }

      /** @type {Record<string, number>} */
      const restored = {};
      let skipped = 0;
      if (mode === 'replace') {
        const targets = db.storeNames().filter((s) => !SKIP_STORES.has(s));
        await db.transaction(targets, 'readwrite', async (tx) => {
          for (const store of targets) await tx.clear(store);
          for (const [store, entries] of data) {
            const inline = db.keyPathOf(store) !== null;
            for (const [key, value] of entries) await tx.put(store, value, inline ? undefined : key);
            restored[store] = entries.length;
          }
        });
      } else {
        for (const [store, entries] of data) {
          restored[store] = 0;
          const inline = db.keyPathOf(store) !== null;
          for (const [key, value] of entries) {
            try {
              await db.put(store, value, inline ? undefined : key);
              restored[store]++;
            } catch (error) {
              if (/** @type {Error} */ (error)?.name !== 'ConstraintError') throw error;
              skipped++;
            }
          }
        }
      }
      return { restored, skipped, unknownStores: Object.keys(manifest.stores).filter((s) => !known.has(s)) };
    },
  };
}

/** @typedef {ReturnType<typeof createBackup>} Backup */
