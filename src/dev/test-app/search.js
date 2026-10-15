/** @type {import('../../kernel/types').SearchProvider} */
export default async function search(query, ctx) {
  const items = await ctx.storage.collection('items').all();
  const q = query.toLowerCase();
  return items
    .filter((item) => item.title.toLowerCase().includes(q))
    .map((item) => ({ title: item.title, subtitle: 'Kernel Test', run: () => ctx.intents.open(item.path) }));
}
