// @ts-check
// Shortcut manager: keyboard bindings for commands (with user rebinding) and direct shortcuts
// registered by apps. Resolution order for a key press:
//   1. shortcuts of the focused app, 2. command bindings (if the command is available),
//   3. global shortcuts.
// Inside text fields only combos with Ctrl/Alt/Meta fire, unless a shortcut opts in.
import { comboFromEvent, isApplePlatform, parseShortcut } from './keys.js';

const CHORD_TIMEOUT_MS = 1500;

/**
 * @typedef {object} DirectShortcut
 * @property {string[]} combos
 * @property {(event: KeyboardEvent) => void} handler
 * @property {string} scope          'global' or an app instance id
 * @property {boolean} allowInInputs
 */

/** @param {EventTarget | null} target */
export function isEditable(target) {
  let el = /** @type {HTMLElement | null} */ (target);
  // Events from inside a shadow root (the code editor) are retargeted to its host: look at
  // what has focus inside it.
  while (el?.shadowRoot?.activeElement) el = /** @type {HTMLElement} */ (el.shadowRoot.activeElement);
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = /** @type {HTMLInputElement} */ (el).type;
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
}

/**
 * @param {object} options
 * @param {import('./commands.js').Commands} options.commands
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store user bindings
 * @param {() => string | null} options.activeScope   focused app instance id
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {boolean} [options.apple]
 * @param {() => number} [options.now]
 */
export function createShortcuts({ commands, log, store, activeScope, bus, apple = isApplePlatform(), now = Date.now }) {
  /** @type {Map<string, string>} command id → default shortcut */
  const defaults = new Map();
  /** @type {Map<string, string>} command id → user shortcut ('' = unbound) */
  let overrides = new Map();
  /** @type {Set<DirectShortcut>} */
  const direct = new Set();
  /** @type {{ first: string, until: number } | null} */
  let pendingChord = null;
  /** Off while the screen is locked. */
  let enabled = true;

  /** @param {string} shortcut */
  const parse = (shortcut) => parseShortcut(shortcut, { apple });
  const key = (/** @type {string[]} */ combos) => combos.join(' ');

  /** @param {string} commandId @returns {string[] | null} */
  function bindingOf(commandId) {
    const user = overrides.get(commandId);
    if (user === '') return null;
    const shortcut = user ?? defaults.get(commandId);
    if (!shortcut) return null;
    try {
      return parse(shortcut);
    } catch {
      return null;
    }
  }

  async function save() {
    await store.set('bindings', Object.fromEntries(overrides));
    bus.emit('shortcuts:changed', {});
  }

  /**
   * @param {string} combo
   * @param {boolean} chordStart
   */
  function candidates(combo, chordStart) {
    const scope = activeScope();
    /** @type {{ kind: 'direct', s: DirectShortcut }[]} */
    const app = [];
    /** @type {{ kind: 'direct', s: DirectShortcut }[]} */
    const global = [];
    for (const s of direct) {
      if (key(s.combos) !== combo && !(chordStart && s.combos.length === 2 && s.combos[0] === combo)) continue;
      if (s.scope === 'global') global.push({ kind: 'direct', s });
      else if (s.scope === scope) app.push({ kind: 'direct', s });
    }
    /** @type {{ kind: 'command', id: string, combos: string[] }[]} */
    const cmds = [];
    for (const id of new Set([...defaults.keys(), ...overrides.keys()])) {
      const combos = bindingOf(id);
      if (!combos) continue;
      if (key(combos) === combo || (chordStart && combos.length === 2 && combos[0] === combo)) {
        if (commands.isAvailable(id)) cmds.push({ kind: 'command', id, combos });
      }
    }
    return [...app, ...cmds, ...global];
  }

  /**
   * Handles a keydown. Returns true if a shortcut ran (the event is then prevented).
   * @param {KeyboardEvent} event
   */
  function handle(event) {
    if (!enabled || event.isComposing || event.repeat) return false;
    const combo = comboFromEvent(event);
    if (!combo) return false;
    const inInput = isEditable(event.target);
    // Combos with Ctrl/Alt/Meta and function keys (F1 = help) can't be typing, so they work in text fields too.
    const strong = /(^|\+)(Ctrl|Alt|Meta)\+/.test(combo) || /^(Shift\+)?F\d{1,2}$/.test(combo);

    /** @type {string} */
    let full = combo;
    let chordStart = true;
    if (pendingChord && now() <= pendingChord.until) {
      full = `${pendingChord.first} ${combo}`;
      chordStart = false;
    }
    pendingChord = null;

    const allowed = (/** @type {boolean} */ allowInInputs) => !inInput || allowInInputs || strong;
    const matches = candidates(full, chordStart).filter((m) =>
      allowed(m.kind === 'direct' ? m.s.allowInInputs : false),
    );
    const exact = matches.find((m) => (m.kind === 'direct' ? key(m.s.combos) : key(m.combos)) === full);
    if (exact) {
      event.preventDefault();
      if (exact.kind === 'direct') exact.s.handler(event);
      else commands.execute(exact.id).catch((error) => log.warn(`Shortcut ${full} failed`, error));
      return true;
    }
    if (chordStart && matches.length) {
      // First step of a chord: wait for the second.
      event.preventDefault();
      pendingChord = { first: combo, until: now() + CHORD_TIMEOUT_MS };
      return true;
    }
    return false;
  }

  return {
    /** Loads user bindings. */
    async load() {
      const saved = await store.get('bindings');
      overrides = new Map(
        saved && typeof saved === 'object' ? Object.entries(/** @type {Record<string, string>} */ (saved)) : [],
      );
    },

    /**
     * Declares a command's default binding (from its manifest or system command).
     * @param {string} commandId
     * @param {string} shortcut
     */
    setDefault(commandId, shortcut) {
      parse(shortcut);
      defaults.set(commandId, shortcut);
    },

    /** Current binding of a command, normalized ('Ctrl+K Ctrl+T'), or null. */
    bindingFor: (/** @type {string} */ commandId) => bindingOf(commandId)?.join(' ') ?? null,

    /**
     * Rebinds a command (null = no shortcut). Returns commands now sharing the binding.
     * @param {string} commandId
     * @param {string | null} shortcut
     * @returns {Promise<string[]>} conflicting command ids
     */
    async rebind(commandId, shortcut) {
      if (shortcut !== null) parse(shortcut);
      overrides.set(commandId, shortcut ?? '');
      await save();
      if (shortcut === null) return [];
      const target = key(parse(shortcut));
      return [...new Set([...defaults.keys(), ...overrides.keys()])].filter(
        (id) => id !== commandId && bindingOf(id)?.join(' ') === target,
      );
    },

    /** @param {string} commandId */
    async resetBinding(commandId) {
      overrides.delete(commandId);
      await save();
    },

    async resetAll() {
      overrides = new Map();
      await save();
    },

    /**
     * Groups of bindings that collide (same shortcut, overlapping scope).
     * @returns {{ shortcut: string, ids: string[] }[]}
     */
    conflicts() {
      /** @type {Map<string, string[]>} */
      const byShortcut = new Map();
      for (const id of new Set([...defaults.keys(), ...overrides.keys()])) {
        const combos = bindingOf(id);
        if (!combos) continue;
        const k = key(combos);
        byShortcut.set(k, [...(byShortcut.get(k) ?? []), id]);
      }
      // A chord's first step also collides with a single shortcut on the same combo.
      for (const [k, ids] of byShortcut) {
        if (k.includes(' ')) continue;
        for (const [other, otherIds] of byShortcut) {
          if (other.startsWith(`${k} `)) byShortcut.set(k, [...ids, ...otherIds.filter((id) => !ids.includes(id))]);
        }
      }
      return [...byShortcut].filter(([, ids]) => ids.length > 1).map(([shortcut, ids]) => ({ shortcut, ids }));
    },

    /**
     * Registers a direct shortcut (ctx.shortcuts.register for apps, scope = instance id).
     * @param {string} shortcut
     * @param {(event: KeyboardEvent) => void} handler
     * @param {{ scope?: string, allowInInputs?: boolean }} [options]
     */
    register(shortcut, handler, { scope = 'global', allowInInputs = false } = {}) {
      /** @type {DirectShortcut} */
      const entry = { combos: parse(shortcut), handler, scope, allowInInputs };
      direct.add(entry);
      return () => direct.delete(entry);
    },

    handle,

    /** Turns all shortcuts off (lock screen) or back on. @param {boolean} on */
    setEnabled(on) {
      enabled = on;
      pendingChord = null;
    },

    /** Listens for key presses on `target` (capture phase, before apps see them). */
    attach(/** @type {EventTarget} */ target) {
      const listener = (/** @type {Event} */ e) => handle(/** @type {KeyboardEvent} */ (e));
      target.addEventListener('keydown', listener, { capture: true });
      return () => target.removeEventListener('keydown', listener, { capture: true });
    },
  };
}

/** @typedef {ReturnType<typeof createShortcuts>} Shortcuts */
