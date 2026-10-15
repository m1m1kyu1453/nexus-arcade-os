// @ts-check
// Login and lock screens.
//   loginScreen()      before a profile is opened: pick a profile, enter its PIN/password,
//                      or create a new profile. Used at boot when the last profile is locked
//                      or the user chose "Switch profile" / "Log out".
//   createLockScreen() during a session: Mod+L, the profile menu or the idle timer cover the
//                      desktop; shortcuts are off until it is unlocked.
// A profile PIN is a privacy lock for shared devices, not encryption — the screen says so.
import { identiconSvg } from '../../services/profiles/identicon.js';
import { h, icon, replace } from '../../ui/dom.js';
import { trapFocus } from '../../ui/overlay.js';
import { registerCommand } from '../util.js';
import './lock.css';

const LOGIN_FLAG = 'nexus:login';
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

/** Ask for the login screen on the next start (switch profile / log out). */
export function requestLoginOnNextStart() {
  try {
    sessionStorage.setItem(LOGIN_FLAG, '1');
  } catch {
    // ignore
  }
}

/** @returns {boolean} true once if the login screen was requested */
export function consumeLoginRequest() {
  try {
    const requested = sessionStorage.getItem(LOGIN_FLAG) === '1';
    sessionStorage.removeItem(LOGIN_FLAG);
    return requested;
  } catch {
    return false;
  }
}

/**
 * Translator over a raw messages object (before i18n exists).
 * @param {Record<string, any>} messages
 */
export function translator(messages) {
  return (/** @type {string} */ key, /** @type {Record<string, unknown>} */ vars = {}) => {
    let value = key.split('.').reduce((/** @type {any} */ o, k) => o?.[k], messages);
    if (value && typeof value === 'object' && typeof vars.count === 'number') {
      value = value[`=${vars.count}`] ?? value[vars.count === 1 ? 'one' : 'other'];
    }
    if (typeof value !== 'string') return key;
    return value.replace(/\{(\w+)\}/g, (m, n) => (n in vars ? String(vars[n]) : m));
  };
}

/** @param {import('../../services/profiles/profiles.js').PublicProfile} p @param {number} size */
function avatar(p, size) {
  const el = h('span', { class: 'nx-lock-avatar', style: { width: `${size}px`, height: `${size}px` } });
  if (p.avatar.kind === 'image') el.append(h('img', { src: URL.createObjectURL(p.avatar.image), alt: '' }));
  else el.innerHTML = identiconSvg(p.avatar.seed, p.accent, '#0b0e1a');
  return el;
}

/** Big clock + date. @param {string} locale */
function clock(locale) {
  const time = h('div', { class: 'nx-lock-time' });
  const date = h('div', { class: 'nx-lock-date' });
  const render = () => {
    const now = new Date();
    time.textContent = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
    date.textContent = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(now);
  };
  render();
  const timer = setInterval(render, 10_000);
  return { el: h('div', { class: 'nx-lock-clock' }, time, date), stop: () => clearInterval(timer) };
}

/**
 * PIN / password form with attempt limiting.
 * @param {{ profile: import('../../services/profiles/profiles.js').PublicProfile, t: (k: string, v?: any) => string, verify: (secret: string) => Promise<boolean>, onSuccess: () => void }} options
 */
function unlockForm({ profile, t, verify, onSuccess }) {
  const isPin = profile.locked === 'pin';
  const input = h('input', {
    class: 'nx-input nx-lock-secret',
    type: 'password',
    inputmode: isPin ? 'numeric' : undefined,
    autocomplete: 'current-password',
    'aria-label': t(isPin ? 'lock.pin' : 'lock.password'),
    placeholder: t(isPin ? 'lock.pin' : 'lock.password'),
  });
  const error = h('p', { class: 'nx-lock-error', role: 'alert' });
  const submit = h(
    'button',
    { class: 'nx-btn is-primary', type: 'submit' },
    icon('unlock', { size: 16 }),
    t('lock.unlock'),
  );
  let attempts = 0;
  const form = h(
    'form',
    { class: 'nx-lock-form' },
    h('div', { class: 'nx-lock-row' }, input, submit),
    error,
    h('p', { class: 'nx-lock-notice', text: t('lock.privacyNotice') }),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value) return;
    submit.disabled = true;
    const ok = await verify(input.value);
    if (ok) return onSuccess();
    attempts++;
    input.value = '';
    form.classList.remove('is-shaking');
    void form.offsetWidth;
    form.classList.add('is-shaking');
    if (attempts >= MAX_ATTEMPTS) {
      error.textContent = t('lock.tooMany', { seconds: COOLDOWN_MS / 1000 });
      input.disabled = true;
      setTimeout(() => {
        attempts = 0;
        input.disabled = false;
        submit.disabled = false;
        error.textContent = '';
        input.focus();
      }, COOLDOWN_MS);
      return;
    }
    error.textContent = t(isPin ? 'lock.wrongPin' : 'lock.wrongPassword');
    submit.disabled = false;
    input.focus();
  });
  return { form, focus: () => input.focus() };
}

/**
 * The login screen before any profile is open. Resolves with the unlocked profile.
 * @param {object} options
 * @param {HTMLElement} options.parent
 * @param {Awaited<ReturnType<typeof import('../../kernel/system.js').bootKernel>>} options.kernel
 * @returns {Promise<import('../../services/profiles/profiles.js').PublicProfile>}
 */
export async function loginScreen({ parent, kernel }) {
  const t = translator(await kernel.preLoginMessages());
  const locale = kernel.preLoginLocale();
  const { profiles } = kernel;
  /** @type {(p: import('../../services/profiles/profiles.js').PublicProfile) => void} */
  let resolve = () => {};
  const result = new Promise((r) => (resolve = r));
  {
    const time = clock(locale);
    const panel = h('div', { class: 'nx-lock-panel' });
    const screen = h(
      'div',
      { class: 'nx-lock is-login', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('lock.title') },
      time.el,
      panel,
    );
    parent.append(screen);
    trapFocus(screen);
    const finish = (/** @type {any} */ p) => {
      time.stop();
      screen.classList.add('is-leaving');
      setTimeout(() => screen.remove(), 300);
      resolve(p);
    };

    async function pick() {
      const list = await profiles.list();
      if (!list.length) return create();
      const last = await kernel.lastProfile();
      replace(
        panel,
        h('h1', { class: 'nx-visually-hidden', text: t('lock.title') }),
        h(
          'div',
          { class: 'nx-lock-profiles', role: 'list' },
          ...list.map((p) =>
            h(
              'button',
              {
                class: 'nx-lock-profile',
                type: 'button',
                role: 'listitem',
                onclick: () => choose(p),
                dataset: { profile: p.id },
              },
              avatar(p, 72),
              h('span', { text: p.name }),
              p.locked
                ? h('small', {}, icon('lock', { size: 12 }), t(p.locked === 'pin' ? 'lock.pin' : 'lock.password'))
                : null,
            ),
          ),
        ),
        h(
          'button',
          { class: 'nx-btn is-ghost', type: 'button', onclick: create },
          icon('user-plus', { size: 16 }),
          t('lock.createProfile'),
        ),
      );
      /** @type {HTMLElement | null} */ (
        panel.querySelector(`[data-profile="${last?.id}"]`) ?? panel.querySelector('.nx-lock-profile')
      )?.focus();
    }

    /** @param {import('../../services/profiles/profiles.js').PublicProfile} p */
    function choose(p) {
      if (!p.locked) return finish(p);
      const form = unlockForm({ profile: p, t, verify: (s) => profiles.unlock(p.id, s), onSuccess: () => finish(p) });
      replace(
        panel,
        avatar(p, 96),
        h('h1', { class: 'nx-lock-name', text: p.name }),
        form.form,
        h(
          'button',
          { class: 'nx-btn is-ghost', type: 'button', onclick: pick },
          icon('users', { size: 16 }),
          t('lock.switchProfile'),
        ),
      );
      form.focus();
    }

    function create() {
      const name = h('input', {
        class: 'nx-input',
        type: 'text',
        maxlength: '64',
        required: true,
        autocomplete: 'nickname',
        'aria-label': t('lock.name'),
      });
      const pin = h('input', {
        class: 'nx-input',
        type: 'password',
        inputmode: 'numeric',
        pattern: '\\d{4,12}',
        autocomplete: 'new-password',
        'aria-label': t('lock.optionalPin'),
      });
      const error = h('p', { class: 'nx-lock-error', role: 'alert' });
      const form = h(
        'form',
        { class: 'nx-lock-form nx-lock-create' },
        h('label', { class: 'nx-field' }, h('span', { text: t('lock.name') }), name),
        h('label', { class: 'nx-field' }, h('span', { text: t('lock.optionalPin') }), pin),
        h('p', { class: 'nx-lock-notice', text: t('lock.privacyNotice') }),
        error,
        h(
          'div',
          { class: 'nx-lock-row' },
          h('button', { class: 'nx-btn', type: 'button', onclick: pick, text: t('dialog.cancel') }),
          h('button', { class: 'nx-btn is-primary', type: 'submit', text: t('lock.create') }),
        ),
      );
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const p = await profiles.create({ name: name.value });
          if (pin.value) await profiles.setLock(p.id, { kind: 'pin', secret: pin.value });
          finish((await profiles.get(p.id)) ?? p);
        } catch (err) {
          error.textContent = String(/** @type {Error} */ (err).message);
        }
      });
      replace(panel, h('h1', { class: 'nx-lock-name', text: t('lock.createProfile') }), form);
      name.focus();
    }

    await pick();
  }
  return result;
}

/** @param {import('../shell.js').ShellContext} shell */
export function createLockScreen(shell) {
  const sys = shell.system();
  const { t } = shell;
  /** @type {HTMLElement | null} */
  let screen = null;
  let idleTimer = 0;

  async function lock() {
    if (screen) return;
    sys.shortcuts.setEnabled(false);
    const profile = /** @type {any} */ (await sys.profiles.get(sys.profile.id)) ?? sys.profile;
    const time = clock(sys.i18n.locale);
    const panel = h(
      'div',
      { class: 'nx-lock-panel' },
      avatar(profile, 96),
      h('h1', { class: 'nx-lock-name', text: profile.name }),
    );
    screen = h(
      'div',
      { class: 'nx-lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('lock.title') },
      time.el,
      panel,
    );
    document.body.append(screen);
    trapFocus(screen);
    const unlock = () => {
      time.stop();
      screen?.classList.add('is-leaving');
      const el = screen;
      setTimeout(() => el?.remove(), 300);
      screen = null;
      sys.shortcuts.setEnabled(true);
      resetIdle();
    };
    if (profile.locked) {
      const form = unlockForm({ profile, t, verify: (s) => sys.profiles.unlock(profile.id, s), onSuccess: unlock });
      panel.append(form.form);
      form.focus();
    } else {
      const btn = h(
        'button',
        { class: 'nx-btn is-primary', type: 'button', onclick: unlock },
        icon('unlock', { size: 16 }),
        t('lock.unlock'),
      );
      panel.append(btn);
      btn.focus();
    }
    panel.append(
      h(
        'button',
        { class: 'nx-btn is-ghost', type: 'button', onclick: switchProfile },
        icon('users', { size: 16 }),
        t('lock.switchProfile'),
      ),
    );
  }

  async function switchProfile() {
    await shell.session.save();
    requestLoginOnNextStart();
    location.reload();
  }

  async function logOut() {
    await shell.session.save();
    const profile = sys.profile;
    if (profile.guest) {
      // Guest profiles wipe themselves on sign-out.
      await sys.profiles.remove(profile.id).catch(() => {});
    }
    requestLoginOnNextStart();
    location.reload();
  }

  function resetIdle() {
    clearTimeout(idleTimer);
    const minutes = Number(sys.settings.get('system', 'idleLockMinutes'));
    if (minutes > 0 && !screen) idleTimer = window.setTimeout(lock, minutes * 60_000);
  }
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'])
    addEventListener(type, resetIdle, { passive: true, capture: true });
  sys.settings.onChange('system', 'idleLockMinutes', resetIdle);
  resetIdle();

  registerCommand(sys, { id: 'shell.lock', title: 'lock.lockCommand', icon: 'lock', shortcut: 'Mod+L', run: lock });
  registerCommand(sys, { id: 'shell.switchProfile', title: 'lock.switchProfile', icon: 'users', run: switchProfile });
  registerCommand(sys, { id: 'shell.logOut', title: 'shell.logOut', icon: 'log-out', run: logOut });
  return {
    lock,
    switchProfile,
    logOut,
    get locked() {
      return !!screen;
    },
  };
}
