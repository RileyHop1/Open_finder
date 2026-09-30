/**
 * DCs: the three small reference tables the core rules build every
 * difficulty class from -- DCs by level, Simple DCs by proficiency rank,
 * and DC adjustments. Unlike the rest of Stack D, these are not
 * `Statistic`s: a DC has no contributing modifiers to break down, it is a
 * target number pulled straight from a published table, so a plain
 * `number` return is correct here rather than a violation of ADR 0008's
 * "never a bare number" rule (that rule is about *computed* totals losing
 * their explanation, not about static constants).
 *
 * All three tables are unambiguous RAW, not a judgment call -- no
 * `docs/rulings.md` entry needed.
 */

import type { ProficiencyRank } from '../content/common.js';

/**
 * "DCs by Level": the published table runs from level -1 through 20 only.
 * Nothing above or below that range has a published value, so `levelDc`
 * throws rather than extrapolating -- guessing a formula for it would be
 * exactly the silent-guess CLAUDE.md's Rulings section warns against.
 * Revisit if a golden creature above level 20 ever needs one.
 */
const DC_BY_LEVEL: Readonly<Record<number, number>> = {
  '-1': 13,
  0: 14,
  1: 15,
  2: 16,
  3: 18,
  4: 19,
  5: 20,
  6: 22,
  7: 23,
  8: 24,
  9: 26,
  10: 27,
  11: 28,
  12: 30,
  13: 31,
  14: 32,
  15: 34,
  16: 35,
  17: 36,
  18: 38,
  19: 39,
  20: 40,
};

/** The DC for a level-based check, per "DCs by Level". Throws for a level outside the published -1..20 range. */
export function levelDc(level: number): number {
  const dc = DC_BY_LEVEL[level];
  if (dc === undefined) {
    throw new RangeError(
      `levelDc: no published DC for level ${level} -- "DCs by Level" only covers levels -1 through 20`,
    );
  }
  return dc;
}

/** "Simple DCs": a flat DC by proficiency rank, used when a check has no natural level to key off of. */
const SIMPLE_DC_BY_RANK: Readonly<Record<ProficiencyRank, number>> = {
  untrained: 10,
  trained: 15,
  expert: 20,
  master: 30,
  legendary: 40,
};

/** The Simple DC for `rank`. */
export function simpleDc(rank: ProficiencyRank): number {
  return SIMPLE_DC_BY_RANK[rank];
}

/**
 * "DC Adjustments": the seven-step ladder from Incredibly Easy to
 * Incredibly Hard, centered on Normal (`+0`), that a GM applies on top of
 * either table above for an unusually easy or hard version of a check.
 */
export const DC_ADJUSTMENTS = [
  'incrediblyEasy',
  'veryEasy',
  'easy',
  'normal',
  'hard',
  'veryHard',
  'incrediblyHard',
] as const;

export type DcAdjustment = (typeof DC_ADJUSTMENTS)[number];

const DC_ADJUSTMENT_VALUES: Readonly<Record<DcAdjustment, number>> = {
  incrediblyEasy: -10,
  veryEasy: -5,
  easy: -2,
  normal: 0,
  hard: 2,
  veryHard: 5,
  incrediblyHard: 10,
};

/** Applies a "DC Adjustments" step to a base DC, e.g. from `levelDc` or `simpleDc`. */
export function adjustDc(dc: number, adjustment: DcAdjustment): number {
  return dc + DC_ADJUSTMENT_VALUES[adjustment];
}
