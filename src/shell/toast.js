// Minimal toast host until the phase 2 shell: shows the update prompt and the notification
// service's toasts (title, body, one action).
import './toast.css';

/**
 * @typedef {object} ToastOptions
 * @property {string} message      title line
 * @property {string} [body]
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
  function show({ message, body, action, timeoutMs = 6000, dismissLabel }) {
    const toast = document.createElement('div');
    toast.className = 'nx-toast';
    const text = document.createElement('span');
    text.className = 'nx-toast-text';
    const title = document.createElement('strong');
    title.textContent = message;
    text.append(title);
    if (body) {
      const detail = document.createElement('span');
      detail.textContent = body;
      text.append(detail);
    }
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
