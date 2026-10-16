// @ts-check
// Command registry: every action the command palette, menus, shortcuts and the terminal can
// run. `when` decides availability from the current context (focused app, input focus, …).
import { compileWhen, evaluateWhen } from './when.js';

/**
 * @typedef {object} Command
 * @property {string} id
 * @property {string | import('../../kernel/types').L10n} title
 * @property {string} [icon]
 * @property {string | import('../../kernel/types').L10n} [category]
 * @property {string} [when]         e.g. "focusedApp == 'nexus.notes'"
 * @property {string} [shortcut]     default binding, e.g. 'Mod+Alt+N'
 * @property {boolean} [hidden]      not listed in the palette (still executable)
 * @property {string} [source]       'system' or the app id
 * @property {(args?: unknown) => unknown} run
 * @property {() => PickOption[] | Promise<PickOption[]>} [pick]  asks for an argument first (the palette shows the options)
 * @property {(value: unknown) => void} [preview]   live preview while moving through the options
 * @property {() => void} [cancelPreview]          undo the preview when the user cancels
 */

/** @typedef {{ value: unknown, label: string, icon?: string, hint?: string, current?: boolean }} PickOption */

export class CommandUnavailableError extends Error {
  name = 'CommandUnavailableError';
}

/**
 * @param {object} options
 * @param {import('../../kernel/bus.js').EventBus} options.bus
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {() => import('./when.js').WhenContext} options.context
 * @param {(text: string | import('../../kernel/types').L10n) => string} options.localize
 * @param {(source: string) => boolean} [options.sourceEnabled]  false for commands of hidden apps
 */
export function createCommands({ bus, log, context, localize, sourceEnabled = () => true }) {
  /** @type {Map<string, Command>} */
  const commands = new Map();
  /** @type {((id: string) => unknown) | null} */
  let picker = null;
  const changed = () => bus.emit('commands:changed', {});
  /** @param {Command} c */
  const usable = (c) => !c.source || sourceEnabled(c.source);

  return {
    /**
     * @param {Command} command
     * @returns {() => void} unregister
     */
    register(command) {
      if (!command?.id || typeof command.run !== 'function') throw new Error('Commands need an id and a run function');
      if (commands.has(command.id)) throw new Error(`Command "${command.id}" is already registered`);
      if (command.when) compileWhen(command.when); // fail early on syntax errors
      commands.set(command.id, command);
      changed();
      return () => {
        if (commands.get(command.id) === command) {
          commands.delete(command.id);
          changed();
        }
      };
    },

    /** @param {string} id */
    get: (id) => commands.get(id),

    /** @param {string} id */
    isAvailable(id) {
      const command = commands.get(id);
      return !!command && usable(command) && evaluateWhen(command.when, context());
    },

    /**
     * Commands available right now (or all), with localized titles, sorted by category/title.
     * @param {{ all?: boolean }} [options]
     */
    list({ all = false } = {}) {
      const ctx = context();
      return [...commands.values()]
        .filter((c) => all || (!c.hidden && usable(c) && evaluateWhen(c.when, ctx)))
        .map((c) => ({
          ...c,
          title: localize(c.title),
          category: c.category === undefined ? undefined : localize(c.category),
        }))
        .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title));
    },

    /**
     * @param {string} id
     * @param {unknown} [args]
     */
    async execute(id, args) {
      const command = commands.get(id);
      if (!command) throw new CommandUnavailableError(`Unknown command "${id}"`);
      if (!usable(command) || !evaluateWhen(command.when, context()))
        throw new CommandUnavailableError(`Command "${id}" is not available here`);
      // A command that needs a choice, run without one (e.g. from a shortcut): let the user pick.
      if (command.pick && args === undefined && picker) return picker(id);
      try {
        const result = await command.run(args);
        bus.emit('command:executed', { id });
        return result;
      } catch (error) {
        log.error(`Command "${id}" failed`, error);
        throw error;
      }
    },

    /**
     * Who shows a pick command's options when it runs without an argument (the palette).
     * @param {((id: string) => unknown) | null} fn
     */
    setPicker(fn) {
      picker = fn;
    },
  };
}

/** @typedef {ReturnType<typeof createCommands>} Commands */
