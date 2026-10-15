import { describe, expect, it } from 'vitest';
import { handlePing } from '../../src/workers/ping.js';

describe('ping worker protocol', () => {
  it('answers a ping with a pong carrying the same id', () => {
    expect(handlePing({ type: 'ping', id: 7 })).toEqual({ type: 'pong', id: 7, worker: true });
  });

  it.each([null, undefined, 'ping', 42, {}, { type: 'pong', id: 1 }, { type: 'ping', id: '1' }])(
    'ignores invalid message %j',
    (message) => {
      expect(handlePing(message)).toBeNull();
    },
  );
});
