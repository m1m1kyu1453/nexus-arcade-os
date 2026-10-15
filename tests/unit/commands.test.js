import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createLogger } from '../../src/kernel/logger.js';
import { CommandUnavailableError, createCommands } from '../../src/services/commands/commands.js';
import { comboFromEvent, formatShortcut, normalizeCombo, parseShortcut } from '../../src/services/commands/keys.js';
import { createShortcuts, isEditable } from '../../src/services/commands/shortcuts.js';
import { compileWhen, evaluateWhen } from '../../src/services/commands/when.js';

describe('when-clauses', () => {
  const ctx = { appFocused: true, focusedApp: 'nexus.notes', inputFocused: false, count: 3 };
  it.each([
    ['appFocused', true],
    ['!appFocused', false],
    ["focusedApp == 'nexus.notes'", true],
    ['focusedApp != "nexus.notes"', false],
    ["appFocused && !inputFocused && focusedApp == 'nexus.notes'", true],
    ['inputFocused || count == 3', true],
    ['!(appFocused && inputFocused)', true],
    ['unknownKey', false],
    ['true && !false', true],
  ])('%s → %s', (clause, expected) => {
    expect(evaluateWhen(clause, ctx)).toBe(expected);
  });

  it('treats an empty clause as always true', () => {
    expect(evaluateWhen(undefined, {})).toBe(true);
  });

  it('rejects malformed clauses and never evaluates code', () => {
    for (const bad of ['a &&', '(a', 'a b', 'a = 1', 'alert(1)', '`x`'])
      expect(() => compileWhen(bad), bad).toThrow(SyntaxError);
    expect(evaluateWhen('constructor', {})).toBe(false);
  });
});

describe('shortcut notation', () => {
  it('normalizes combos with Mod per platform', () => {
    expect(normalizeCombo('mod+shift+p', { apple: false })).toBe('Ctrl+Shift+P');
    expect(normalizeCombo('Mod+Alt+n', { apple: true })).toBe('Alt+Meta+N');
    expect(normalizeCombo('Ctrl++', { apple: false })).toBe('Ctrl++');
    expect(normalizeCombo('esc')).toBe('Escape');
    expect(normalizeCombo('shift+f5')).toBe('Shift+F5');
    expect(parseShortcut('Mod+K Mod+T', { apple: false })).toEqual(['Ctrl+K', 'Ctrl+T']);
    expect(() => normalizeCombo('Ctrl+A+B')).toThrow(/two keys/);
    expect(() => normalizeCombo('Ctrl+Shift')).toThrow(/no key/);
    expect(() => parseShortcut('a b c')).toThrow(/two steps/);
  });

  it('reads combos from key events, layout-aware', () => {
    const ev = (key, code, mods = {}) => ({
      key,
      code,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      ...mods,
    });
    expect(comboFromEvent(ev('k', 'KeyK', { ctrlKey: true }))).toBe('Ctrl+K');
    // German layout: the key labelled Z sits where QWERTY has Y.
    expect(comboFromEvent(ev('z', 'KeyY', { ctrlKey: true }))).toBe('Ctrl+Z');
    // macOS Alt+N types '˜': fall back to the physical key.
    expect(comboFromEvent(ev('˜', 'KeyN', { altKey: true, metaKey: true }))).toBe('Alt+Meta+N');
    expect(comboFromEvent(ev(' ', 'Space'))).toBe('Space');
    expect(comboFromEvent(ev('?', 'Slash', { shiftKey: true }))).toBe('?');
    expect(comboFromEvent(ev('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
    expect(comboFromEvent(ev('ArrowUp', 'ArrowUp', { altKey: true }))).toBe('Alt+ArrowUp');
  });

  it('formats for display', () => {
    expect(formatShortcut('Mod+Shift+P', { apple: true })).toBe('⇧⌘P');
    expect(formatShortcut('Mod+Shift+P', { apple: false })).toBe('Ctrl+Shift+P');
    expect(formatShortcut('Mod+K Mod+T', { apple: false })).toBe('Ctrl+K Ctrl+T');
    expect(formatShortcut('Alt+Up', { apple: false })).toBe('Alt+↑');
  });
});

function setupCommands(context = { focusedApp: null }) {
  const bus = createEventBus();
  const logger = createLogger();
  const commands = createCommands({
    bus,
    log: logger.child('commands'),
    context: () => context,
    localize: (t) => (typeof t === 'string' ? t : t.en),
  });
  return { bus, logger, commands, context };
}

describe('commands', () => {
  it('registers, lists available commands and executes them', async () => {
    const { commands } = setupCommands({ focusedApp: 'nexus.notes' });
    const run = vi.fn(() => 'done');
    commands.register({
      id: 'notes.new',
      title: { en: 'New note', de: 'Neue Notiz' },
      category: 'Notes',
      when: "focusedApp == 'nexus.notes'",
      run,
    });
    commands.register({
      id: 'tasks.new',
      title: 'New task',
      category: 'Tasks',
      when: "focusedApp == 'nexus.tasks'",
      run,
    });
    commands.register({ id: 'sys.hidden', title: 'Hidden', hidden: true, run });
    expect(commands.list().map((c) => [c.id, c.title])).toEqual([['notes.new', 'New note']]);
    expect(commands.list({ all: true })).toHaveLength(3);
    expect(await commands.execute('notes.new', { x: 1 })).toBe('done');
    expect(run).toHaveBeenCalledWith({ x: 1 });
    await expect(commands.execute('tasks.new')).rejects.toBeInstanceOf(CommandUnavailableError);
    await expect(commands.execute('nope')).rejects.toBeInstanceOf(CommandUnavailableError);
  });

  it('rejects duplicates and bad when-clauses; unregisters', () => {
    const { commands } = setupCommands();
    const unregister = commands.register({ id: 'a', title: 'A', run: () => {} });
    expect(() => commands.register({ id: 'a', title: 'A', run: () => {} })).toThrow(/already/);
    expect(() => commands.register({ id: 'b', title: 'B', when: 'a &&', run: () => {} })).toThrow(SyntaxError);
    unregister();
    expect(commands.get('a')).toBeUndefined();
  });

  it('logs and rethrows failing commands', async () => {
    const { commands, logger } = setupCommands();
    commands.register({
      id: 'boom',
      title: 'Boom',
      run: () => {
        throw new Error('nope');
      },
    });
    await expect(commands.execute('boom')).rejects.toThrow('nope');
    expect(logger.entries({ minLevel: 'error' })[0].message).toBe('Command "boom" failed');
  });
});

describe('shortcut manager', () => {
  function setup({ scope = null } = {}) {
    const base = setupCommands({ focusedApp: 'nexus.notes' });
    const stored = new Map();
    let t = 0;
    const state = { scope };
    const shortcuts = createShortcuts({
      commands: base.commands,
      log: base.logger.child('shortcuts'),
      bus: base.bus,
      store: { get: async (k) => stored.get(k), set: async (k, v) => void stored.set(k, v) },
      activeScope: () => state.scope,
      apple: false,
      now: () => t,
    });
    const press = (key, mods = {}, target = null) => {
      const event = {
        key,
        code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        repeat: false,
        isComposing: false,
        target,
        preventDefault: vi.fn(),
        ...mods,
      };
      return { handled: shortcuts.handle(event), event };
    };
    return { ...base, shortcuts, stored, press, state, advance: (ms) => (t += ms) };
  }

  it('runs commands through their default bindings', async () => {
    const { commands, shortcuts, press } = setup();
    const run = vi.fn();
    commands.register({ id: 'palette.open', title: 'Palette', run });
    shortcuts.setDefault('palette.open', 'Mod+Shift+P');
    const { handled, event } = press('P', { ctrlKey: true, shiftKey: true });
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    await vi.waitFor(() => expect(run).toHaveBeenCalled());
    expect(press('p', { ctrlKey: true }).handled).toBe(false);
  });

  it('skips unavailable commands', () => {
    const { commands, shortcuts, press } = setup();
    commands.register({ id: 'tasks.new', title: 'T', when: "focusedApp == 'nexus.tasks'", run: vi.fn() });
    shortcuts.setDefault('tasks.new', 'Mod+N');
    expect(press('n', { ctrlKey: true }).handled).toBe(false);
  });

  it('prefers the focused app, then commands, then global shortcuts', () => {
    const { commands, shortcuts, press, state } = setup({ scope: 'nexus.notes#1' });
    const appHandler = vi.fn();
    const globalHandler = vi.fn();
    const cmd = vi.fn();
    commands.register({ id: 'x', title: 'X', run: cmd });
    shortcuts.setDefault('x', 'Mod+S');
    shortcuts.register('Mod+S', globalHandler);
    shortcuts.register('Mod+S', appHandler, { scope: 'nexus.notes#1' });
    press('s', { ctrlKey: true });
    expect(appHandler).toHaveBeenCalledTimes(1);
    state.scope = 'other#1';
    press('s', { ctrlKey: true });
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(globalHandler).not.toHaveBeenCalled();
  });

  it('ignores plain keys inside text inputs unless allowed', () => {
    const { shortcuts, press } = setup();
    const plain = vi.fn();
    const strong = vi.fn();
    const allowed = vi.fn();
    shortcuts.register('?', plain);
    shortcuts.register('Mod+F', strong);
    shortcuts.register('Escape', allowed, { allowInInputs: true });
    const input = { tagName: 'INPUT', type: 'text', closest: () => null };
    press('?', { shiftKey: true }, input);
    press('f', { ctrlKey: true }, input);
    press('Escape', {}, input);
    expect(plain).not.toHaveBeenCalled();
    expect(strong).toHaveBeenCalled();
    expect(allowed).toHaveBeenCalled();
    press('?', { shiftKey: true });
    expect(plain).toHaveBeenCalled();
  });

  it('detects editable targets', () => {
    expect(isEditable({ tagName: 'TEXTAREA', closest: () => null })).toBe(true);
    expect(isEditable({ tagName: 'INPUT', type: 'checkbox', closest: () => null })).toBe(false);
    expect(isEditable({ tagName: 'DIV', isContentEditable: true, closest: () => null })).toBe(true);
    expect(isEditable(null)).toBe(false);
  });

  it('can be switched off (lock screen)', () => {
    const { shortcuts, press } = setup();
    const fn = vi.fn();
    shortcuts.register('Mod+K', fn);
    shortcuts.setEnabled(false);
    expect(press('k', { ctrlKey: true }).handled).toBe(false);
    shortcuts.setEnabled(true);
    press('k', { ctrlKey: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('supports chords with a timeout', () => {
    const { shortcuts, press, advance } = setup();
    const chord = vi.fn();
    shortcuts.register('Mod+K Mod+T', chord);
    expect(press('k', { ctrlKey: true }).handled).toBe(true);
    press('t', { ctrlKey: true });
    expect(chord).toHaveBeenCalledTimes(1);
    press('k', { ctrlKey: true });
    advance(2000);
    press('t', { ctrlKey: true });
    expect(chord).toHaveBeenCalledTimes(1);
  });

  it('lets users rebind, unbind and reset, persisting overrides and reporting conflicts', async () => {
    const { commands, shortcuts, stored, press } = setup();
    const a = vi.fn();
    const b = vi.fn();
    commands.register({ id: 'a', title: 'A', run: a });
    commands.register({ id: 'b', title: 'B', run: b });
    shortcuts.setDefault('a', 'Mod+1');
    shortcuts.setDefault('b', 'Mod+2');
    expect(await shortcuts.rebind('b', 'Mod+1')).toEqual(['a']);
    expect(shortcuts.conflicts()).toEqual([{ shortcut: 'Ctrl+1', ids: ['a', 'b'] }]);
    expect(stored.get('bindings')).toEqual({ b: 'Mod+1' });
    await shortcuts.rebind('a', null);
    expect(shortcuts.bindingFor('a')).toBeNull();
    press('1', { ctrlKey: true, code: 'Digit1' });
    await vi.waitFor(() => expect(b).toHaveBeenCalled());
    await shortcuts.resetBinding('b');
    expect(shortcuts.bindingFor('b')).toBe('Ctrl+2');
    await shortcuts.resetAll();
    expect(shortcuts.bindingFor('a')).toBe('Ctrl+1');
    await expect(shortcuts.rebind('a', 'Ctrl+A+B')).rejects.toThrow();

    stored.set('bindings', { a: 'Mod+9' });
    await shortcuts.load();
    expect(shortcuts.bindingFor('a')).toBe('Ctrl+9');
  });

  it('reports chord prefixes that collide with single shortcuts', () => {
    const { commands, shortcuts } = setup();
    commands.register({ id: 'k', title: 'K', run: () => {} });
    commands.register({ id: 'kt', title: 'KT', run: () => {} });
    shortcuts.setDefault('k', 'Mod+K');
    shortcuts.setDefault('kt', 'Mod+K Mod+T');
    expect(shortcuts.conflicts()).toEqual([{ shortcut: 'Ctrl+K', ids: ['k', 'kt'] }]);
  });
});
