/**
 * @hearthtable/dice -- the dice expression parser and evaluator.
 *
 * System-agnostic: this package knows dice, arithmetic, keep/drop, and
 * rerolls. It does not know what a Strike is or how a DC is computed. See
 * docs/dice.md for the full specification.
 *
 * Re-exports everything from `pure.ts` plus `cryptoRandomSource`, the one
 * piece that needs `node:crypto` and is therefore server-only. An isomorphic
 * consumer that must never require Node's types to typecheck should import
 * from `@hearthtable/dice/pure` instead -- see that file's doc comment.
 */

export * from './pure.js';

export { cryptoRandomSource } from './rng.js';
