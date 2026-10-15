// Search index worker: keeps the index and ranking off the main thread.
import { createSearchIndex } from '../services/search/search-index.js';
import { exposeRpc } from './rpc.js';

const index = createSearchIndex();

exposeRpc(self, {
  upsert: (docs) => index.upsert(docs),
  remove: (ids) => index.remove(ids),
  removePrefix: (prefix) => index.removePrefix(prefix),
  query: (query, options) => index.query(query, options),
  recordUse: (id) => index.recordUse(id),
  setUsage: (entries) => index.setUsage(entries),
  size: () => index.size,
});
