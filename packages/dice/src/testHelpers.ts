/**
 * Shared helpers for this package's own test files. Not exported from
 * index.ts -- this is test infrastructure, not public API.
 */

import type { RandomSource } from './rng.js';

/**
 * An RNG that returns a fixed, pre-scripted sequence of results, one per
 * call, in order. Lets a test pin exactly which dice come up which faces,
 * including for dice a reroll or a fortune pair produces, rather than
 * relying on a seeded PRNG's opaque output.
 */
export function sequenceRandomSource(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`sequenceRandomSource exhausted after ${index} call(s)`);
    }
    index += 1;
    return value;
  };
}

/** An RNG that fails loudly if called -- for asserting no dice were rolled at all. */
export function neverRoll(): number {
  throw new Error('rng should not have been called for a dice-free expression');
}
