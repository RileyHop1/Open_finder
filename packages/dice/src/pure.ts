/**
 * Everything in `@hearthtable/dice`'s public API except `cryptoRandomSource`,
 * which imports `node:crypto` and is server-only (see `rng.ts`). Import from
 * `@hearthtable/dice/pure` instead of the package root from any isomorphic
 * module that needs dice's types or its pure parsing/evaluation logic but
 * must never require Node's types to typecheck -- `packages/core` mirrors
 * `RollResult` for its `ChatMessage` schema this way, and a future
 * browser-side chat renderer reading a `RollResult`'s `terms` for the
 * hoverable breakdown (the north star) would do the same. `evaluate()` and
 * `evaluateDamage()` still work fine from here: they take a `RandomSource` as
 * a parameter rather than importing one, so a caller supplies its own (a
 * server passes `cryptoRandomSource` from the main entry point; a pure
 * consumer that only reads already-rolled results never calls them at all).
 *
 * The package root (`index.ts`) re-exports everything from here, plus
 * `cryptoRandomSource` -- this file is the single list both entry points
 * build on, not a second copy of it.
 */

export { parse } from './parser.js';
export type { ParseError, ParseErrorCode, ParseResult } from './parser.js';

export { evaluate } from './evaluator.js';
export type {
  EvaluateError,
  EvaluateErrorCode,
  EvaluateOptions,
  EvaluateResult,
} from './evaluator.js';

export { degreeOfSuccess } from './degreesOfSuccess.js';

export { evaluateDamage } from './damage.js';
export type {
  DamageComponent,
  DamageDoubling,
  EvaluateDamageError,
  EvaluateDamageErrorCode,
  EvaluateDamageOptions,
  EvaluateDamageResult,
} from './damage.js';

export {
  DEGREES_OF_SUCCESS,
  type ConstantTerm,
  type DamageByType,
  type DegreeOfSuccess,
  type DieTerm,
  type RandomSource,
  type ReferenceTerm,
  type RollResult,
  type RollTerm,
} from './types.js';
