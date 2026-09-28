/**
 * The evaluation core: walks a parsed `Expression` and produces a
 * `RollResult`. Dice, arithmetic, `@reference` resolution, keep/drop/reroll
 * modifiers, and fortune/misfortune. Degrees of success and damage each land
 * in their own later PR (see docs/dice.md and the plan). Never throws.
 */

import type {
  Comparator,
  DiceExpr,
  DiceModifier,
  DropModifier,
  Expression,
  KeepModifier,
  RerollModifier,
  SignedTerm,
} from './ast.js';
import type { RandomSource } from './rng.js';
import type {
  ConstantTerm,
  DieTerm,
  ReferenceTerm,
  RollResult,
  RollTerm,
} from './types.js';

export type EvaluateErrorCode = 'unknown-reference';

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
  /**
   * A fortune effect is active on this roll: every die is rolled twice and
   * the higher result is kept. Cancels with `misfortune` if both are set --
   * see docs/dice.md, "Fortune and misfortune". A boolean, not a count,
   * because PF2e itself never lets a second fortune effect stack; there is
   * nothing to represent beyond "at least one is active".
   */
  readonly fortune?: boolean;
  /** A misfortune effect is active: every die is rolled twice and the lower is kept. */
  readonly misfortune?: boolean;
  /** Echoed into the result's `seed` field, for a test to label a deterministic run. */
  readonly seed?: string;
}

/** The resolved outcome of `fortune`/`misfortune` once cancellation is applied. */
type RollMode = 'normal' | 'fortune' | 'misfortune';

/**
 * Resolves the raw `fortune`/`misfortune` flags per docs/dice.md: a second
 * effect of the same kind never stacks (there is nothing to stack -- both
 * flags are booleans), and one of each cancels back to a normal roll.
 */
function resolveRollMode(options: EvaluateOptions): RollMode {
  const fortune = options.fortune ?? false;
  const misfortune = options.misfortune ?? false;
  if (fortune === misfortune) {
    return 'normal'; // neither set, or both set and cancelling
  }
  return fortune ? 'fortune' : 'misfortune';
}

type TermOutcome =
  | { readonly ok: true; readonly terms: readonly RollTerm[] }
  | { readonly ok: false; readonly error: EvaluateError };

/**
 * Reads `array[index]`, asserting it is present. Every call site here passes
 * an index this module generated itself and knows is in range (from a `map`
 * over the same array, or from indices pushed while building `terms`) --
 * this exists only to satisfy `noUncheckedIndexedAccess` without an `as`
 * cast. Throwing here means an invariant this module maintains internally
 * was violated, never that the caller supplied bad input.
 */
function at<T>(array: readonly T[], index: number): T {
  const value = array[index];
  if (value === undefined) {
    throw new Error(`internal error: index ${index} out of bounds`);
  }
  return value;
}

function matchesComparator(
  result: number,
  comparator: Comparator,
  value: number,
): boolean {
  switch (comparator) {
    case '<':
      return result < value;
    case '<=':
      return result <= value;
    case '=':
      return result === value;
    case '>=':
      return result >= value;
    case '>':
      return result > value;
  }
}

/**
 * Applies one `kh`/`kl`/`dh`/`dl` modifier to the currently-active dice,
 * marking the losing dice `kept: false` in place. Returns the indices that
 * remain active for any modifier still to come.
 *
 * Ties are broken by original roll order (`Array.sort` is stable), which is
 * an arbitrary but deterministic choice -- docs/dice.md does not specify
 * tie-breaking, and PF2e itself doesn't need to, since keep/drop only ever
 * matters for the total, not for which physical die "was" the third-highest.
 */
function applyKeepOrDrop(
  terms: DieTerm[],
  active: readonly number[],
  modifier: KeepModifier | DropModifier,
): number[] {
  const descending = modifier.which === 'kh' || modifier.which === 'dh';
  const sorted = [...active].sort((a, b) =>
    descending
      ? at(terms, b).result - at(terms, a).result
      : at(terms, a).result - at(terms, b).result,
  );
  const selectedCount = Math.min(modifier.count, sorted.length);
  const selected = new Set(sorted.slice(0, selectedCount));

  const dropsSelected = modifier.kind === 'drop';
  const remaining: number[] = [];
  for (const index of active) {
    const drop = dropsSelected ? selected.has(index) : !selected.has(index);
    if (drop) {
      terms[index] = { ...at(terms, index), kept: false };
    } else {
      remaining.push(index);
    }
  }
  return remaining;
}

/**
 * Applies one `rr<comparator><value>` modifier: any active die matching the
 * comparator is rerolled exactly once (never re-checked against the same
 * comparator again -- PF2e reroll effects are single-shot, and re-checking
 * would also risk looping forever on a comparator like `rr<20`). The
 * original die is marked `kept: false`, and the new roll is appended to the
 * end of `terms` as its own die, per docs/dice.md: dropped and replaced dice
 * are retained, never filtered out.
 */
function applyReroll(
  terms: DieTerm[],
  active: readonly number[],
  modifier: RerollModifier,
  faces: number,
  rng: RandomSource,
): number[] {
  const remaining: number[] = [];
  for (const index of active) {
    const term = at(terms, index);
    if (matchesComparator(term.result, modifier.comparator, modifier.value)) {
      terms[index] = { ...term, kept: false };
      const result = rng(faces);
      terms.push({ kind: 'die', faces, result, kept: true, value: 0 });
      remaining.push(terms.length - 1);
    } else {
      remaining.push(index);
    }
  }
  return remaining;
}

/**
 * Applies `modifiers` to `terms` in the order they appear in the expression,
 * each acting on whatever is still active after the previous one -- docs/
 * dice.md specifies each modifier's own effect but not a chain's evaluation
 * order, so left-to-right (matching how they read, and how other VTT dice
 * tools resolve a modifier chain) is the interpretation this evaluator uses.
 * Once a die is dropped it is not reconsidered by a later modifier.
 *
 * Mutates and returns `terms`; `explode` can never appear here, since
 * `parse()` already rejects it before an expression reaches `evaluate()`.
 *
 * `terms` may already contain entries marked `kept: false` on arrival (a
 * fortune/misfortune roll discards one die of each pair before this ever
 * runs) -- only the still-kept entries start out active, so a modifier
 * chain never reconsiders a die fortune/misfortune already decided against.
 */
function applyDiceModifiers(
  terms: DieTerm[],
  modifiers: readonly DiceModifier[],
  faces: number,
  rng: RandomSource,
): DieTerm[] {
  let active = terms.flatMap((term, index) => (term.kept ? [index] : []));

  for (const modifier of modifiers) {
    if (modifier.kind === 'keep' || modifier.kind === 'drop') {
      active = applyKeepOrDrop(terms, active, modifier);
    } else if (modifier.kind === 'reroll') {
      active = applyReroll(terms, active, modifier, faces, rng);
    }
  }

  return terms;
}

/**
 * Rolls one die position under the given roll mode. Under `fortune` or
 * `misfortune` this rolls twice and keeps the higher or lower face; the
 * discarded roll is still returned, marked `kept: false`, for the same
 * reason a dropped or rerolled-away die is: seeing what fortune passed over
 * is most of the point of showing the math (docs/dice.md).
 *
 * A tie keeps the first roll -- which of two identical faces is "the" kept
 * one is arbitrary by definition, so this just needs to be deterministic.
 */
function rollOnePosition(faces: number, rng: RandomSource, mode: RollMode): DieTerm[] {
  if (mode === 'normal') {
    const result = rng(faces);
    return [{ kind: 'die', faces, result, kept: true, value: 0 }];
  }

  const first = rng(faces);
  const second = rng(faces);
  const firstIsKept = mode === 'fortune' ? first >= second : first <= second;
  const [keptResult, discardedResult] = firstIsKept ? [first, second] : [second, first];

  return [
    { kind: 'die', faces, result: keptResult, kept: true, value: 0 },
    { kind: 'die', faces, result: discardedResult, kept: false, value: 0 },
  ];
}

function rollDice(
  dice: DiceExpr,
  factor: 1 | -1,
  rng: RandomSource,
  rollMode: RollMode,
): readonly DieTerm[] {
  const rolled: DieTerm[] = [];
  for (let i = 0; i < dice.count; i += 1) {
    // `value` is finalized below, once keep/drop/reroll have settled which
    // dice actually count.
    rolled.push(...rollOnePosition(dice.faces, rng, rollMode));
  }

  const settled = applyDiceModifiers(rolled, dice.modifiers, dice.faces, rng);

  return settled.map((term) => ({
    ...term,
    value: term.kept ? term.result * factor : 0,
  }));
}

function evaluateSignedTerm(
  signedTerm: SignedTerm,
  options: EvaluateOptions,
  rollMode: RollMode,
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

  return { ok: true, terms: rollDice(term, factor, options.rng, rollMode) };
}

/**
 * Evaluates a parsed expression against `options`. `source` is the original
 * expression text, echoed verbatim into the result's `expression` field --
 * see docs/dice.md, "Return shape".
 *
 * `fortune`/`misfortune`, once resolved, apply to every die in the
 * expression uniformly -- this evaluator has no notion of "the check die" to
 * single one out (that would mean knowing faces === 20 is special, which is
 * PF2e-specific knowledge a system-agnostic package should not have). In
 * practice a check expression has exactly one die, so this is equivalent to
 * "fortune applies to the check" without this package needing to know what a
 * check is.
 *
 * Trusts `expression` to be well-formed (as `parse()` produces it); it does
 * not re-validate structural invariants like "faces >= 1".
 */
export function evaluate(
  source: string,
  expression: Expression,
  options: EvaluateOptions,
): EvaluateResult {
  const rollMode = resolveRollMode(options);

  const terms: RollTerm[] = [];
  for (const signedTerm of expression.terms) {
    const outcome = evaluateSignedTerm(signedTerm, options, rollMode);
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
