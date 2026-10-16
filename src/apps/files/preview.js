// @ts-check
// Preview pane: images, text/code (highlighted), Markdown (rendered), audio/video players and
// PDF (the browser's own viewer, where it has one). Only the newest request wins, so quickly
// moving through files never shows a stale preview.
import { h, icon } from '../../ui/dom.js';
import { fileIconName } from '../../ui/file-icons.js';
import { highlight } from '../../ui/highlight.js';
import { renderMarkdownInto } from '../../ui/markdown.js';
import { displayName, formatSize, previewKind } from './model.js';
import { typeLabel } from './views.js';

/**
 * @param {import('../../kernel/types').AppContext} ctx
 * @param {{ onOpen: (item: import('./model.js').Item) => void }} actions
 */
export function createPreview(ctx, { onOpen }) {
  const { t } = ctx.i18n;
  const el = h('aside', {
    class: 'nx-files-preview',
    'aria-label': t('preview.label'),
    dataset: { testid: 'files-preview' },
  });
  let token = 0;
  /** @type {string | null} */
  let url = null;

  const release = () => {
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  /** @param {Blob} blob */
  const blobUrl = (blob) => {
    release();
    url = URL.createObjectURL(blob);
    return url;
  };

  /** @param {string} text */
  const message = (text) => h('p', { class: 'nx-files-preview-msg', text });

  /** @param {import('./model.js').Item} item */
  function details(item) {
    const { i18n } = ctx;
    return h(
      'dl',
      { class: 'nx-files-preview-meta' },
      h('dt', { text: t('columns.type') }),
      h('dd', { text: typeLabel(item, t) }),
      ...(item.type === 'file'
        ? [h('dt', { text: t('columns.size') }), h('dd', { text: formatSize(item.size, (n, o) => i18n.number(n, o)) })]
        : []),
      h('dt', { text: t('columns.modified') }),
      h('dd', { text: i18n.date(item.modified, { dateStyle: 'medium', timeStyle: 'short' }) }),
      ...(item.tags.length ? [h('dt', { text: t('props.tags') }), h('dd', { text: item.tags.join(', ') })] : []),
    );
  }

  /**
   * @param {import('./model.js').Item[]} items selected items
   */
  async function show(items) {
    const mine = ++token;
    release();
    if (items.length !== 1) {
      el.replaceChildren(message(items.length ? t('preview.multiple', { count: items.length }) : t('preview.none')));
      return;
    }
    const item = /** @type {import('./model.js').Item} */ (items[0]);
    const name = displayName(item);
    const head = h(
      'header',
      { class: 'nx-files-preview-head' },
      icon(fileIconName(item.mime, name), { size: 20 }),
      h('strong', { text: name }),
    );
    const body = h('div', { class: 'nx-files-preview-body' });
    const openable = item.type === 'folder' || ctx.intents.openersFor(item.path).length > 0;
    const openBtn =
      item.trash || !openable
        ? null
        : h('button', { class: 'nx-btn', type: 'button', onclick: () => onOpen(item) }, t('preview.open'));
    el.replaceChildren(head, body, details(item), ...(openBtn ? [openBtn] : []));
    if (item.type === 'folder') {
      body.append(h('span', { class: 'nx-files-preview-big' }, icon('folder', { size: 64 })));
      return;
    }
    const kind = previewKind(item);
    try {
      if (kind === 'none') {
        body.append(
          h('span', { class: 'nx-files-preview-big' }, icon(fileIconName(item.mime, name), { size: 64 })),
          message(
            item.size > 2_000_000 && item.mime.startsWith('text/') ? t('preview.tooLarge') : t('preview.unavailable'),
          ),
        );
        return;
      }
      if (kind === 'text' || kind === 'markdown') {
        const text = /** @type {string} */ (await ctx.fs.readFile(item.path, { as: 'text' }));
        if (mine !== token) return;
        if (kind === 'markdown') {
          const md = h('div', { class: 'nx-files-preview-md' });
          await renderMarkdownInto(md, text);
          if (mine === token) body.append(md);
          return;
        }
        const { fragment } = await highlight(text.slice(0, 200_000), name);
        if (mine === token) body.append(h('pre', { class: 'nx-code nx-files-preview-code' }, fragment));
        return;
      }
      const blob = /** @type {Blob} */ (await ctx.fs.readFile(item.path, { as: 'blob' }));
      if (mine !== token) return;
      const typed = blob.type === item.mime ? blob : new Blob([blob], { type: item.mime });
      if (kind === 'image') body.append(h('img', { class: 'nx-files-preview-img', src: blobUrl(typed), alt: name }));
      else if (kind === 'audio') body.append(h('audio', { controls: true, src: blobUrl(typed), preload: 'metadata' }));
      else if (kind === 'video')
        body.append(
          h('video', { class: 'nx-files-preview-video', controls: true, src: blobUrl(typed), preload: 'metadata' }),
        );
      else if (kind === 'pdf') {
        // navigator.pdfViewerEnabled is false (or missing) where the browser has no inline viewer.
        if (navigator.pdfViewerEnabled === false) body.append(message(t('preview.pdfUnavailable')));
        else body.append(h('iframe', { class: 'nx-files-preview-pdf', src: blobUrl(typed), title: name }));
      }
    } catch (error) {
      if (mine === token) body.append(message(String(/** @type {Error} */ (error).message)));
    }
  }

  return { el, show, dispose: release };
}
