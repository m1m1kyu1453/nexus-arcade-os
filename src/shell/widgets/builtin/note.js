// @ts-check
// Quick note widget: a text area backed by a real file in the VFS (default
// Documents/Quick note.md), so the note also opens in the editor and file explorer.
import { h } from '../../../ui/dom.js';

const SAVE_DELAY_MS = 500;

/**
 * @param {HTMLElement} container
 * @param {import('../../../kernel/types').WidgetContext} ctx
 * @param {import('../../shell.js').ShellContext} shell
 */
export function mount(container, ctx, shell) {
  const { t } = shell;
  const area = h('textarea', {
    class: 'nx-wnote',
    'aria-label': t('widgets.note.label'),
    placeholder: t('widgets.note.placeholder'),
    spellcheck: 'true',
  });
  container.append(area);
  const path = () => String(ctx.widget.config.get('path') || `${ctx.fs.home}/Documents/Quick note.md`);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let lastSaved = '';
  /** @type {(() => void) | null} */
  let unwatch = null;

  async function load() {
    const file = path();
    const exists = await ctx.fs.stat(file);
    const text = exists ? String(await ctx.fs.readFile(file)) : '';
    lastSaved = text;
    if (document.activeElement !== area) area.value = text;
    unwatch?.();
    unwatch = ctx.fs.watch(file, () => void reloadIfChanged());
  }

  async function reloadIfChanged() {
    if (timer !== undefined) return; // our own pending write wins
    const exists = await ctx.fs.stat(path());
    const text = exists ? String(await ctx.fs.readFile(path())) : '';
    if (text !== lastSaved && text !== area.value) {
      lastSaved = text;
      area.value = text;
    }
  }

  async function save() {
    timer = undefined;
    if (area.value === lastSaved) return;
    lastSaved = area.value;
    await ctx.fs.writeFile(path(), area.value, { createParents: true });
  }

  area.addEventListener(
    'input',
    () => {
      clearTimeout(timer);
      timer = setTimeout(ctx.guard(save), SAVE_DELAY_MS);
    },
    { signal: ctx.signal },
  );
  area.addEventListener('blur', () => timer !== undefined && (clearTimeout(timer), void save()), {
    signal: ctx.signal,
  });
  ctx.widget.config.onChange((key) => key === 'path' && void load());
  void load();
  return {
    unmount() {
      if (timer !== undefined) {
        clearTimeout(timer);
        void save();
      }
      unwatch?.();
    },
  };
}
