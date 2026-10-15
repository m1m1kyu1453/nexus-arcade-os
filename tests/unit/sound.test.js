import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { createSettings, SETTINGS_STORE_SCHEMA } from '../../src/services/settings/settings.js';
import { SYSTEM_SETTINGS } from '../../src/services/settings/system-settings.js';
import { categoryVolume, createSound, SOUNDS } from '../../src/services/sound/sound.js';
import { createMemoryEngine } from '../../src/services/storage/engine-memory.js';

/** Records what a sound would do on a real AudioContext. */
class FakeAudioContext {
  static instances = 0;
  constructor() {
    FakeAudioContext.instances++;
    this.state = 'suspended';
    this.currentTime = 1;
    this.destination = { name: 'destination' };
    this.oscillators = [];
    this.resumed = 0;
  }
  resume() {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    const param = () => ({
      value: 1,
      setValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime(v) {
        this.value = v;
      },
    });
    return {
      gain: param(),
      connect(target) {
        this.target = target;
      },
    };
  }
  createOscillator() {
    const osc = {
      type: 'sine',
      frequency: {
        setValueAtTime(v) {
          osc.freq = v;
        },
        exponentialRampToValueAtTime() {},
      },
      connect() {},
      start(t) {
        osc.startAt = t;
      },
      stop() {},
    };
    this.oscillators.push(osc);
    return osc;
  }
}

async function setup({ quiet = false } = {}) {
  const db = await createMemoryEngine().open('p', SETTINGS_STORE_SCHEMA);
  const settings = createSettings({ db, bus: createEventBus(), log: createLogger().child('s') });
  settings.register('system', SYSTEM_SETTINGS);
  await settings.load();
  let audio;
  const sound = createSound({
    settings,
    quiet: () => quiet,
    AudioContextImpl: class extends FakeAudioContext {
      constructor() {
        super();
        audio = this;
      }
    },
  });
  return { settings, sound, audio: () => audio };
}

describe('sound', () => {
  it('defines every UI sound from the brief', () => {
    expect(Object.keys(SOUNDS).sort()).toEqual([
      'achievement',
      'click',
      'close',
      'error',
      'minimize',
      'notification',
      'open',
    ]);
  });

  it('computes category volumes from master, category and mute', async () => {
    const { settings } = await setup();
    const get = (k) => settings.get('system', k);
    expect(categoryVolume(get, 'ui')).toBeCloseTo(0.6 * 0.7);
    await settings.set('system', 'soundMuted', true);
    expect(categoryVolume(get, 'media')).toBe(0);
  });

  it('creates the AudioContext lazily and plays tones', async () => {
    const { sound, audio } = await setup();
    expect(audio()).toBeUndefined();
    sound.play('achievement');
    expect(audio().oscillators).toHaveLength(4);
    expect(audio().resumed).toBe(1);
    expect(audio().oscillators[0].freq).toBeCloseTo(523.25);
  });

  it('stays silent when muted, at zero volume, or for UI sounds in quiet mode', async () => {
    const muted = await setup();
    await muted.settings.set('system', 'soundMuted', true);
    muted.sound.play('click');
    expect(muted.audio()).toBeUndefined();

    const quiet = await setup({ quiet: true });
    quiet.sound.play('click');
    expect(quiet.audio()).toBeUndefined();
    quiet.sound.play('notification', 'notifications');
    expect(quiet.audio().oscillators).toHaveLength(2);
  });

  it('updates bus volumes live and offers outputs to apps', async () => {
    const { sound, settings } = await setup();
    const out = sound.output('games');
    expect(out.destination.gain.value).toBeCloseTo(0.6 * 0.8);
    await settings.set('system', 'soundGames', 0.5);
    expect(out.destination.gain.value).toBeCloseTo(0.3);
  });

  it('is a no-op without Web Audio', async () => {
    const db = await createMemoryEngine().open('p', SETTINGS_STORE_SCHEMA);
    const settings = createSettings({ db, bus: createEventBus(), log: createLogger().child('s') });
    settings.register('system', SYSTEM_SETTINGS);
    const sound = createSound({ settings, AudioContextImpl: null });
    expect(() => sound.play('click')).not.toThrow();
    expect(sound.output('ui')).toBeNull();
    expect(sound.available).toBe(false);
  });
});
