import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { identiconGrid, identiconSvg } from '../../src/services/profiles/identicon.js';
import { createProfiles, profileDbName, PROFILES_STORE_SCHEMA, slugify } from '../../src/services/profiles/profiles.js';
import { createIdbEngine } from '../../src/services/storage/engine-idb.js';

async function setup() {
  const engine = createIdbEngine();
  const systemDb = await engine.open('nexus-system', PROFILES_STORE_SCHEMA);
  const bus = createEventBus();
  let t = 0;
  let n = 0;
  const profiles = createProfiles({
    systemDb,
    engine,
    bus,
    now: () => ++t,
    newId: () => `p${++n}`,
    hashOptions: { iterations: 1000 },
  });
  return { engine, profiles, bus };
}

describe('profiles', () => {
  it('slugifies names for home folders', () => {
    expect(slugify('Ada Lovelace')).toBe('ada-lovelace');
    expect(slugify('Jürgen Groß')).toBe('jurgen-gross');
    expect(slugify('  --Zoë!! ')).toBe('zoe');
    expect(slugify('山田')).toBe('user');
  });

  it('creates profiles with unique usernames and lists most recent first', async () => {
    const { profiles } = await setup();
    const a = await profiles.create({ name: ' Ada ', accent: '#FF00AA' });
    const b = await profiles.create({ name: 'ada' });
    expect(a).toMatchObject({ id: 'p1', name: 'Ada', username: 'ada', accent: '#ff00aa', locked: false });
    expect(a.avatar).toEqual({ kind: 'identicon', seed: 'p1' });
    expect(b.username).toBe('ada-2');
    await profiles.touch('p1');
    expect((await profiles.list()).map((p) => p.id)).toEqual(['p1', 'p2']);
    await expect(profiles.create({ name: '   ' })).rejects.toThrow(/empty/);
    await expect(profiles.create({ name: 'x', accent: 'red' })).rejects.toThrow(/hex/);
  });

  it('updates name, accent and avatar but never the username', async () => {
    const { profiles } = await setup();
    await profiles.create({ name: 'Ada' });
    const image = new Blob(['img'], { type: 'image/png' });
    const updated = await profiles.update('p1', { name: 'Countess', accent: '#123456', image });
    expect(updated).toMatchObject({ name: 'Countess', username: 'ada', accent: '#123456' });
    expect(updated.avatar.kind).toBe('image');
    expect((await profiles.update('p1', { image: null })).avatar).toEqual({ kind: 'identicon', seed: 'p1' });
  });

  it('locks with a PIN, never exposes the hash, and verifies', async () => {
    const { profiles } = await setup();
    await profiles.create({ name: 'Ada' });
    await expect(profiles.setLock('p1', { kind: 'pin', secret: '12a4' })).rejects.toThrow(/digits/);
    await profiles.setLock('p1', { kind: 'pin', secret: '2468' });
    const listed = (await profiles.list())[0];
    expect(listed.locked).toBe('pin');
    expect(JSON.stringify(listed)).not.toContain('hash');
    expect(await profiles.unlock('p1', '2468')).toBe(true);
    expect(await profiles.unlock('p1', '0000')).toBe(false);

    await expect(profiles.setLock('p1', { kind: 'password', secret: 'longer' })).rejects.toThrow(/current/);
    await profiles.setLock('p1', { kind: 'password', secret: 'longer', current: '2468' });
    expect(await profiles.unlock('p1', 'longer')).toBe(true);
    await expect(profiles.clearLock('p1', 'wrong')).rejects.toThrow(/wrong/);
    await profiles.clearLock('p1', 'longer');
    expect((await profiles.get('p1')).locked).toBe(false);
    expect(await profiles.unlock('p1', 'anything')).toBe(true);
  });

  it('removing a profile deletes its database', async () => {
    const { profiles, engine, bus } = await setup();
    await profiles.create({ name: 'Ada' });
    const db = await engine.open(profileDbName('p1'), { kv: {} });
    await db.put('kv', 1, 'x');
    db.close();
    const removed = vi.fn();
    bus.on('profile:removed', removed);
    await profiles.remove('p1');
    expect(await profiles.list()).toEqual([]);
    expect(await engine.databases()).not.toContain('nexus-profile-p1');
    expect(removed).toHaveBeenCalledWith({ id: 'p1' }, 'profile:removed');
    await expect(profiles.remove('p1')).rejects.toThrow(/No profile/);
  });

  it('guest profiles are marked and get the guest username', async () => {
    const { profiles } = await setup();
    expect(await profiles.create({ name: 'Gast', guest: true })).toMatchObject({ guest: true, username: 'guest' });
  });
});

describe('identicons', () => {
  it('are deterministic, symmetric and never empty', () => {
    const grid = identiconGrid('p1');
    expect(identiconGrid('p1')).toEqual(grid);
    expect(identiconGrid('p2')).not.toEqual(grid);
    for (const seed of ['a', 'b', 'c', '', 'xyz']) {
      const g = identiconGrid(seed);
      for (const row of g) expect(row).toEqual([...row].reverse());
      expect(g.flat().some(Boolean)).toBe(true);
    }
  });

  it('renders SVG and refuses non-hex colors', () => {
    const svg = identiconSvg('p1', '#ff0000');
    expect(svg).toMatch(/^<svg/);
    expect(svg).toContain('fill="#ff0000"');
    expect(identiconSvg('p1', 'red"><script>')).not.toContain('script');
  });
});
