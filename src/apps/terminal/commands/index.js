// @ts-check
// Every built-in command of the Nexus shell.
import { fileCommands } from './files.js';
import { systemCommands } from './system.js';
import { textCommands } from './text.js';

/** @type {Record<string, import('../shell/shell.js').CommandDef>} */
export const builtins = { ...fileCommands, ...textCommands, ...systemCommands };
