// @ts-check
// Settings → Shortcuts: every command with its shortcut; record a new one, remove or reset it.
// Collisions are shown so the user can fix them.
import { h, icon } from '../../../ui/dom.js';
import { group } from '../form.js';

/** @type {import('./types.js').Page} */
export const shortcuts = {
  id: 'shortcuts',
  icon: 'keyboard',
  render(pc) {
    const { t, system } = pc;
    const filter = h('input', {
      class: 'nx-input nx-set-filter',
      type: 'search',
      placeholder: t('keys.filter'),
      'aria-label': t('keys.filter'),
    });
    const list = h('div', { class: 'nx-set-shortcuts', dataset: { testid: 'shortcut-list' } });
    const conflictsBox = h('div', { role: 'status' });

    function render() {
      const q = filter.value.trim().toLowerCase();
      const conflicts = system.shortcuts.conflicts();
      const clashing = new Set(conflicts.flatMap((c) => c.ids));
      conflictsBox.replaceChildren(
        ...conflicts.map((c) =>
          h(
            'p',
            { class: 'nx-set-warning' },
            icon('warning', { size: 16 }),
            t('keys.conflict', { combo: system.shortcuts.format(c.shortcut), names: c.ids.map(title).join(', ') }),
          ),
        ),
      );
      /** @type {Map<string, ReturnType<typeof system.shortcuts.list>>} */
      const byCategory = new Map();
      for (const c of system.shortcuts.list()) {
        // Hidden aliases (e.g. Ctrl+W for Close window) are fallbacks, not separate commands.
        if (c.hidden) continue;
        if (q && !`${c.title} ${c.category} ${c.binding ?? ''}`.toLowerCase().includes(q)) continue;
        const cat = c.category || t('keys.general');
        byCategory.set(cat, [...(byCategory.get(cat) ?? []), c]);
      }
      list.replaceChildren(
        ...(byCategory.size
          ? [...byCategory].map(([cat, items]) =>
              group(
                cat,
                ...items.map((c) =>
                  h(
                    'div',
                    { class: `nx-set-row${clashing.has(c.id) ? ' is-conflict' : ''}`, dataset: { command: c.id } },
                    h('div', { class: 'nx-set-text' }, h('span', { class: 'nx-set-label', text: c.title })),
                    h(
                      'div',
                      { class: 'nx-set-control' },
                      c.binding
                        ? h('kbd', { class: 'nx-kbd nx-set-combo', text: system.shortcuts.format(c.binding) })
                        : h('span', { class: 'nx-set-desc', text: t('keys.none') }),
                      h('button', {
                        type: 'button',
                        class: 'nx-btn',
                        text: t('keys.change'),
                        onclick: () => record(c.id, c.title),
                      }),
                      c.binding
                        ? h(
                            'button',
                            {
                              type: 'button',
                              class: 'nx-icon-btn',
                              'aria-label': t('keys.removeLabel', { name: c.title }),
                              'data-tooltip': t('keys.remove'),
                              onclick: async () => {
                                await system.shortcuts.rebind(c.id, null);
                                render();
                              },
                            },
                            icon('x', { size: 16 }),
                          )
                        : null,
                      h(
                        'button',
                        {
                          type: 'button',
                          class: 'nx-icon-btn',
                          'aria-label': t('form.resetLabel', { name: c.title }),
                          'data-tooltip': t('form.reset'),
                          onclick: async () => {
                            await system.shortcuts.reset(c.id);
                            render();
                          },
                        },
                        icon('undo', { size: 16 }),
                      ),
                    ),
                  ),
                ),
              ),
            )
          : [h('p', { class: 'nx-empty', text: t('keys.nothing') })]),
      );
    }

    /** @param {string} id */
    const title = (id) => system.shortcuts.list().find((c) => c.id === id)?.title ?? id;

    /** Waits for the next key combination and binds it. @param {string} id @param {string} name */
    function record(id, name) {
      const prompt = h(
        'div',
        {
          class: 'nx-set-record',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('keys.recordTitle', { name }),
          tabindex: '-1',
        },
        h('p', { class: 'nx-set-record-title', text: t('keys.recordTitle', { name }) }),
        h('p', { class: 'nx-set-desc', text: t('keys.recordHint') }),
      );
      document.body.append(prompt);
      system.shortcuts.setEnabled(false);
      const done = () => {
        system.shortcuts.setEnabled(true);
        removeEventListener('keydown', onKey, true);
        prompt.remove();
        render();
      };
      /** @param {KeyboardEvent} e */
      const onKey = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') return done();
        const combo = system.shortcuts.comboFromEvent(e);
        if (!combo) return; // only a modifier so far
        const clashes = await system.shortcuts.rebind(id, combo);
        if (clashes.length)
          pc.toast(
            t('keys.nowShared', { combo: system.shortcuts.format(combo), names: clashes.map(title).join(', ') }),
          );
        done();
      };
      addEventListener('keydown', onKey, true);
      prompt.focus();
    }

    filter.addEventListener('input', render);
    render();
    return [
      h(
        'div',
        { class: 'nx-set-toolbar' },
        filter,
        h('button', {
          type: 'button',
          class: 'nx-btn',
          text: t('keys.resetAll'),
          onclick: async () => {
            if (!(await pc.confirm(t('keys.resetAllConfirm'), { okLabel: t('keys.resetAll') }))) return;
            await system.shortcuts.resetAll();
            render();
          },
        }),
      ),
      conflictsBox,
      list,
    ];
  },
};
