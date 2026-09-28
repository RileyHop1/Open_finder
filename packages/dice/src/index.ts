/**
 * @hearthtable/dice -- the dice expression parser and evaluator.
 *
 * System-agnostic: this package knows dice, arithmetic, keep/drop, and
 * rerolls. It does not know what a Strike is or how a DC is computed. See
 * docs/dice.md for the full specification.
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

export { cryptoRandomSource } from './rng.js';
export type { RandomSource } from './rng.js';

export {
  DEGREES_OF_SUCCESS,
  type ConstantTerm,
  type DamageByType,
  type DegreeOfSuccess,
  type DieTerm,
  type ReferenceTerm,
  type RollResult,
  type RollTerm,
} from './types.js';
