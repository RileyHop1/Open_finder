/**
 * The standard advancement tables: at which levels a character gets attribute
 * boosts, each kind of feat, and a skill increase. A class's own imported
 * data (`ClassEntry.advancement`) wins when present; these are the defaults
 * the derivation falls back to and what the tests pin.
 *
 * The levels are **(confirm)**: they match the pinned upstream class data
 * for every core-book class (milestone 8, A1) but have not been checked
 * against Archives of Nethys (`docs/character-build.md`, `docs/rulings.md`).
 * Rank-up levels (when a class improves a proficiency) are not here: upstream
 * does not carry them, and they land with the derivation that needs them.
 *
 * Pure data and arithmetic; none of it refuses anything (ADR 0023).
 */

import type { ClassAdvancement } from '../content/class.js';
import {
  BOOST_LEVELS,
  type BoostLevel,
  type FeatSlot,
} from '../content/characterBuild.js';

/** Boosts a player places at each boost level after the first: four, each on a different attribute. */
export const BOOSTS_PER_LEVEL = 4;

/** The boost levels after creation. */
export const ADVANCEMENT_BOOST_LEVELS: readonly BoostLevel[] = BOOST_LEVELS.filter(
  (level) => level > 1,
);

/** The standard levels, used when a class entry carries none of its own. */
export const STANDARD_ADVANCEMENT: ClassAdvancement = {
  ancestryFeatLevels: [1, 5, 9, 13, 17],
  classFeatLevels: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  generalFeatLevels: [3, 7, 11, 15, 19],
  skillFeatLevels: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  skillIncreaseLevels: [3, 5, 7, 9, 11, 13, 15, 17, 19],
};

/** A feat slot: which kind, and the level it opens at. */
export interface FeatSlotAt {
  readonly slot: FeatSlot;
  readonly level: number;
}

/** The levels, for `advancement` (or the standard set when a class has none). */
export function advancementFor(advancement?: ClassAdvancement): ClassAdvancement {
  return advancement ?? STANDARD_ADVANCEMENT;
}

/**
 * Every feat slot open by `level`, lowest level first and, within a level,
 * ancestry, class, skill, general. Archetype slots are not granted by level.
 */
export function featSlotsUpTo(
  level: number,
  advancement?: ClassAdvancement,
): FeatSlotAt[] {
  const a = advancementFor(advancement);
  const slots: FeatSlotAt[] = [
    ...a.ancestryFeatLevels.map((l) => ({ slot: 'ancestry' as const, level: l })),
    ...a.classFeatLevels.map((l) => ({ slot: 'class' as const, level: l })),
    ...a.skillFeatLevels.map((l) => ({ slot: 'skill' as const, level: l })),
    ...a.generalFeatLevels.map((l) => ({ slot: 'general' as const, level: l })),
  ];
  const order: Record<string, number> = { ancestry: 0, class: 1, skill: 2, general: 3 };
  return slots
    .filter((s) => s.level <= level)
    .sort((x, y) => x.level - y.level || (order[x.slot] ?? 0) - (order[y.slot] ?? 0));
}

/** The skill-increase levels reached by `level`. */
export function skillIncreasesUpTo(
  level: number,
  advancement?: ClassAdvancement,
): number[] {
  return advancementFor(advancement).skillIncreaseLevels.filter((l) => l <= level);
}

/** The boost levels (after creation) reached by `level`. */
export function boostLevelsUpTo(level: number): BoostLevel[] {
  return ADVANCEMENT_BOOST_LEVELS.filter((l) => l <= level);
}
