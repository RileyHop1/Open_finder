/**
 * The parsed expression tree, per the grammar in docs/dice.md:
 *
 * ```
 * expression   := term (("+" | "-") term)*
 * term         := dice | integer | reference
 * dice         := count? "d" faces modifiers*
 * modifiers    := keep | drop | reroll | explode?
 * keep         := ("kh" | "kl") count?
 * drop         := ("dh" | "dl") count?
 * reroll       := "rr" comparison
 * reference    := "@" identifier
 * comparison   := ("<" | "<=" | "=" | ">=" | ">") integer
 * ```
 *
 * This module has no behavior -- it only shapes what the parser produces and
 * the evaluator consumes.
 */

export type Sign = '+' | '-';

/** A full expression: one or more signed terms summed together. */
export interface Expression {
  readonly kind: 'expression';
  readonly terms: readonly SignedTerm[];
}

/** A term with the sign that precedes it (the leading term is implicitly `+`). */
export interface SignedTerm {
  readonly sign: Sign;
  readonly term: Term;
}

export type Term = DiceExpr | IntegerExpr | ReferenceExpr;

/** A flat integer literal, e.g. the `7` in `1d20+7`. */
export interface IntegerExpr {
  readonly kind: 'integer';
  readonly value: number;
}

/** An `@name` reference, resolved by the evaluator against a caller-supplied context. */
export interface ReferenceExpr {
  readonly kind: 'reference';
  readonly name: string;
}

/** A dice roll, e.g. `2d6kh1` -- count 2, faces 6, one keep-highest modifier. */
export interface DiceExpr {
  readonly kind: 'dice';
  /** Defaults to 1 when the count is omitted from the source (e.g. `d20`). */
  readonly count: number;
  readonly faces: number;
  readonly modifiers: readonly DiceModifier[];
}

export type DiceModifier = KeepModifier | DropModifier | RerollModifier | ExplodeModifier;

export type KeepWhich = 'kh' | 'kl';
export type DropWhich = 'dh' | 'dl';

/** Keep the highest (`kh`) or lowest (`kl`) `count` dice; the rest are marked dropped. */
export interface KeepModifier {
  readonly kind: 'keep';
  readonly which: KeepWhich;
  /** Defaults to 1 when omitted (e.g. `2d20kh` keeps the single highest die). */
  readonly count: number;
}

/** Drop the highest (`dh`) or lowest (`dl`) `count` dice. */
export interface DropModifier {
  readonly kind: 'drop';
  readonly which: DropWhich;
  readonly count: number;
}

export type Comparator = '<' | '<=' | '=' | '>=' | '>';

/** Reroll any die matching `comparator value`, e.g. `rr<2` rerolls a 1. */
export interface RerollModifier {
  readonly kind: 'reroll';
  readonly comparator: Comparator;
  readonly value: number;
}

/**
 * Exploding dice (`!`). Recognized by the grammar so it parses cleanly, but
 * **not implemented in v1** -- PF2e has no exploding dice. `parse()` rejects
 * any expression containing one with a `code: 'unsupported-feature'` error
 * rather than silently ignoring it, so it cannot be added ad hoc later
 * without this comment being updated. See docs/dice.md, "Expression grammar".
 */
export interface ExplodeModifier {
  readonly kind: 'explode';
  /** Source offset of the `!`, so the "not supported" error can point at it. */
  readonly position: number;
}
