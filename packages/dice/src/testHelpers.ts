/**
 * Shared randomness helpers for tests -- this package's own, and any
 * consumer's. Exported publicly via the `@hearthtable/dice/testing`
 * subpath (see `package.json`'s `exports` map), separate from the package
 * root and `./pure`: this is test infrastructure, never meant to be
 * imported by production code, so it gets its own entry point rather than
 * living in `index.ts`/`pure.ts` where a stray import could slip through.
 */

import type { RandomSource } from './types.js';

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

/**
 * A small deterministic PRNG (mulberry32), seeded so the same seed always
 * produces the same roll sequence across runs and machines -- see
 * docs/dice.md, "The server rolls", and docs/golden-tests.md. Production
 * uses `cryptoRandomSource` (`rng.ts`); this exists purely for tests where
 * the exact sequence doesn't need to be hand-picked the way
 * `sequenceRandomSource`'s does, but does need to be reproducible -- a
 * golden character's strike roll being the main consumer.
 */
export function seededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return (faces: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(value * faces) + 1;
  };
}
