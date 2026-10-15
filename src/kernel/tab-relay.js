// @ts-check
// Forwards selected bus events to other tabs of the same profile (BroadcastChannel) and
// re-emits events from other tabs locally with `remote: true` in the payload, so views stay in
// sync when the same profile is open twice. Remote events are never forwarded again (no loops).

/**
 * @param {object} options
 * @param {import('./bus.js').EventBus} options.bus
 * @param {string} options.channel        e.g. 'nexus:profile:<id>'
 * @param {string[]} options.prefixes     event types to relay, e.g. ['storage:', 'vfs:']
 * @param {typeof BroadcastChannel | null} [options.BroadcastChannelImpl]  null disables relaying
 * @returns {{ close(): void }}
 */
export function createTabRelay({ bus, channel, prefixes, BroadcastChannelImpl = globalThis.BroadcastChannel }) {
  if (!BroadcastChannelImpl) return { close() {} };
  const bc = new BroadcastChannelImpl(channel);
  const unsubs = prefixes.map((prefix) =>
    bus.on(`${prefix}*`, (payload, type) => {
      if (payload?.remote) return;
      try {
        bc.postMessage({ type, payload });
      } catch {
        // Payload not cloneable: relaying is best-effort.
      }
    }),
  );
  bc.onmessage = (event) => {
    const { type, payload } = event.data ?? {};
    if (typeof type !== 'string' || !prefixes.some((p) => type.startsWith(p))) return;
    bus.emit(type, { ...(payload ?? {}), remote: true });
  };
  return {
    close() {
      for (const u of unsubs) u();
      bc.close();
    },
  };
}
