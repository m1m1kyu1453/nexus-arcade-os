// @ts-check
// Shared shapes of the Settings pages (JSDoc only).

/**
 * @typedef {object} PageContext
 * @property {import('../../../kernel/types').AppContext} ctx
 * @property {NonNullable<import('../../../kernel/types').AppContext['system']>} system
 * @property {(key: string, vars?: Record<string, unknown>) => string} t
 * @property {(text: import('../../../kernel/types').L10n | string) => string} local
 * @property {(key: string, scope?: string) => HTMLElement | null} row     a setting row ('' if unknown)
 * @property {(key: string, scope?: string) => unknown} value
 * @property {(key: string, value: unknown, scope?: string) => Promise<void>} set
 * @property {(id: string, args?: unknown) => Promise<unknown>} command  run an OS command (errors shown)
 * @property {(message: string) => void} toast
 * @property {() => void} refresh           re-render the page
 * @property {(page: string, highlight?: string) => void} navigate
 * @property {(message: string, options?: { title?: string, okLabel?: string, danger?: boolean }) => Promise<boolean>} confirm
 */

/**
 * @typedef {object} Page
 * @property {string} id
 * @property {string} icon
 * @property {string[]} [keys]   system settings shown on this page (search and deep links)
 * @property {(pc: PageContext) => (Node | null)[] | Promise<(Node | null)[]>} render
 */

export {};
