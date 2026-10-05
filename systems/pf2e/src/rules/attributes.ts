/**
 * Attribute score math: the modifier a score produces, and how a boost or
 * flaw changes the score itself. Distinct from `content/common.ts`'s
 * `Attribute` type (just the six slugs) -- this module is what turns
 * character-creation choices into the numbers Stack D's other functions
 * (saves, skills, AC, ...) build statistics from.
 *
 * **Which boosts a character actually gets, and which score each targets,
 * is milestone 8's wizard**, not this module -- PF2e's "no two same-source
 * boosts on one score, except the four free ones" rule is a
 * character-creation *flow* constraint, not a property of what a single
 * boost does to a score. This module only has the latter.
 */

import type { Attribute } from '../content/common.js';

/** floor((score - 10) / 2) -- PF2e's standard score-to-modifier table. */
export function attributeModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * +2, except the **partial boost**: a score already at 18 or higher gains
 * only +1. Applies the same way regardless of the boost's source (ancestry,
 * background, class, or a free boost).
 */
export function applyBoost(score: number): number {
  return score >= 18 ? score + 1 : score + 2;
}

/** -2, unconditionally -- flaws have no partial-boost-style exception. */
export function applyFlaw(score: number): number {
  return score - 2;
}

/**
 * Display names for `content/common.ts`'s three-letter attribute slugs.
 * Used wherever an attribute's contribution to a statistic needs a real
 * label for the breakdown UI (ADR 0008's "show the math") rather than the
 * bare slug -- AC's Dexterity modifier and a save's own attribute are the
 * first two callers (`defenses.ts`).
 */
export const ATTRIBUTE_LABELS: Readonly<Record<Attribute, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
