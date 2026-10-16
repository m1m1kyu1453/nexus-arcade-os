// @ts-check
// Settings → Accessibility → "Announce windows and notifications": a polite live region that
// tells screen readers when a window opens, gets focus or closes, and when a notification shows.
import { h } from '../ui/dom.js';
import { appName } from './util.js';

/** @param {import('./shell.js').ShellContext} shell */
export function createAnnouncer(shell) {
  const sys = shell.system();
  const region = h('div', {
    class: 'nx-visually-hidden',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  document.body.append(region);
  const on = () => !!sys.settings.get('system', 'screenReaderHints');
  /** Re-setting the same text would not be announced again, so clear it first. @param {string} text */
  const say = (text) => {
    if (!on()) return;
    region.textContent = '';
    requestAnimationFrame(() => (region.textContent = text));
  };
  const title = (/** @type {string} */ id) => shell.wm.get(id)?.title ?? '';

  sys.bus.on('window:opened', ({ id }) =>
    requestAnimationFrame(() => say(shell.t('a11y.opened', { title: title(id) }))),
  );
  sys.bus.on('window:focused', ({ id }) => say(shell.t('a11y.focused', { title: title(id) })));
  sys.bus.on('window:closed', ({ appId }) => say(shell.t('a11y.closed', { app: appName(sys, appId) })));
  sys.bus.on('notification:shown', (n) => {
    if (!n.suppressed) say(shell.t('a11y.notification', { title: n.title, body: n.body ?? '' }));
  });
  return { say };
}
