// @ts-check
// AI service interface. Phase 12 adds providers (Ollama, OpenAI-compatible servers). Until the
// user configures one, `isAvailable()` is false so apps hide AI features instead of faking them.

/**
 * @param {import('../../kernel/bus.js').EventBus} bus
 */
export function createAi(bus) {
  return {
    isAvailable: () => false,
    /** @param {(available: boolean) => void} fn */
    onAvailabilityChange: (fn) => bus.on('ai:availability-changed', (p) => fn(!!p?.available)),
  };
}

/** @typedef {ReturnType<typeof createAi>} Ai */
