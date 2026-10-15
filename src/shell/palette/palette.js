// @ts-check
// Command palette (Mod+K): one fuzzy search over apps, commands, settings, files and app
// providers, with prefix modes, recent items, highlighted matches and full keyboard control.
//   >  commands      /  files       @  settings (pick a value right here)
//   =  calculator    ?  help topics  #  files by tag
// Commands with `pick` get a second step with options (and live preview).
import { formatShortcut } from '../../services/commands/keys.js';
import { h, icon, replace } from '../../ui/dom.js';
import { closeMenus } from '../../ui/menu.js';
import { trapFocus } from '../../ui/overlay.js';
import { registerCommand } from '../util.js';
import { evaluate, formatResult } from './calc.js';
import './palette.css';

const MODES = /** @type {const} */ ({
  '>': 'commands',
  '/': 'files',
  '@': 'settings',
  '=': 'calc',
  '?': 'help',
  '#': 'tags',
});
const RECENT_LIMIT = 8;

/**
 * @typedef {object} Item
 * @property {string} id
 * @property {string} kind      app | command | setting | file | folder | provider | calc | help | option | input
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [icon]
 * @property {string} [shortcut]
 * @property {[number, number][]} [ranges]
 * @property {() => unknown} activate
 * @property {() => void} [onFocus]
 * @property {boolean} [current]
 */

/** @param {import('../shell.js').ShellContext} shell */
export function createPalette(shell) {
  const sys = shell.system();
  const { t } = shell;
  const store = shell.session;
  /** @type {any[]} */
  const recent = store.data.paletteRecent ?? (store.data.paletteRecent = []);

  const input = h('input', {
    class: 'nx-palette-input',
    type: 'text',
    role: 'combobox',
    'aria-expanded': 'true',
    'aria-controls': 'nx-palette-list',
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const crumb = h('span', { class: 'nx-palette-crumb', hidden: true });
  const list = h('ul', { class: 'nx-palette-list', id: 'nx-palette-list', role: 'listbox' });
  const hint = h('p', { class: 'nx-palette-hint' });
  const panel = h(
    'div',
    { class: 'nx-palette nx-glass', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'nx-palette-search' }, icon('search', { size: 18 }), crumb, input),
    list,
    hint,
  );
  const backdrop = h('div', { class: 'nx-palette-backdrop', hidden: true }, panel);
  document.body.append(backdrop);
  trapFocus(panel);

  /** @type {Item[]} */
  let items = [];
  let active = 0;
  let seq = 0;
  /** A command waiting for its argument. @type {{ title: string, options: Item[], cancel?: () => void, input?: (value: string) => void, placeholder?: string } | null} */
  let step = null;
  /** @type {HTMLElement | null} */
  let previousFocus = null;

  const isOpen = () => !backdrop.hidden;

  function open(prefill = '') {
    closeMenus();
    previousFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    step = null;
    backdrop.hidden = false;
    input.value = prefill;
    panel.setAttribute('aria-label', t('palette.title'));
    input.setAttribute('aria-label', t('palette.placeholder'));
    input.placeholder = t('palette.placeholder');
    hint.textContent = t('palette.hint');
    crumb.hidden = true;
    input.focus();
    update();
  }

  /** @param {boolean} [cancelled] */
  function close(cancelled = true) {
    if (!isOpen()) return;
    if (cancelled) step?.cancel?.();
    step = null;
    backdrop.hidden = true;
    previousFocus?.focus?.({ preventScroll: true });
  }

  /** @param {any} entry */
  function remember(entry) {
    const i = recent.findIndex((r) => r.id === entry.id);
    if (i !== -1) recent.splice(i, 1);
    recent.unshift(entry);
    recent.length = Math.min(recent.length, RECENT_LIMIT);
    store.schedule();
  }

  /** @param {string} id @param {string} title @param {string} [subtitle] @param {string} [iconName] @param {any} [data] */
  const rec = (id, title, subtitle, iconName, data) => remember({ id, title, subtitle, icon: iconName, data });

  // ─── Item builders ─────────────────────────────────────────────────────
  /** @param {any} c from commands.list() */
  function commandItem(c) {
    const binding = sys.shortcuts.bindingFor(c.id);
    return /** @type {Item} */ ({
      id: `command:${c.id}`,
      kind: 'command',
      title: c.title,
      subtitle: c.category,
      icon: c.icon ?? 'command',
      shortcut: binding ?? undefined,
      activate: () => runCommand(c.id),
    });
  }

  /** @param {string} id */
  async function runCommand(id) {
    const command = sys.commands.get(id);
    if (!command) return;
    rec(`command:${id}`, sys.localize(command.title), undefined, command.icon ?? 'command', { commandId: id });
    void sys.search.recordUse(`command:${id}`);
    if (command.pick) {
      const options = await command.pick();
      step = {
        title: sys.localize(command.title),
        cancel: command.cancelPreview,
        options: options.map((o, i) => ({
          id: `option:${i}`,
          kind: 'option',
          title: o.label,
          subtitle: o.hint,
          icon: o.icon,
          current: o.current,
          onFocus: () => command.preview?.(o.value),
          activate: () => {
            close(false);
            return sys.commands.execute(id, o.value);
          },
        })),
      };
      enterStep();
      return;
    }
    close(false);
    await sys.commands
      .execute(id)
      .catch((error) => sys.notifications.notify({ title: String(error?.message ?? error) }));
  }

  /** @param {string} scope @param {string} key */
  function settingStep(scope, key) {
    const decl = sys.settings.describe(scope).find((d) => d.key === key);
    if (!decl) return;
    rec(`setting:${scope}/${key}`, sys.localize(decl.label), undefined, 'settings', { scope, key });
    const title = sys.localize(decl.label);
    const original = decl.value;
    const set = (/** @type {unknown} */ v) => sys.settings.set(scope, key, v).catch(() => {});
    if (decl.type === 'enum' || decl.type === 'boolean') {
      const options =
        decl.type === 'enum'
          ? decl.options.map((o) => ({ value: o.value, label: sys.localize(o.label) }))
          : [
              { value: true, label: t('palette.on') },
              { value: false, label: t('palette.off') },
            ];
      // Appearance settings preview live; others apply on Enter.
      const live = scope === 'system' && /^(theme|animation|accent|fontScale|transparency|wallpaper)/.test(key);
      step = {
        title,
        cancel: live ? () => set(original) : undefined,
        options: options.map((o, i) => ({
          id: `option:${i}`,
          kind: 'option',
          title: o.label,
          current: o.value === decl.value,
          onFocus: live ? () => set(o.value) : undefined,
          activate: async () => {
            close(false);
            await set(o.value);
          },
        })),
      };
    } else {
      step = {
        title,
        options: [],
        placeholder: String(decl.value ?? ''),
        input: async (raw) => {
          const value = decl.type === 'number' ? Number(raw.replace(',', '.')) : raw;
          try {
            await sys.settings.set(scope, key, value);
            close(false);
          } catch (error) {
            hint.textContent = String(/** @type {Error} */ (error).message);
          }
        },
      };
    }
    enterStep();
  }

  function enterStep() {
    if (!step) return;
    crumb.hidden = false;
    crumb.textContent = step.title;
    input.value = step.input ? String(step.placeholder ?? '') : '';
    input.placeholder = step.input ? t('palette.typeValue') : t('palette.filter');
    hint.textContent = t(step.input ? 'palette.hintInput' : 'palette.hintStep');
    input.select();
    update();
  }

  /** @param {any} r search result */
  function resultItem(r) {
    const base = { id: r.id, title: r.title, subtitle: r.snippet ?? r.subtitle, icon: r.icon, ranges: r.titleRanges };
    switch (r.type) {
      case 'app':
        return /** @type {Item} */ ({
          ...base,
          kind: 'app',
          icon: r.icon ?? 'apps',
          activate: () => {
            rec(r.id, r.title, t('palette.kind.app'), r.icon, r.data);
            void sys.search.recordUse(r.id);
            close(false);
            return shell.launch(r.data.appId);
          },
        });
      case 'setting':
        return /** @type {Item} */ ({
          ...base,
          kind: 'setting',
          icon: 'settings',
          activate: () => settingStep(r.data.scope, r.data.key),
        });
      case 'file':
      case 'folder':
        return /** @type {Item} */ ({
          ...base,
          kind: r.type,
          icon: r.type === 'folder' ? 'folder' : 'file-text',
          activate: () => {
            rec(r.id, r.title, r.data.path, r.type === 'folder' ? 'folder' : 'file-text', r.data);
            void sys.search.recordUse(r.id);
            close(false);
            return openPath(r.data.path);
          },
        });
      case 'command':
        if (r.run) {
          return /** @type {Item} */ ({
            ...base,
            kind: 'provider',
            icon: r.icon ?? 'arrow-right',
            activate: () => {
              close(false);
              return r.run();
            },
          });
        }
        return commandItem({ id: r.data.commandId, title: r.title, category: r.subtitle, icon: r.icon });
      default:
        return null;
    }
  }

  /** @param {string} path */
  async function openPath(path) {
    try {
      const result = await sys.intents.open(path);
      if (result === null) return;
    } catch {
      await sys.notifications.notify({ title: t('palette.noApp'), body: path });
    }
  }

  function helpItems() {
    return [
      {
        id: 'help:shortcuts',
        title: t('palette.help.shortcuts'),
        icon: 'keyboard',
        run: () => shell.ui.shortcuts?.open(),
      },
      { id: 'help:tour', title: t('palette.help.tour'), icon: 'sparkles', run: () => shell.launch('nexus.welcome') },
      { id: 'help:palette', title: t('palette.help.prefixes'), icon: 'command', run: () => open('') },
    ].map(
      (x) =>
        /** @type {Item} */ ({
          id: x.id,
          kind: 'help',
          title: x.title,
          icon: x.icon,
          activate: () => (close(false), x.run()),
        }),
    );
  }

  // ─── Searching ─────────────────────────────────────────────────────────
  async function update() {
    const mySeq = ++seq;
    const raw = input.value;
    /** @type {Item[]} */
    let next;
    if (step) {
      if (step.input) {
        next = [{ id: 'input', kind: 'input', title: raw || '…', icon: 'check', activate: () => step?.input?.(raw) }];
      } else {
        const q = raw.trim().toLowerCase();
        next = step.options.filter((o) => !q || o.title.toLowerCase().includes(q));
      }
    } else {
      const mode = MODES[/** @type {keyof typeof MODES} */ (raw[0])];
      const query = mode ? raw.slice(1).trim() : raw.trim();
      if (mode === 'calc') {
        const value = query ? evaluate(query) : null;
        const text = value === null ? null : formatResult(value, sys.i18n.format.number);
        next = text
          ? [
              {
                id: 'calc',
                kind: 'calc',
                title: `= ${text}`,
                subtitle: t('palette.calcCopy'),
                icon: 'calculator',
                activate: async () => {
                  await sys.clipboard.writeText(String(Number(value?.toPrecision(12)))).catch(() => {});
                  close(false);
                  void sys.notifications.notify({
                    title: t('palette.copied', { value: text }),
                    transient: true,
                    timeoutMs: 2000,
                  });
                },
              },
            ]
          : [];
      } else if (mode === 'help') {
        next = helpItems().filter((i) => !query || i.title.toLowerCase().includes(query.toLowerCase()));
      } else if (mode === 'commands') {
        const all = sys.commands.list();
        const scored = query
          ? (await sys.search.query(query, { types: ['command'], limit: 40 }))
              .map((r) => all.find((c) => c.id === r.data?.commandId))
              .filter(Boolean)
          : all;
        next = scored.slice(0, 40).map(commandItem);
      } else if (mode === 'tags') {
        const files = query ? await sys.vfs.search({ tag: query, limit: 40 }) : [];
        next = files.map(
          (f) =>
            /** @type {Item} */ ({
              id: `file:${f.path}`,
              kind: f.type,
              title: f.name,
              subtitle: f.path,
              icon: f.type === 'folder' ? 'folder' : 'tag',
              activate: () => (close(false), openPath(f.path)),
            }),
        );
      } else if (!query) {
        next = recent
          .map(
            (r) =>
              /** @type {Item} */ ({
                id: r.id,
                kind: 'recent',
                title: r.title,
                subtitle: r.subtitle,
                icon: r.icon ?? 'clock',
                activate: () => {
                  if (r.data?.commandId) return runCommand(r.data.commandId);
                  if (r.data?.scope) return settingStep(r.data.scope, r.data.key);
                  close(false);
                  if (r.data?.appId) return shell.launch(r.data.appId);
                  if (r.data?.path) return openPath(r.data.path);
                },
              }),
          )
          .concat(
            sys.commands
              .list()
              .slice(0, Math.max(0, 6 - recent.length))
              .map(commandItem),
          );
      } else {
        const types = mode === 'files' ? ['file', 'folder'] : mode === 'settings' ? ['setting'] : undefined;
        const results = await sys.search.query(query, { limit: 30, types: /** @type {any} */ (types) });
        next = results
          .map(resultItem)
          .filter((x) => !!x)
          .map((x) => /** @type {Item} */ (x));
      }
    }
    if (mySeq !== seq) return; // a newer keystroke is already being handled
    items = next;
    active = Math.max(
      0,
      items.findIndex((i) => i.current),
    );
    render();
  }

  function render() {
    if (!items.length) {
      replace(
        list,
        h('li', {
          class: 'nx-palette-empty',
          role: 'presentation',
          text: input.value.trim() ? t('palette.noResults') : t('palette.empty'),
        }),
      );
      input.removeAttribute('aria-activedescendant');
      return;
    }
    replace(
      list,
      ...items.map((item, i) =>
        h(
          'li',
          {
            id: `nx-palette-opt-${i}`,
            class: `nx-palette-item${i === active ? ' is-active' : ''}`,
            role: 'option',
            'aria-selected': String(i === active),
            onpointermove: () => i !== active && setActive(i),
            onclick: () => item.activate(),
          },
          h('span', { class: 'nx-palette-icon' }, icon(item.icon ?? 'arrow-right', { size: 18 })),
          h(
            'span',
            { class: 'nx-palette-text' },
            highlight(item.title, item.ranges),
            item.subtitle ? h('small', { text: item.subtitle }) : null,
          ),
          item.current ? h('span', { class: 'nx-palette-current' }, icon('check', { size: 16 })) : null,
          item.shortcut ? h('kbd', { class: 'nx-kbd', text: formatShortcut(item.shortcut) }) : null,
          h('span', { class: 'nx-palette-kind', text: t(`palette.kind.${item.kind}`) }),
        ),
      ),
    );
    input.setAttribute('aria-activedescendant', `nx-palette-opt-${active}`);
  }

  /** @param {number} i */
  function setActive(i) {
    active = (i + items.length) % items.length;
    list.querySelectorAll('.nx-palette-item').forEach((el, j) => {
      el.classList.toggle('is-active', j === active);
      el.setAttribute('aria-selected', String(j === active));
    });
    list.children[active]?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', `nx-palette-opt-${active}`);
    items[active]?.onFocus?.();
  }

  /** @param {string} text @param {[number, number][] | undefined} ranges */
  function highlight(text, ranges) {
    const span = h('span', { class: 'nx-palette-title' });
    let last = 0;
    for (const [a, b] of ranges ?? []) {
      span.append(text.slice(last, a), h('mark', { text: text.slice(a, b) }));
      last = b;
    }
    span.append(text.slice(last));
    return span;
  }

  let timer = 0;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 50);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(active + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(active - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[active]?.activate();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (step) {
        step.cancel?.();
        step = null;
        crumb.hidden = true;
        input.placeholder = t('palette.placeholder');
        hint.textContent = t('palette.hint');
        input.value = '';
        update();
      } else close();
    } else if (e.key === 'Backspace' && step && !input.value) {
      step.cancel?.();
      step = null;
      crumb.hidden = true;
      update();
    }
  });
  backdrop.addEventListener('pointerdown', (e) => e.target === backdrop && close());

  registerCommand(sys, {
    id: 'shell.palette',
    title: 'palette.title',
    icon: 'command',
    shortcut: 'Mod+K',
    run: () => (isOpen() ? close() : open()),
  });
  registerCommand(sys, {
    id: 'system.theme.pick',
    title: 'palette.changeTheme',
    icon: 'palette',
    pick: () => {
      const current = sys.settings.get('system', 'theme');
      return [
        { value: 'auto', label: t('palette.themeAuto'), icon: 'contrast', current: current === 'auto' },
        ...sys.theme.themes().map((th) => ({
          value: th.id,
          label: sys.localize(th.name),
          icon: th.scheme === 'light' ? 'sun' : 'moon',
          current: current === th.id,
        })),
      ];
    },
    ...(() => {
      /** @type {unknown} */
      let original;
      return {
        preview: (/** @type {unknown} */ value) => {
          if (original === undefined) original = sys.settings.get('system', 'theme');
          void sys.settings.set('system', 'theme', value);
        },
        cancelPreview: () => {
          if (original !== undefined) void sys.settings.set('system', 'theme', original);
          original = undefined;
        },
        run: (/** @type {unknown} */ value) => {
          original = undefined;
          return value && sys.settings.set('system', 'theme', value);
        },
      };
    })(),
  });

  return { open, close, toggle: () => (isOpen() ? close() : open()), isOpen };
}
