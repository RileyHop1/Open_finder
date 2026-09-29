/**
 * Shared value types for `@hearthtable/dice`.
 *
 * These describe the package's public contract -- what a parsed and evaluated
 * roll looks like -- independent of how parsing or evaluation is implemented.
 * See docs/dice.md, "Return shape".
 */

/**
 * The evaluator's randomness source type. Deliberately kept here rather than
 * in `rng.ts` alongside its only concrete implementation
 * (`cryptoRandomSource`): this file has no imports and needs none, while
 * `rng.ts` imports `node:crypto` for that implementation. A module that only
 * needs the *type* -- `evaluator.ts`, `damage.ts`, and an isomorphic package
 * like `packages/core` mirroring `RollResult` for its `ChatMessage` schema --
 * can import it from here without ever pulling `node:crypto`'s types into a
 * project (such as `apps/client`'s, or `packages/core`'s own standalone
 * typecheck) that doesn't configure them. See `rng.ts` and `pure.ts`.
 */
export type RandomSource = (faces: number) => number;

/**
 * One die or constant that contributed to a roll's total.
 *
 * Dice dropped by `kh`/`kl`/`dh`/`dl` are retained here with `kept: false`,
 * never removed from the list -- seeing the die that was discarded is most of
 * the point of showing the math. See docs/dice.md, "Fortune and misfortune"
 * and "Return shape".
 */
export type RollTerm = DieTerm | ConstantTerm | ReferenceTerm;

/** A single rolled die. */
export interface DieTerm {
  readonly kind: 'die';
  /** Number of sides on this die. */
  readonly faces: number;
  /** The face that came up. */
  readonly result: number;
  /** False when suppressed by a keep/drop modifier; the term is kept in the list regardless. */
  readonly kept: boolean;
  /** This term's contribution to the total: `result` if kept, `0` if dropped. */
  readonly value: number;
}

/** A flat integer written directly in the expression (e.g. the `+4` in `2d6+4`). */
export interface ConstantTerm {
  readonly kind: 'constant';
  readonly value: number;
}

/** A resolved `@reference` (e.g. `@perception`). */
export interface ReferenceTerm {
  readonly kind: 'reference';
  readonly name: string;
  readonly value: number;
}

/**
 * The four-value degree-of-success ladder, ordered from worst to best so that
 * shifting by +/-1 (the natural-20/natural-1 rule) is just index arithmetic.
 * See docs/dice.md, "Degrees of success".
 */
export const DEGREES_OF_SUCCESS = [
  'criticalFailure',
  'failure',
  'success',
  'criticalSuccess',
] as const;

export type DegreeOfSuccess = (typeof DEGREES_OF_SUCCESS)[number];

/**
 * Damage bucketed by type (e.g. `{ piercing: 8, fire: 2 }`).
 *
 * The type key is a caller-supplied string, not a closed enum -- this package
 * is system-agnostic and does not know PF2e's damage type list. See
 * docs/dice.md, "Damage".
 */
export type DamageByType = Readonly<Record<string, number>>;

/**
 * The structured result of evaluating a roll expression. This is what
 * `ChatMessage` stores -- never a rendered string. See docs/dice.md,
 * "Return shape", and the ChatMessage rule in CLAUDE.md.
 *
 * `degree`, `natural`, `damage`, and `seed` are only present when they apply;
 * under `exactOptionalPropertyTypes` they must be omitted, never set to
 * `undefined`.
 */
export interface RollResult {
  /** The expression as written. */
  readonly expression: string;
  readonly total: number;
  readonly terms: readonly RollTerm[];
  /** Present when the roll was evaluated against a DC. */
  readonly degree?: DegreeOfSuccess;
  /** The d20 face rolled, present when this was a d20 check (for the nat-20/nat-1 rule). */
  readonly natural?: number;
  /** Present for damage rolls. */
  readonly damage?: DamageByType;
  /** Present only in test builds, to make a result's determinism inspectable. */
  readonly seed?: string;
}
