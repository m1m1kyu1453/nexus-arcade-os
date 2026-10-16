// @ts-check
// Settings → Profiles & Lock: this profile's name and colour, PIN or password lock, auto-lock,
// startup, and the other profiles on this device.
import { h, icon } from '../../../ui/dom.js';
import { openModal } from '../../../ui/overlay.js';
import { group, infoRow } from '../form.js';

/** @type {import('./types.js').Page} */
export const profiles = {
  id: 'profiles',
  icon: 'user',
  keys: ['idleLockMinutes', 'fastBoot'],
  async render(pc) {
    const { t, system } = pc;
    const me = /** @type {any} */ (await system.profiles.current());
    const all = /** @type {any[]} */ (await system.profiles.list());

    const name = h('input', { class: 'nx-input', type: 'text', id: 'nx-set-profile-name', maxlength: '40' });
    name.value = me?.name ?? '';
    name.addEventListener('change', async () => {
      const value = name.value.trim();
      if (value && value !== me.name) {
        await system.profiles.update({ name: value });
        pc.toast(t('done.saved'));
      }
    });
    const accent = h('input', { type: 'color', class: 'nx-set-color', 'aria-label': t('profile.color') });
    accent.value = me?.accent ?? '#3ef0ff';
    accent.addEventListener('change', () => void system.profiles.update({ accent: accent.value }));

    const locked = me?.locked;
    return [
      group(
        t('group.thisProfile'),
        h(
          'div',
          { class: 'nx-set-row' },
          h(
            'div',
            { class: 'nx-set-text' },
            h('label', { class: 'nx-set-label', for: 'nx-set-profile-name', text: t('profile.name') }),
          ),
          h('div', { class: 'nx-set-control' }, name),
        ),
        infoRow(t('profile.color'), t('profile.colorHint'), accent),
        infoRow(t('profile.user'), null, h('code', { text: me?.username ?? '' })),
      ),
      group(
        t('group.lock'),
        infoRow(
          t('lock.title'),
          locked ? t(`lock.on.${locked}`) : t('lock.off'),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: locked ? t('lock.change') : t('lock.set'),
            onclick: () => void editLock(pc, !!locked),
          }),
          locked
            ? h('button', {
                type: 'button',
                class: 'nx-btn is-danger',
                text: t('lock.remove'),
                onclick: () => void removeLock(pc),
              })
            : null,
        ),
        h('p', { class: 'nx-set-note' }, icon('shield', { size: 16 }), t('lock.notice')),
        pc.row('idleLockMinutes'),
        infoRow(
          t('lock.now'),
          null,
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('lock.nowButton'),
            onclick: () => void pc.command('shell.lock'),
          }),
        ),
      ),
      group(t('group.startup'), pc.row('fastBoot')),
      group(
        t('group.otherProfiles'),
        ...all
          .filter((p) => p.id !== me?.id)
          .map((p) =>
            infoRow(
              p.name,
              p.locked ? t(`lock.on.${p.locked}`) : null,
              h('button', {
                type: 'button',
                class: 'nx-btn is-danger',
                text: t('profile.delete'),
                onclick: async () => {
                  if (
                    !(await pc.confirm(t('profile.deleteConfirm', { name: p.name }), {
                      danger: true,
                      okLabel: t('profile.delete'),
                    }))
                  )
                    return;
                  await system.profiles.remove(p.id);
                  pc.refresh();
                },
              }),
            ),
          ),
        infoRow(
          t('profile.add'),
          t('profile.addHint'),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('profile.addButton'),
            onclick: () => void addProfile(pc),
          }),
        ),
        infoRow(
          t('profile.switch'),
          null,
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('profile.switchButton'),
            onclick: () => void pc.command('shell.switchProfile'),
          }),
          h('button', {
            type: 'button',
            class: 'nx-btn',
            text: t('profile.logOut'),
            onclick: () => void pc.command('shell.logOut'),
          }),
        ),
      ),
    ];
  },
};

/** @param {import('./types.js').PageContext} pc @param {boolean} hasLock */
async function editLock(pc, hasLock) {
  const { t, system } = pc;
  const kind = h(
    'select',
    { class: 'nx-select', 'aria-label': t('lock.kind') },
    h('option', { value: 'pin', text: t('lock.pin') }),
    h('option', { value: 'password', text: t('lock.password') }),
  );
  const current = h('input', {
    class: 'nx-input',
    type: 'password',
    autocomplete: 'current-password',
    'aria-label': t('lock.current'),
  });
  const secret = h('input', {
    class: 'nx-input',
    type: 'password',
    autocomplete: 'new-password',
    'aria-label': t('lock.new'),
  });
  const again = h('input', {
    class: 'nx-input',
    type: 'password',
    autocomplete: 'new-password',
    'aria-label': t('lock.repeat'),
  });
  const error = h('p', { class: 'nx-set-error', role: 'alert', hidden: true });
  const field = (/** @type {string} */ label, /** @type {HTMLElement} */ el) =>
    h('label', { class: 'nx-field' }, h('span', { text: label }), el);
  const ok = await openModal({
    title: hasLock ? t('lock.change') : t('lock.set'),
    size: 'sm',
    body: h(
      'div',
      { class: 'nx-set-form' },
      field(t('lock.kind'), kind),
      hasLock ? field(t('lock.current'), current) : null,
      field(t('lock.new'), secret),
      field(t('lock.repeat'), again),
      h('p', { class: 'nx-set-desc', text: t('lock.notice') }),
      error,
    ),
    actions: [
      { label: t('confirm.cancel'), value: false },
      {
        label: t('lock.save'),
        value: true,
        variant: 'primary',
        accept: async () => {
          error.hidden = true;
          if (secret.value !== again.value) {
            error.textContent = t('lock.mismatch');
            error.hidden = false;
            return false;
          }
          try {
            await system.profiles.setLock({
              kind: /** @type {'pin' | 'password'} */ (kind.value),
              secret: secret.value,
              current: hasLock ? current.value : undefined,
            });
            return true;
          } catch (e) {
            error.textContent = String(/** @type {Error} */ (e).message);
            error.hidden = false;
            return false;
          }
        },
      },
    ],
    dismissValue: false,
  });
  if (ok) {
    pc.toast(t('lock.saved'));
    pc.refresh();
  }
}

/** @param {import('./types.js').PageContext} pc */
async function removeLock(pc) {
  const { t, system } = pc;
  const current = h('input', {
    class: 'nx-input',
    type: 'password',
    autocomplete: 'current-password',
    'aria-label': t('lock.current'),
  });
  const error = h('p', { class: 'nx-set-error', role: 'alert', hidden: true });
  const ok = await openModal({
    title: t('lock.remove'),
    body: h(
      'div',
      { class: 'nx-set-form' },
      h('label', { class: 'nx-field' }, h('span', { text: t('lock.current') }), current),
      error,
    ),
    actions: [
      { label: t('confirm.cancel'), value: false },
      {
        label: t('lock.remove'),
        value: true,
        variant: 'danger',
        accept: async () => {
          try {
            await system.profiles.clearLock(current.value);
            return true;
          } catch (e) {
            error.textContent = String(/** @type {Error} */ (e).message);
            error.hidden = false;
            return false;
          }
        },
      },
    ],
    dismissValue: false,
  });
  if (ok) pc.refresh();
}

/** @param {import('./types.js').PageContext} pc */
async function addProfile(pc) {
  const { t, system } = pc;
  const name = h('input', { class: 'nx-input', type: 'text', maxlength: '40', 'aria-label': t('profile.name') });
  const ok = await openModal({
    title: t('profile.add'),
    body: h(
      'div',
      { class: 'nx-set-form' },
      h('label', { class: 'nx-field' }, h('span', { text: t('profile.name') }), name),
      h('p', { class: 'nx-set-desc', text: t('profile.addHint') }),
    ),
    actions: [
      { label: t('confirm.cancel'), value: false },
      { label: t('profile.addButton'), value: true, variant: 'primary', accept: () => !!name.value.trim() },
    ],
    dismissValue: false,
  });
  if (!ok) return;
  await system.profiles.create({ name: name.value.trim() });
  pc.toast(t('profile.added', { name: name.value.trim() }));
  pc.refresh();
}
