import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/kernel/bus.js';
import { createBoundary } from '../../src/kernel/error-boundary.js';
import { liveWorkers, trackWorkers } from '../../src/kernel/workers.js';
import { createNetworkLog } from '../../src/services/network/network.js';

describe('busy time per window', () => {
  it('sums time in guarded callbacks, counting nested ones once', () => {
    let clock = 0;
    const boundary = createBoundary({ onCrash: () => {}, now: () => clock });
    const inner = boundary.wrap(() => {
      clock += 3;
    });
    const outer = boundary.wrap(() => {
      clock += 2;
      inner();
    });
    outer();
    expect(boundary.busyMs).toBe(5);
    boundary.wrap(() => {
      clock += 4;
      throw new Error('boom');
    })();
    expect(boundary.busyMs).toBe(9);
  });
});

describe('network log', () => {
  it('records requests newest first with status and duration', () => {
    let now = 100;
    const bus = createEventBus();
    const changes = [];
    bus.on('network:changed', (p) => changes.push(p));
    const log = createNetworkLog({ bus, now: () => now });
    const a = log.start({ app: 'nexus.http', url: 'https://example.com/a', method: 'post' });
    now = 160;
    a.done({ status: 201 });
    log.start({ app: 'nexus.ai', url: 'http://localhost:11434' }).done({ error: 'Failed to fetch' });
    expect(log.list().map((r) => [r.method, r.status, r.ms, r.error])).toEqual([
      ['GET', null, 0, 'Failed to fetch'],
      ['POST', 201, 60, null],
    ]);
    log.clear();
    expect(log.list()).toEqual([]);
    expect(changes.length).toBe(5);
  });
});

describe('worker tracker', () => {
  it('counts constructed workers until they are terminated', () => {
    class FakeWorker {
      constructor(url, options) {
        this.url = url;
        this.options = options;
      }
      terminate() {}
    }
    const scope = /** @type {any} */ ({ Worker: FakeWorker });
    trackWorkers(scope);
    const w = new scope.Worker('/assets/search.worker-abc.js?worker_file', { name: 'search' });
    new scope.Worker('blob:http://x/123');
    expect(liveWorkers().map((x) => x.name)).toEqual(['search', 'inline worker']);
    w.terminate();
    expect(liveWorkers().map((x) => x.name)).toEqual(['inline worker']);
  });
});
