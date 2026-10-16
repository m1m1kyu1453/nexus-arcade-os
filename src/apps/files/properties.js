// @ts-check
// Properties dialog: name, type, location, size (folders: summed recursively), dates, tags and
// the default app for this file type.
import { h } from '../../ui/dom.js';
import { openModal } from '../../ui/overlay.js';
import { displayName, formatSize } from './model.js';
import { prettyPath, typeLabel } from './views.js';

/**
 * @param {import('../../kernel/types').AppContext} ctx
 * @param {import('./model.js').Item & { readOnly?: boolean }} item
 * @returns {Promise<boolean>} true when something was saved
 */
export async function openProperties(ctx, item) {
  const { t, i18n } = { t: ctx.i18n.t, i18n: ctx.i18n };
  const name = displayName(item);
  const size = (/** @type {number} */ n) => formatSize(n, (v, o) => i18n.number(v, o));
  const when = (/** @type {number} */ ms) => i18n.date(ms, { dateStyle: 'long', timeStyle: 'short' });
  const location = item.trash ? item.trash.originalPath : item.path;
  const dir = location.slice(0, location.lastIndexOf('/')) || '/';
  const vc = /** @type {any} */ ({ ctx });

  const sizeValue = h('dd', { text: item.type === 'folder' ? t('props.calculating') : size(item.size) });
  const containsValue = h('dd', { text: t('props.calculating') });
  if (item.type === 'folder') {
    /** @type {Promise<any[]>} */ (ctx.fs.walk(item.path))
      .then((nodes) => {
        const inside = nodes.slice(1);
        const files = inside.filter((n) => n.type === 'file');
        sizeValue.textContent = size(files.reduce((sum, n) => sum + n.size, 0));
        containsValue.textContent = `${t('props.files', { count: files.length })}, ${t('props.folders', {
          count: inside.length - files.length,
        })}`;
      })
      .catch(() => (sizeValue.textContent = containsValue.textContent = '—'));
  }

  const editable = !item.readOnly && !item.trash;
  const tagsInput = h('input', {
    class: 'nx-input',
    type: 'text',
    id: 'nx-files-props-tags',
    placeholder: t('props.tagsHint'),
    disabled: !editable,
    dataset: { testid: 'files-props-tags' },
  });
  tagsInput.value = item.tags.join(', ');

  /** @type {HTMLSelectElement | null} */
  let appSelect = null;
  let initialApp = '';
  /** @type {HTMLElement | null} */
  let appRow = null;
  if (item.type === 'file' && !item.trash) {
    const apps = ctx.intents.openersFor(item.path);
    initialApp = (await ctx.intents.getDefault(item.path)) ?? '';
    if (apps.length) {
      appSelect = h(
        'select',
        { class: 'nx-select', id: 'nx-files-props-app', dataset: { testid: 'files-props-app' } },
        h('option', { value: '', text: t('props.askEveryTime') }),
        ...apps.map((id) => h('option', { value: id, text: ctx.system?.apps.name(id) ?? id })),
      );
      appSelect.value = apps.includes(initialApp) ? initialApp : '';
      appRow = h(
        'div',
        { class: 'nx-files-props-row' },
        h('label', { for: 'nx-files-props-app', text: t('props.defaultApp') }),
        appSelect,
      );
    } else
      appRow = h(
        'div',
        { class: 'nx-files-props-row' },
        h('span', { text: t('props.defaultApp') }),
        h('span', { text: t('props.noApp') }),
      );
  }

  const body = h(
    'div',
    { class: 'nx-files-props' },
    h(
      'dl',
      {},
      h('dt', { text: t('props.name') }),
      h('dd', { text: name }),
      h('dt', { text: t('props.type') }),
      h('dd', { text: `${typeLabel(item, t)}${item.type === 'file' ? ` (${item.mime})` : ''}` }),
      h('dt', { text: t('props.location') }),
      h('dd', { text: prettyPath(dir, vc) }),
      h('dt', { text: t('props.size') }),
      sizeValue,
      ...(item.type === 'folder' ? [h('dt', { text: t('props.contains') }), containsValue] : []),
      h('dt', { text: t('props.created') }),
      h('dd', { text: when(item.created) }),
      h('dt', { text: t('props.modified') }),
      h('dd', { text: when(item.modified) }),
    ),
    h(
      'div',
      { class: 'nx-files-props-row' },
      h('label', { for: 'nx-files-props-tags', text: t('props.tags') }),
      tagsInput,
    ),
    appRow,
    item.readOnly ? h('p', { class: 'nx-files-props-note', text: t('props.readOnly') }) : null,
  );

  const save = await openModal({
    title: t('props.title', { name }),
    body,
    size: 'md',
    actions:
      editable || appSelect
        ? [
            { label: t('props.close'), value: false },
            { label: t('props.save'), value: true, variant: 'primary' },
          ]
        : [{ label: t('props.close'), value: false, variant: 'primary' }],
    dismissValue: false,
  });
  if (!save) return false;
  const tags = tagsInput.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (editable && tags.join('\u0000') !== item.tags.join('\u0000')) await ctx.fs.setTags(item.path, tags);
  if (appSelect && appSelect.value !== initialApp) {
    if (appSelect.value) await ctx.intents.setDefault(item.path, appSelect.value);
    else await ctx.intents.clearDefault(item.path);
  }
  return true;
}
