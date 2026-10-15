// @ts-check
// Fallback dialogs for a kernel without the shell (tests, headless use): the browser's own
// alert/confirm/prompt. The shell replaces them with system dialogs (shell/dialogs). Dialogs
// that have no honest native equivalent reject with a clear message instead of pretending.

/**
 * @param {{ t: (key: string) => string }} i18n system-scoped translator
 * @param {Window | undefined} [win]
 */
export function createNativeDialogs(i18n, win = globalThis.window) {
  const unavailable = async () => {
    throw new Error(i18n.t('dialog.unavailable'));
  };
  return {
    /** @param {string} message */
    alert: async (message) => win?.alert(message),
    /** @param {string} message */
    confirm: async (message) => win?.confirm(message) ?? false,
    /** @param {string} message @param {string} [value] */
    prompt: async (message, value = '') => win?.prompt(message, value) ?? null,
    /**
     * "Open with…": numbered list in a prompt. Returns { appId, always } or null.
     * @param {{ candidates: { id: string, name: string }[] }} request
     */
    async pickApp({ candidates }) {
      const list = candidates.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      const answer = win?.prompt(list, '1');
      const index = Number(answer) - 1;
      const chosen = candidates[index];
      return chosen ? { appId: chosen.id, always: false } : null;
    },
    openFile: unavailable,
    saveFile: unavailable,
    color: unavailable,
  };
}
