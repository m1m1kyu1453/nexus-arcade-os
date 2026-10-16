// @ts-check
// Rendering of the item views: icons (with image thumbnails), list, details (sortable columns)
// and column view. Views only build DOM; the controller in index.js owns state and events.
import { h, icon } from '../../ui/dom.js';
import { fileIconName } from '../../ui/file-icons.js';
import { displayName, extension, formatSize } from './model.js';

/** @typedef {import('./model.js').Item} Item */
/** @typedef {'icons' | 'list' | 'details' | 'columns'} ViewMode */

const THUMB_MAX_BYTES = 8_000_000;

/**
 * @typedef {object} ViewContext
 * @property {import('../../kernel/types').AppContext} ctx
 * @property {Set<string>} selected
 * @property {Set<string>} cut       paths currently cut (shown dimmed)
 * @property {{ key: import('./model.js').SortKey, desc: boolean }} sort
 * @property {'folder' | 'trash' | 'search' | 'recent' | 'tag'} kind
 * @property {(blob: Blob) => string} objectUrl  tracked blob URLs (revoked on the next render)
 */

/** "Markdown file", "Folder" … @param {Item} item @param {(k: string, v?: object) => string} t */
export function typeLabel(item, t) {
  if (item.type === 'folder') return t('type.folder');
  const ext = extension(displayName(item));
  return ext ? t('type.withExt', { ext: ext.toUpperCase() }) : t('type.file');
}

/** @param {Item} item @param {ViewContext} vc @param {number} size */
function visual(item, vc, size) {
  const name = displayName(item);
  if (
    size >= 40 &&
    item.type === 'file' &&
    item.mime.startsWith('image/') &&
    item.size <= THUMB_MAX_BYTES &&
    !item.trash
  ) {
    const img = h('img', { class: 'nx-files-thumb', alt: '', draggable: 'false', loading: 'lazy' });
    vc.ctx.fs
      .readFile(item.path, { as: 'blob' })
      .then((blob) => (img.src = vc.objectUrl(/** @type {Blob} */ (blob))))
      .catch(() => img.replaceWith(icon('file-image', { size })));
    return img;
  }
  return h(
    'span',
    { class: `nx-files-glyph${item.type === 'folder' ? ' is-folder' : ''}` },
    icon(fileIconName(item.mime, name), { size }),
  );
}

/** @param {Item} item @param {ViewContext} vc @param {string} extraClass @param {...Node} children */
function itemElement(item, vc, extraClass, ...children) {
  const selected = vc.selected.has(item.path);
  return h(
    'div',
    {
      class: `nx-files-item ${extraClass}${selected ? ' is-selected' : ''}${vc.cut.has(item.path) ? ' is-cut' : ''}`,
      role: 'option',
      'aria-selected': String(selected),
      tabindex: '-1',
      draggable: 'true',
      title: vc.kind === 'search' || vc.kind === 'recent' || vc.kind === 'tag' ? item.path : displayName(item),
      dataset: { path: item.path, type: item.type, testid: 'files-item' },
    },
    ...children,
  );
}

/**
 * Icons, list or details view of `items`.
 * @param {Item[]} items
 * @param {Exclude<ViewMode, 'columns'>} mode
 * @param {ViewContext} vc
 */
export function renderItems(items, mode, vc) {
  const { t } = vc.ctx.i18n;
  if (mode === 'icons') {
    return items.map((item) =>
      itemElement(
        item,
        vc,
        'is-icon',
        visual(item, vc, 44),
        h('span', { class: 'nx-files-name', text: displayName(item) }),
      ),
    );
  }
  if (mode === 'list') {
    return items.map((item) =>
      itemElement(
        item,
        vc,
        'is-row',
        visual(item, vc, 18),
        h('span', { class: 'nx-files-name', text: displayName(item) }),
      ),
    );
  }
  const columns = detailColumns(vc.kind);
  return items.map((item) =>
    itemElement(
      item,
      vc,
      'is-row is-details',
      ...columns.map((col) => {
        if (col === 'name')
          return h(
            'span',
            { class: 'nx-files-cell is-name' },
            visual(item, vc, 18),
            h('span', { class: 'nx-files-name', text: displayName(item) }),
          );
        return h('span', { class: `nx-files-cell is-${col}`, text: cellText(item, col, vc, t) });
      }),
    ),
  );
}

/** @param {ViewContext['kind']} kind @returns {string[]} */
export function detailColumns(kind) {
  if (kind === 'trash') return ['name', 'originalPath', 'deleted', 'size'];
  if (kind === 'search' || kind === 'recent' || kind === 'tag') return ['name', 'location', 'modified', 'size'];
  return ['name', 'modified', 'type', 'size'];
}

/** Columns that sort, and by which key. */
const SORTABLE = /** @type {Record<string, import('./model.js').SortKey>} */ ({
  name: 'name',
  modified: 'modified',
  deleted: 'modified',
  type: 'type',
  size: 'size',
});

/**
 * Header row of the details view (buttons that sort).
 * @param {ViewContext} vc
 * @param {(key: import('./model.js').SortKey) => void} onSort
 */
export function detailsHeader(vc, onSort) {
  const { t } = vc.ctx.i18n;
  return h(
    'div',
    { class: 'nx-files-header', role: 'presentation' },
    ...detailColumns(vc.kind).map((col) => {
      const key = SORTABLE[col];
      const active = key && vc.sort.key === key && (col !== 'deleted' || vc.kind === 'trash');
      const label = t(`columns.${col}`);
      if (!key) return h('span', { class: `nx-files-cell is-${col}`, text: label });
      return h(
        'button',
        {
          type: 'button',
          class: `nx-files-cell is-${col}${active ? ' is-sorted' : ''}`,
          'aria-sort': active ? (vc.sort.desc ? 'descending' : 'ascending') : undefined,
          onclick: () => onSort(key),
        },
        label,
        active ? icon(vc.sort.desc ? 'chevron-down' : 'chevron-up', { size: 14 }) : null,
      );
    }),
  );
}

/**
 * @param {Item} item
 * @param {string} col
 * @param {ViewContext} vc
 * @param {(k: string, v?: object) => string} t
 */
function cellText(item, col, vc, t) {
  const { i18n } = vc.ctx;
  switch (col) {
    case 'modified':
      return i18n.date(item.modified, { dateStyle: 'medium', timeStyle: 'short' });
    case 'deleted':
      return item.trash ? i18n.date(item.trash.at, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    case 'type':
      return typeLabel(item, t);
    case 'size':
      return item.type === 'folder' ? '' : formatSize(item.size, (n, o) => i18n.number(n, o));
    case 'originalPath':
      return item.trash
        ? prettyPath(item.trash.originalPath.slice(0, item.trash.originalPath.lastIndexOf('/')) || '/', vc)
        : '';
    case 'location':
      return prettyPath(item.path.slice(0, item.path.lastIndexOf('/')) || '/', vc);
    default:
      return '';
  }
}

/** "~/Documents" for paths in the home folder. @param {string} path @param {ViewContext} vc */
export function prettyPath(path, vc) {
  const home = /** @type {string} */ (vc.ctx.fs.home);
  if (path === home) return '~';
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

/**
 * One column of the column view.
 * @param {Item[]} items
 * @param {ViewContext} vc
 * @param {{ path: string, active: boolean, open?: string }} column  `open` = child shown in the next column
 */
export function renderColumn(items, vc, column) {
  return h(
    'div',
    {
      class: `nx-files-column${column.active ? ' is-active' : ''}`,
      role: column.active ? 'listbox' : 'group',
      'aria-multiselectable': column.active ? 'true' : undefined,
      'aria-label': column.path,
      dataset: { column: column.path },
    },
    ...items.map((item) => {
      const el = itemElement(
        item,
        column.active ? vc : { ...vc, selected: new Set() },
        `is-row${item.path === column.open ? ' is-open' : ''}`,
        visual(item, vc, 18),
        h('span', { class: 'nx-files-name', text: displayName(item) }),
        item.type === 'folder' ? icon('chevron-right', { size: 14 }) : null,
      );
      if (!column.active) el.removeAttribute('role');
      return el;
    }),
  );
}
