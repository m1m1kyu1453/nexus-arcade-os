// Test manifests and modules.

/** A valid manifest; override any field. */
export function testManifest(overrides = {}) {
  return {
    id: 'test.app',
    name: { en: 'Test App', de: 'Test-App' },
    description: { en: 'An app for tests', de: 'Eine App für Tests' },
    version: '1.0.0',
    icon: 'app',
    category: 'system',
    load: async () => testModule(),
    ...overrides,
  };
}

/**
 * A module whose mount/unmount calls are recorded in `calls`.
 * @param {{ calls?: string[], mount?: Function }} [options]
 */
export function testModule({ calls = [], mount } = {}) {
  return {
    async mount(container, ctx, args) {
      calls.push(`mount:${ctx.app.instanceId}`);
      if (mount) return mount(container, ctx, args);
      container.textContent = `running ${ctx.app.id}`;
      return {
        unmount: () => calls.push(`unmount:${ctx.app.instanceId}`),
        onSuspend: () => calls.push(`suspend:${ctx.app.instanceId}`),
        onResume: () => calls.push(`resume:${ctx.app.instanceId}`),
        onIntent: (intent) => calls.push(`intent:${ctx.app.instanceId}:${intent.path}`),
      };
    },
  };
}
