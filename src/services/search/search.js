// @ts-check
// Search service: one query over the index (apps, commands, settings, files) plus results from
// app-provided search providers, ranked together. Usage (what the user opens) is remembered
// and boosts those items next time.
import { fuzzyMatch } from './fuzzy.js';

const PROVIDER_TIMEOUT_MS = 1500;

/**
 * @typedef {object} ProviderResult
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [icon]
 * @property {() => void | Promise<void>} run
 */

/**
 * @typedef {import('./search-index.js').SearchResult & { app?: string, run?: () => void | Promise<void> }} CombinedResult
 */

/**
 * @param {object} options
 * @param {import('./backend.js').SearchBackend} options.backend
 * @param {import('../../kernel/logger.js').Logger} options.log
 * @param {{ get(key: string): Promise<unknown>, set(key: string, value: unknown): Promise<void> }} options.store  usage stats
 */
export function createSearch({ backend, log, store }) {
  /** @type {Map<string, (query: string) => Promise<ProviderResult[]>>} */
  const providers = new Map();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let saveTimer;
  /** @type {Record<string, unknown> | null} */
  let pendingUsage = null;

  /**
   * @param {string} appId
   * @param {(query: string) => Promise<ProviderResult[]>} provider
   * @param {string} query
   * @returns {Promise<CombinedResult[]>}
   */
  async function runProvider(appId, provider, query) {
    try {
      const results = await Promise.race([
        provider(query),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timed out')), PROVIDER_TIMEOUT_MS)),
      ]);
      if (!Array.isArray(results)) return [];
      return results.slice(0, 20).flatMap((r, i) => {
        if (!r?.title || typeof r.run !== 'function') return [];
        const match = fuzzyMatch(query, r.title);
        return [
          {
            id: `provider:${appId}:${i}:${r.title}`,
            type: /** @type {const} */ ('command'),
            title: r.title,
            subtitle: r.subtitle,
            icon: r.icon,
            app: appId,
            run: r.run,
            // Providers already filtered for relevance: give them a floor below exact/prefix hits.
            score: Math.max(match?.score ?? 0, 350),
            titleRanges: match?.ranges ?? [],
          },
        ];
      });
    } catch (error) {
      log.warn(`Search provider of ${appId} failed`, error);
      return [];
    }
  }

  return {
    backendKind: backend.kind,

    /** Loads remembered usage into the index. */
    async load() {
      const usage = await store.get('usage');
      if (usage && typeof usage === 'object') await backend.call('setUsage', usage);
    },

    /** @param {import('./search-index.js').SearchDoc[]} docs */
    index: (docs) => backend.call('upsert', docs),
    /** @param {string[]} ids */
    remove: (ids) => backend.call('remove', ids),
    /** @param {string} prefix */
    removePrefix: (prefix) => backend.call('removePrefix', prefix),
    size: () => backend.call('size'),

    /**
     * @param {string} appId
     * @param {(query: string) => Promise<ProviderResult[]>} provider
     */
    registerProvider(appId, provider) {
      providers.set(appId, provider);
      return () => providers.delete(appId);
    },

    /**
     * @param {string} query
     * @param {{ limit?: number, types?: import('./search-index.js').SearchDoc['type'][], providers?: boolean }} [options]
     * @returns {Promise<CombinedResult[]>}
     */
    async query(query, { limit = 30, types, providers: useProviders = !types } = {}) {
      if (!query.trim()) return [];
      const [indexed, ...fromProviders] = await Promise.all([
        backend.call('query', query, { limit, types }),
        ...(useProviders ? [...providers].map(([appId, p]) => runProvider(appId, p, query)) : []),
      ]);
      return /** @type {CombinedResult[]} */ ([...indexed, ...fromProviders.flat()])
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },

    /**
     * Remembers that the user picked a result (boosts it in future searches).
     * @param {string} id
     */
    async recordUse(id) {
      pendingUsage = await backend.call('recordUse', id);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (pendingUsage) store.set('usage', pendingUsage).catch((e) => log.warn('Could not save search usage', e));
        pendingUsage = null;
      }, 1000);
    },
  };
}

/** @typedef {ReturnType<typeof createSearch>} Search */
