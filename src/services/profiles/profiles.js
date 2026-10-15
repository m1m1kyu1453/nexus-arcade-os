// @ts-check
// Local user profiles. Each profile has its own IndexedDB database (all its data, files and
// settings); the profile list itself lives in the shared 'nexus-system' database.
// A profile PIN/password is a privacy lock against people sharing the device, not encryption:
// the data is still readable with browser developer tools. The UI must say so.
import { hashSecret, verifySecret } from '../crypto.js';

export const PROFILES_STORE_SCHEMA = { profiles: { keyPath: 'id' } };
const STORE = 'profiles';

/**
 * @typedef {object} Profile
 * @property {string} id
 * @property {string} name
 * @property {string} username   folder name for /home/<username>; fixed at creation
 * @property {string} accent     hex color
 * @property {{ kind: 'identicon', seed: string } | { kind: 'image', image: Blob }} avatar
 * @property {number} createdAt
 * @property {number} lastUsedAt
 * @property {boolean} [guest]   wiped on sign-out
 * @property {{ kind: 'pin' | 'password', hash: import('../crypto.js').SecretHash }} [lock]
 */

/** Profile data safe to show on the lock screen (no hashes). */
/** @typedef {Omit<Profile, 'lock'> & { locked: false | 'pin' | 'password' }} PublicProfile */

/** @param {string} id */
export const profileDbName = (id) => `nexus-profile-${id}`;

/**
 * "Ada Lovelace" → "ada-lovelace"; "Jürgen" → "jurgen"; non-Latin names → "user".
 * @param {string} name
 */
export function slugify(name) {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || 'user';
}

/** @param {Profile} p @returns {PublicProfile} */
function toPublic({ lock, ...rest }) {
  return { ...rest, locked: lock ? lock.kind : false };
}

/**
 * @param {object} options
 * @param {import('../storage/types.js').Database} options.systemDb
 * @param {import('../storage/types.js').Engine} options.engine      to delete a profile's database
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {() => number} [options.now]
 * @param {() => string} [options.newId]
 * @param {{ iterations?: number }} [options.hashOptions]          lower only in tests
 */
export function createProfiles({
  systemDb,
  engine,
  bus,
  now = Date.now,
  newId = () => crypto.randomUUID(),
  hashOptions,
}) {
  /** @param {string} id @returns {Promise<Profile>} */
  async function require(id) {
    const profile = await systemDb.get(STORE, id);
    if (!profile) throw new Error(`No profile "${id}"`);
    return profile;
  }

  /** @param {string} name */
  function validName(name) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new Error('Profile name must not be empty');
    if (trimmed.length > 64) throw new Error('Profile name must be at most 64 characters');
    return trimmed;
  }

  /** @param {string} color */
  function validColor(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Accent color must be a hex color like #3ef0ff');
    return color.toLowerCase();
  }

  return {
    /** @returns {Promise<PublicProfile[]>} most recently used first */
    async list() {
      const all = /** @type {Profile[]} */ (await systemDb.getAll(STORE));
      return all.sort((a, b) => b.lastUsedAt - a.lastUsedAt).map(toPublic);
    },

    /** @param {string} id @returns {Promise<PublicProfile | undefined>} */
    async get(id) {
      const p = await systemDb.get(STORE, id);
      return p && toPublic(p);
    },

    /**
     * @param {{ name: string, accent?: string, guest?: boolean, image?: Blob }} input
     * @returns {Promise<PublicProfile>}
     */
    async create({ name, accent = '#3ef0ff', guest = false, image }) {
      const cleanName = validName(name);
      const id = newId();
      const profile = await systemDb.transaction(STORE, 'readwrite', async (tx) => {
        const taken = new Set(/** @type {Profile[]} */ (await tx.getAll(STORE)).map((p) => p.username));
        const base = guest ? 'guest' : slugify(cleanName);
        let username = base;
        for (let i = 2; taken.has(username); i++) username = `${base}-${i}`;
        const t = now();
        /** @type {Profile} */
        const profile = {
          id,
          name: cleanName,
          username,
          accent: validColor(accent),
          avatar: image ? { kind: 'image', image } : { kind: 'identicon', seed: id },
          createdAt: t,
          lastUsedAt: t,
          ...(guest ? { guest: true } : {}),
        };
        await tx.put(STORE, profile);
        return profile;
      });
      bus.emit('profile:created', { id });
      return toPublic(profile);
    },

    /**
     * @param {string} id
     * @param {{ name?: string, accent?: string, image?: Blob | null }} patch  image null = back to identicon
     */
    async update(id, { name, accent, image }) {
      const profile = await require(id);
      /** @type {Profile} */
      const updated = {
        ...profile,
        ...(name !== undefined ? { name: validName(name) } : {}),
        ...(accent !== undefined ? { accent: validColor(accent) } : {}),
        ...(image === null
          ? { avatar: { kind: 'identicon', seed: profile.id } }
          : image
            ? { avatar: { kind: 'image', image } }
            : {}),
      };
      await systemDb.put(STORE, updated);
      bus.emit('profile:updated', { id });
      return toPublic(updated);
    },

    /** Deletes a profile and its whole database (files, settings, app data). */
    async remove(/** @type {string} */ id) {
      await require(id);
      await systemDb.delete(STORE, id);
      await engine.deleteDatabase(profileDbName(id));
      bus.emit('profile:removed', { id });
    },

    /** @param {string} id */
    async touch(id) {
      const profile = await require(id);
      await systemDb.put(STORE, { ...profile, lastUsedAt: now() });
    },

    /**
     * Sets or replaces the PIN/password lock. Changing an existing lock needs the current secret.
     * @param {string} id
     * @param {{ kind: 'pin' | 'password', secret: string, current?: string }} lock
     */
    async setLock(id, { kind, secret, current }) {
      const profile = await require(id);
      if (profile.lock && !(current !== undefined && (await verifySecret(current, profile.lock.hash)))) {
        throw new Error('The current PIN or password is wrong');
      }
      if (kind === 'pin' && !/^\d{4,12}$/.test(secret)) throw new Error('A PIN has 4 to 12 digits');
      if (kind === 'password' && secret.length < 4) throw new Error('A password needs at least 4 characters');
      const hash = await hashSecret(secret, hashOptions);
      await systemDb.put(STORE, { ...profile, lock: { kind, hash } });
      bus.emit('profile:updated', { id });
    },

    /** @param {string} id @param {string} current */
    async clearLock(id, current) {
      const profile = await require(id);
      if (!profile.lock) return;
      if (!(await verifySecret(current, profile.lock.hash))) throw new Error('The current PIN or password is wrong');
      const { lock: _lock, ...rest } = profile;
      await systemDb.put(STORE, rest);
      bus.emit('profile:updated', { id });
    },

    /**
     * @param {string} id
     * @param {string} secret
     * @returns {Promise<boolean>} true if unlocked (always true without a lock)
     */
    async unlock(id, secret) {
      const profile = await require(id);
      return profile.lock ? verifySecret(secret, profile.lock.hash) : true;
    },
  };
}

/** @typedef {ReturnType<typeof createProfiles>} Profiles */
