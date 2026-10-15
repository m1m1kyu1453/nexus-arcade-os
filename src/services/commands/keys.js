// @ts-check
// Keyboard shortcut notation.
// - Declared as 'Mod+Alt+N' (Mod = Cmd on Apple platforms, Ctrl elsewhere), case-insensitive.
// - Normalized to 'Ctrl+Alt+Shift+Meta+Key' order, e.g. 'Ctrl+Alt+N', 'Meta+K', 'Shift+F5'.
// - A chord is two combos separated by a space: 'Ctrl+K Ctrl+T'.
// - Letters follow the active keyboard layout (event.key), so QWERTZ users press the Z they see;
//   when a modifier produces a symbol instead (macOS Alt+N → '˜'), the physical key is used.

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const ALIASES = /** @type {Record<string, string>} */ ({
  control: 'Ctrl',
  ctrl: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  opt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  super: 'Meta',
  win: 'Meta',
  esc: 'Escape',
  escape: 'Escape',
  enter: 'Enter',
  return: 'Enter',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  arrowup: 'ArrowUp',
  arrowdown: 'ArrowDown',
  arrowleft: 'ArrowLeft',
  arrowright: 'ArrowRight',
  plus: '+',
});

/** @param {Navigator | undefined} nav */
export function isApplePlatform(nav = globalThis.navigator) {
  const platform = /** @type {any} */ (nav)?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** @param {string} key */
function normalizeKey(key) {
  const alias = ALIASES[key.toLowerCase()];
  if (alias) return alias;
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(key)) return key.toUpperCase();
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * Normalizes one combo ('mod+shift+p' → 'Ctrl+Shift+P' on Windows/Linux).
 * @param {string} combo
 * @param {{ apple?: boolean }} [options]
 */
export function normalizeCombo(combo, { apple = isApplePlatform() } = {}) {
  const parts = combo
    .trim()
    .split(/\+(?!$)/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) throw new Error(`Empty shortcut "${combo}"`);
  const mods = new Set();
  /** @type {string | null} */
  let key = null;
  for (const raw of parts) {
    const lower = raw.toLowerCase();
    const name = lower === 'mod' ? (apple ? 'Meta' : 'Ctrl') : normalizeKey(raw);
    if (MODIFIERS.includes(name)) mods.add(name);
    else if (key) throw new Error(`Shortcut "${combo}" has two keys`);
    else key = name;
  }
  if (!key) throw new Error(`Shortcut "${combo}" has no key`);
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+');
}

/**
 * Normalizes a shortcut that may be a chord ('Mod+K Mod+T').
 * @param {string} shortcut
 * @param {{ apple?: boolean }} [options]
 * @returns {string[]} one or two normalized combos
 */
export function parseShortcut(shortcut, options) {
  const combos = shortcut
    .trim()
    .split(/\s+/)
    .map((c) => normalizeCombo(c, options));
  if (combos.length > 2) throw new Error(`Chords have at most two steps: "${shortcut}"`);
  return combos;
}

/**
 * The normalized combo of a key event, or null for lone modifier presses.
 * @param {Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>} event
 */
export function comboFromEvent(event) {
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(event.key))
    return null;
  let key;
  if (event.key === ' ') key = 'Space';
  else if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) key = event.key.toUpperCase();
  else if (/^Key[A-Z]$/.test(event.code) && (event.altKey || event.ctrlKey || event.metaKey)) key = event.code.slice(3);
  else if (/^Digit\d$/.test(event.code) && (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey))
    key = event.code.slice(5);
  else key = normalizeKey(event.key);
  const mods = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta'];
  // Shift is part of symbols like '?' or '+': don't require it in the binding.
  if (key.length === 1 && !/[A-Z0-9]/.test(key)) mods[2] = false;
  return [...mods.filter(Boolean), key].join('+');
}

/**
 * Human-readable label: 'Ctrl+Shift+P' or '⌘⇧P' on Apple platforms.
 * @param {string} shortcut normalized (or declarable) shortcut, chords allowed
 * @param {{ apple?: boolean }} [options]
 */
export function formatShortcut(shortcut, { apple = isApplePlatform() } = {}) {
  const symbols = /** @type {Record<string, string>} */ ({
    Ctrl: '⌃',
    Alt: '⌥',
    Shift: '⇧',
    Meta: '⌘',
    Enter: '↩',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backspace: '⌫',
    Delete: '⌦',
    Tab: '⇥',
  });
  return parseShortcut(shortcut, { apple })
    .map((combo) => {
      const parts = combo.split('+');
      if (apple) return parts.map((p) => symbols[p] ?? p).join('');
      return parts.map((p) => (p.startsWith('Arrow') ? (symbols[p] ?? p) : p)).join('+');
    })
    .join(' ');
}
