/**
 * The evaluator's randomness source. Injected rather than called directly, so
 * production can use a cryptographically strong generator while tests use a
 * seeded, deterministic one -- see docs/dice.md, "The server rolls".
 */

import { randomInt } from 'node:crypto';

/** Rolls one die with the given number of faces, returning a value in [1, faces]. */
export type RandomSource = (faces: number) => number;

/**
 * The production randomness source: cryptographically strong, uniform over
 * [1, faces].
 *
 * This module imports `node:crypto`, so it is meant for server-side use only
 * -- per docs/dice.md, "dice are rolled on the server, never on the client."
 * Kept in its own file, separate from `evaluator.ts`, so that a client bundle
 * which never imports `cryptoRandomSource` specifically has no reason to pull
 * in a Node built-in with no browser equivalent.
 */
export const cryptoRandomSource: RandomSource = (faces) => randomInt(1, faces + 1);
