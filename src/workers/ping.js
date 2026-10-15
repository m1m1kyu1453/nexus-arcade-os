// @ts-check
// Ping/pong protocol used to prove that Web Workers start in every edition (incl. Lite on file://).

/**
 * @param {unknown} message
 * @returns {{ type: 'pong', id: number, worker: true } | null}
 */
export function handlePing(message) {
  if (!message || typeof message !== 'object') return null;
  const { type, id } = /** @type {{ type?: unknown, id?: unknown }} */ (message);
  if (type !== 'ping' || typeof id !== 'number') return null;
  return { type: 'pong', id, worker: true };
}
