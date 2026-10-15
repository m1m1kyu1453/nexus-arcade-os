import { describe, expect, it } from 'vitest';
import {
  compareKeys,
  encodeKey,
  evaluateKeyPath,
  indexKeys,
  injectKey,
  inRange,
  isValidKey,
} from '../../src/services/storage/keys.js';

// fake-indexeddb implements the spec's comparison; our engines must agree with it.
const samples = [
  -Infinity,
  -1,
  0,
  1.5,
  Infinity,
  new Date(0),
  new Date(1000),
  '',
  'A',
  'a',
  'ab',
  'é',
  new Uint8Array([1]).buffer,
  new Uint8Array([1, 0]).buffer,
  new Uint8Array([2]).buffer,
  [],
  [1],
  [1, 'a'],
  ['a'],
  [[1]],
];

describe('storage keys', () => {
  it('orders keys exactly like indexedDB.cmp', () => {
    for (const a of samples) {
      for (const b of samples) {
        expect(compareKeys(a, b), `${String(a)} vs ${String(b)}`).toBe(indexedDB.cmp(a, b));
      }
    }
  });

  it('validates keys', () => {
    for (const key of samples) expect(isValidKey(key)).toBe(true);
    for (const bad of [NaN, new Date(NaN), null, undefined, {}, true, [1, {}], () => {}]) {
      expect(isValidKey(bad), String(bad)).toBe(false);
    }
  });

  it('encodes equal keys to equal strings and different keys to different strings', () => {
    expect(encodeKey(0)).toBe(encodeKey(-0));
    expect(encodeKey([1, 'a'])).toBe(encodeKey([1, 'a']));
    const encoded = new Set(samples.map(encodeKey));
    expect(encoded.size).toBe(samples.length);
    expect(encodeKey('1')).not.toBe(encodeKey(1));
  });

  it('evaluates and injects key paths', () => {
    const value = { id: 7, meta: { tags: ['x', 'y', 'x'] }, a: 'A' };
    expect(evaluateKeyPath(value, 'id')).toBe(7);
    expect(evaluateKeyPath(value, 'meta.tags')).toEqual(['x', 'y', 'x']);
    expect(evaluateKeyPath(value, ['a', 'id'])).toEqual(['A', 7]);
    expect(evaluateKeyPath(value, 'missing.path')).toBeUndefined();
    expect(evaluateKeyPath(value, ['a', 'missing'])).toBeUndefined();
    const target = {};
    injectKey(target, 'x.y', 3);
    expect(target).toEqual({ x: { y: 3 } });
  });

  it('computes index keys, including multiEntry de-duplication', () => {
    const value = { tags: ['x', 'y', 'x', {}], n: 5 };
    expect(indexKeys(value, { keyPath: 'tags', multiEntry: true })).toEqual(['x', 'y']);
    expect(indexKeys(value, { keyPath: 'tags' })).toEqual([]); // array with an invalid member
    expect(indexKeys(value, { keyPath: 'n' })).toEqual([5]);
    expect(indexKeys(value, { keyPath: 'missing' })).toEqual([]);
  });

  it('checks ranges', () => {
    expect(inRange(5, { only: 5 })).toBe(true);
    expect(inRange(5, { lower: 5, lowerOpen: true })).toBe(false);
    expect(inRange(5, { lower: 1, upper: 5 })).toBe(true);
    expect(inRange(5, { upper: 5, upperOpen: true })).toBe(false);
    expect(inRange('b', { lower: 'a', upper: 'a￿' })).toBe(false);
    expect(inRange('ab', { lower: 'a', upper: 'a￿' })).toBe(true);
    expect(inRange(1, undefined)).toBe(true);
  });
});
