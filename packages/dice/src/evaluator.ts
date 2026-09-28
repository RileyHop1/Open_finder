/**
 * The evaluation core: walks a parsed `Expression` and produces a
 * `RollResult`. Basic dice, arithmetic, and `@reference` resolution only --
 * keep/drop/reroll, fortune/misfortune, degrees of success, and damage each
 * land in their own later PR (see docs/dice.md and the plan). Never throws.
 */

import type { DiceExpr, Expression, SignedTerm } from './ast.js';
import type { RandomSource } from './rng.js';
import type {
  ConstantTerm,
  DieTerm,
  ReferenceTerm,
  RollResult,
  RollTerm,
} from './types.js';

export type EvaluateErrorCode = 'unknown-reference' | 'unsupported-modifiers';

export interface EvaluateError {
  readonly code: EvaluateErrorCode;
  readonly message: string;
}

export type EvaluateResult =
  | { readonly ok: true; readonly result: RollResult }
  | { readonly ok: false; readonly error: EvaluateError };

export interface EvaluateOptions {
  /** Resolves an `@reference` to its value. Required only if the expression uses one. */
  readonly resolveReference?: (name: string) => number | undefined;
  /** Produces a die roll for a given face count. Pass `cryptoRandomSource` in
   *  production; tests pass a seeded source so results are reproducible. */
  readonly rng: RandomSource;
  /** Echoed into the result's `seed` field, for a test to label a deterministic run. */
  readonly seed?: string;
}

type TermOutcome =
  | { readonly ok: true; readonly terms: readonly RollTerm[] }
  | { readonly ok: false; readonly error: EvaluateError };

/**
 * True if any dice term in the expression carries a keep/drop/reroll/explode
 * modifier. `parse()` already rejects `!` on its own, but `kh`/`kl`/`dh`/`dl`/
 * `rr` parse successfully -- they just aren't implemented here yet.
 */
function hasUnsupportedModifiers(expression: Expression): boolean {
  return expression.terms.some(
    ({ term }) => term.kind === 'dice' && term.modifiers.length > 0,
  );
}

function rollDice(dice: DiceExpr, factor: 1 | -1, rng: RandomSource): readonly DieTerm[] {
  const terms: DieTerm[] = [];
  for (let i = 0; i < dice.count; i += 1) {
    const result = rng(dice.faces);
    terms.push({
      kind: 'die',
      faces: dice.faces,
      result,
      kept: true,
      value: result * factor,
    });
  }
  return terms;
}

function evaluateSignedTerm(
  signedTerm: SignedTerm,
  options: EvaluateOptions,
): TermOutcome {
  const { sign, term } = signedTerm;
  const factor: 1 | -1 = sign === '-' ? -1 : 1;

  if (term.kind === 'integer') {
    const constant: ConstantTerm = { kind: 'constant', value: term.value * factor };
    return { ok: true, terms: [constant] };
  }

  if (term.kind === 'reference') {
    const resolved = options.resolveReference?.(term.name);
    if (resolved === undefined) {
      return {
        ok: false,
        error: {
          code: 'unknown-reference',
          message: `no value was supplied for @${term.name}`,
        },
      };
    }
    const reference: ReferenceTerm = {
      kind: 'reference',
      name: term.name,
      value: resolved * factor,
    };
    return { ok: true, terms: [reference] };
  }

  return { ok: true, terms: rollDice(term, factor, options.rng) };
}

/**
 * Evaluates a parsed expression against `options`. `source` is the original
 * expression text, echoed verbatim into the result's `expression` field --
 * see docs/dice.md, "Return shape".
 *
 * Trusts `expression` to be well-formed (as `parse()` produces it); it does
 * not re-validate structural invariants like "faces >= 1".
 */
export function evaluate(
  source: string,
  expression: Expression,
  options: EvaluateOptions,
): EvaluateResult {
  if (hasUnsupportedModifiers(expression)) {
    return {
      ok: false,
      error: {
        code: 'unsupported-modifiers',
        message:
          'keep/drop/reroll modifiers are not yet implemented by evaluate() -- see docs/dice.md',
      },
    };
  }

  const terms: RollTerm[] = [];
  for (const signedTerm of expression.terms) {
    const outcome = evaluateSignedTerm(signedTerm, options);
    if (!outcome.ok) {
      return outcome;
    }
    terms.push(...outcome.terms);
  }

  const total = terms.reduce((sum, term) => sum + term.value, 0);

  const result: RollResult =
    options.seed === undefined
      ? { expression: source, total, terms }
      : { expression: source, total, terms, seed: options.seed };

  return { ok: true, result };
}
