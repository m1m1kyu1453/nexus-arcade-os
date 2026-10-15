// Built-in apps: every src/apps/<name>/manifest.js, loaded eagerly (manifests are small,
// data-only). App code stays in lazily loaded chunks.
/** @type {import('../kernel/types').AppManifest[]} */
export const builtInApps = Object.values(import.meta.glob('./*/manifest.js', { eager: true, import: 'default' }));
