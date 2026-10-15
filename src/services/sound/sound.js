// @ts-check
// Synthesized UI sounds (Web Audio, no audio files) with per-category volume.
// The AudioContext starts on first use after a user gesture (autoplay policies), and apps can
// route their own audio through a category bus so the user's volume settings apply to it.

/** @typedef {'ui' | 'notifications' | 'games' | 'media'} SoundCategory */
/** @typedef {'open' | 'close' | 'minimize' | 'notification' | 'error' | 'click' | 'achievement'} UiSound */

/**
 * A tone: oscillator `type` gliding from `freq` to `to` (Hz), starting at `at` seconds for
 * `dur` seconds, with a quick attack and exponential release. `gain` is relative loudness.
 * @typedef {{ type: OscillatorType, freq: number, to?: number, at: number, dur: number, gain: number }} Tone
 */

/** @type {Record<UiSound, Tone[]>} */
export const SOUNDS = {
  click: [{ type: 'triangle', freq: 1800, to: 1200, at: 0, dur: 0.035, gain: 0.25 }],
  open: [
    { type: 'sine', freq: 520, to: 780, at: 0, dur: 0.12, gain: 0.35 },
    { type: 'triangle', freq: 1040, at: 0.04, dur: 0.1, gain: 0.12 },
  ],
  close: [{ type: 'sine', freq: 700, to: 420, at: 0, dur: 0.12, gain: 0.3 }],
  minimize: [{ type: 'sine', freq: 600, to: 300, at: 0, dur: 0.16, gain: 0.25 }],
  notification: [
    { type: 'sine', freq: 880, at: 0, dur: 0.18, gain: 0.35 },
    { type: 'sine', freq: 1320, at: 0.09, dur: 0.22, gain: 0.3 },
  ],
  error: [
    { type: 'square', freq: 220, at: 0, dur: 0.12, gain: 0.18 },
    { type: 'square', freq: 165, at: 0.13, dur: 0.18, gain: 0.18 },
  ],
  achievement: [
    { type: 'triangle', freq: 523.25, at: 0, dur: 0.14, gain: 0.3 },
    { type: 'triangle', freq: 659.25, at: 0.1, dur: 0.14, gain: 0.3 },
    { type: 'triangle', freq: 783.99, at: 0.2, dur: 0.14, gain: 0.3 },
    { type: 'sine', freq: 1046.5, at: 0.3, dur: 0.45, gain: 0.35 },
  ],
};

const CATEGORY_SETTING = /** @type {Record<SoundCategory, string>} */ ({
  ui: 'soundUi',
  notifications: 'soundNotifications',
  games: 'soundGames',
  media: 'soundMedia',
});

/**
 * Effective volume (0–1) of a category from settings.
 * @param {(key: string) => unknown} get
 * @param {SoundCategory} category
 */
export function categoryVolume(get, category) {
  if (get('soundMuted')) return 0;
  return /** @type {number} */ (get('soundMaster')) * /** @type {number} */ (get(CATEGORY_SETTING[category]));
}

/**
 * @param {object} options
 * @param {import('../settings/settings.js').Settings} options.settings
 * @param {() => boolean} [options.quiet]  true while Do-not-disturb is on (UI sounds pause)
 * @param {typeof AudioContext} [options.AudioContextImpl]
 */
export function createSound({ settings, quiet = () => false, AudioContextImpl = globalThis.AudioContext }) {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {Map<SoundCategory, GainNode>} */
  const buses = new Map();
  const get = (/** @type {string} */ key) => settings.get('system', key);

  function context() {
    if (!AudioContextImpl) return null;
    if (!ctx) {
      ctx = new AudioContextImpl();
      for (const category of /** @type {SoundCategory[]} */ (Object.keys(CATEGORY_SETTING))) {
        const gain = ctx.createGain();
        gain.gain.value = categoryVolume(get, category);
        gain.connect(ctx.destination);
        buses.set(category, gain);
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function applyVolumes() {
    if (!ctx) return;
    for (const [category, gain] of buses)
      gain.gain.setTargetAtTime(categoryVolume(get, category), ctx.currentTime, 0.02);
  }
  settings.onChange('system', '*', (_v, key) => {
    if (key.startsWith('sound')) applyVolumes();
  });

  return {
    /**
     * @param {UiSound} name
     * @param {SoundCategory} [category]
     */
    play(name, category = 'ui') {
      const tones = SOUNDS[name];
      if (!tones || categoryVolume(get, category) === 0) return;
      if (category === 'ui' && quiet()) return;
      const audio = context();
      const bus = buses.get(category);
      if (!audio || !bus) return;
      const t0 = audio.currentTime + 0.005;
      for (const tone of tones) {
        const osc = audio.createOscillator();
        const env = audio.createGain();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.freq, t0 + tone.at);
        if (tone.to) osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.at + tone.dur);
        env.gain.setValueAtTime(0.0001, t0 + tone.at);
        env.gain.exponentialRampToValueAtTime(tone.gain, t0 + tone.at + 0.008);
        env.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.at + tone.dur);
        osc.connect(env);
        env.connect(bus);
        osc.start(t0 + tone.at);
        osc.stop(t0 + tone.at + tone.dur + 0.02);
      }
    },

    /**
     * Shared AudioContext and the output node of a category, for apps that make their own
     * sound (games, music player, synth). Null when Web Audio is unavailable.
     * @param {SoundCategory} category
     */
    output(category) {
      const audio = context();
      const bus = buses.get(category);
      return audio && bus ? { context: audio, destination: bus } : null;
    },

    get available() {
      return !!AudioContextImpl;
    },
  };
}

/** @typedef {ReturnType<typeof createSound>} Sound */
