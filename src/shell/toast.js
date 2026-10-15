// Minimal toast host for phase 0. The notification service (phase 1) and notification
// center (phase 2) replace it.
import './toast.css';

/**
 * @typedef {object} ToastOptions
 * @property {string} message
 * @property {{ label: string, run: () => void }} [action]
 * @property {number} [timeoutMs]  0 = sticky until dismissed
 * @property {string} dismissLabel
 */

/** @param {HTMLElement} root */
export function createToastHost(root) {
  const host = document.createElement('div');
  host.className = 'nx-toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  root.append(host);

  /** @param {ToastOptions} options */
  function show({ message, action, timeoutMs = 6000, dismissLabel }) {
    const toast = document.createElement('div');
    toast.className = 'nx-toast';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(text);

    const close = () => toast.remove();
    if (action) {
      const button = document.createElement('button');
      button.className = 'nx-toast-action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        close();
        action.run();
      });
      toast.append(button);
    }
    const dismiss = document.createElement('button');
    dismiss.className = 'nx-toast-close';
    dismiss.textContent = '×';
    dismiss.setAttribute('aria-label', dismissLabel);
    dismiss.addEventListener('click', close);
    toast.append(dismiss);

    host.append(toast);
    if (timeoutMs > 0) setTimeout(close, timeoutMs);
    return close;
  }

  return { show };
}
