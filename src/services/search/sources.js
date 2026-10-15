// @ts-check
// Feeds the search index from the OS: apps, commands, settings and files. Keeps it current
// through bus events (incremental updates) and re-titles everything when the language changes.
import { isTextMime } from '../vfs/mime.js';
import { isInside } from '../vfs/path.js';

const MAX_INDEXED_FILE_BYTES = 256 * 1024;

/**
 * @param {object} deps
 * @param {import('./search.js').Search} deps.search
 * @param {import('../../kernel/bus.js').EventBus} deps.bus
 * @param {import('../../kernel/registry.js').Registry} deps.registry
 * @param {import('../commands/commands.js').Commands} deps.commands
 * @param {import('../settings/settings.js').Settings} deps.settings
 * @param {import('../vfs/vfs.js').Vfs} deps.vfs
 * @param {(text: string | import('../../kernel/types').L10n) => string} deps.localize
 * @param {import('../../kernel/logger.js').Logger} deps.log
 */
export function connectSearchSources({ search, bus, registry, commands, settings, vfs, localize, log }) {
  /** @param {import('../../kernel/types').AppManifest} m @returns {import('./search-index.js').SearchDoc} */
  const appDoc = (m) => ({
    id: `app:${m.id}`,
    type: 'app',
    title: localize(m.name),
    subtitle: localize(m.description),
    keywords: m.keywords,
    icon: m.icon,
    data: { appId: m.id },
  });

  function commandDocs() {
    return commands
      .list({ all: true })
      .filter((c) => !c.hidden)
      .map((c) => ({
        id: `command:${c.id}`,
        type: /** @type {const} */ ('command'),
        title: c.title,
        subtitle: c.category,
        icon: c.icon,
        data: { commandId: c.id },
      }));
  }

  function settingDocs() {
    return settings.scopes().flatMap((scope) =>
      settings.describe(scope).map((s) => ({
        id: `setting:${scope}/${s.key}`,
        type: /** @type {const} */ ('setting'),
        title: localize(s.label),
        subtitle: scope === 'system' ? undefined : localize(registry.get(scope)?.name ?? scope),
        data: { scope, key: s.key },
      })),
    );
  }

  /** @param {import('../vfs/vfs.js').VfsNode} node */
  async function fileDoc(node) {
    /** @type {import('./search-index.js').SearchDoc} */
    const doc = {
      id: `file:${node.path}`,
      type: node.type === 'folder' ? 'folder' : 'file',
      title: node.name,
      subtitle: node.path,
      keywords: node.tags,
      data: { path: node.path },
    };
    if (node.type === 'file' && isTextMime(node.mime) && node.size <= MAX_INDEXED_FILE_BYTES) {
      try {
        doc.body = /** @type {string} */ (await vfs.readFile(node.path, { as: 'text' }));
      } catch {
        // Unreadable content: index the name only.
      }
    }
    return doc;
  }

  const excluded = (/** @type {string} */ path) => isInside('/.trash', path) || path === '/' || path === '/home';

  async function indexFiles() {
    const nodes = await vfs.walk(vfs.home);
    const docs = [];
    for (const node of nodes.slice(1)) if (!excluded(node.path)) docs.push(await fileDoc(node));
    await search.index(docs);
  }

  async function reindexAll() {
    await search.index([...registry.list().map(appDoc), ...commandDocs(), ...settingDocs()]);
  }

  /** @type {(() => void)[]} */
  const unsubs = [
    bus.on('app:registered', ({ id }) => {
      const m = registry.get(id);
      if (m) search.index([appDoc(m)]);
    }),
    bus.on('app:unregistered', ({ id }) => search.remove([`app:${id}`])),
    bus.on('app:enabled-changed', ({ id, enabled }) => {
      const m = registry.get(id);
      if (enabled && m) search.index([appDoc(m)]);
      else search.remove([`app:${id}`]);
    }),
    bus.on('commands:changed', () => {
      search.removePrefix('command:').then(() => search.index(commandDocs()));
    }),
    bus.on('i18n:changed', () => reindexAll()),
    bus.on('vfs:changed', async (change) => {
      try {
        if (change.oldPath) await search.removePrefix(`file:${change.oldPath}`);
        if (change.type === 'deleted' || change.type === 'trashed') {
          await search.removePrefix(`file:${change.path}`);
          return;
        }
        if (excluded(change.path)) return;
        // A moved/restored folder brings its whole subtree.
        const nodes =
          change.nodeType === 'folder' && change.type !== 'modified'
            ? await vfs.walk(change.path)
            : [await vfs.stat(change.path)];
        const docs = [];
        for (const node of nodes) if (node) docs.push(await fileDoc(node));
        await search.index(docs);
      } catch (error) {
        log.warn('Search: could not update file index', error);
      }
    }),
  ];

  return {
    /** Full initial index (files are indexed in the background). */
    async start() {
      await reindexAll();
      indexFiles().catch((error) => log.warn('Search: file indexing failed', error));
    },
    stop() {
      for (const u of unsubs) u();
    },
  };
}
