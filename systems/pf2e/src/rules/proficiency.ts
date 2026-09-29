/**
 * ADR 0008's `Modifier` for a proficiency rank at a given character level.
 * PC math only -- a creature's numbers (`content/creature.ts`) are already
 * the finished product straight from the book, with nothing left to
 * resolve through a rank.
 *
 * **Ruling (see `docs/rulings.md`):** untrained contributes a flat `+0`,
 * never the character's level; trained and above add level on top of the
 * rank's own bonus (`PROFICIENCY_BONUS`). This is the Remaster's *default*
 * math, not the optional Proficiency Without Level variant rule -- CLAUDE.md's
 * Content scope section excludes variant rules entirely, so there is no
 * toggle here, only the one behavior.
 */

import type { Modifier } from '@hearthtable/core';

import { PROFICIENCY_BONUS, type ProficiencyRank } from '../content/common.js';

const PROFICIENCY_LABELS: Readonly<Record<ProficiencyRank, string>> = {
  untrained: 'Untrained',
  trained: 'Trained',
  expert: 'Expert',
  master: 'Master',
  legendary: 'Legendary',
};

/**
 * `rank`'s contribution to a statistic at `level`: `0` for untrained,
 * otherwise `level + PROFICIENCY_BONUS[rank]`. Always enabled and
 * unconditional -- proficiency rank is a fixed fact about a character, not
 * something a predicate or a GM toggle turns on and off the way a feat's
 * modifier can be.
 */
export function proficiencyModifier(rank: ProficiencyRank, level: number): Modifier {
  return {
    slug: 'proficiency',
    label: PROFICIENCY_LABELS[rank],
    type: 'proficiency',
    value: rank === 'untrained' ? 0 : level + PROFICIENCY_BONUS[rank],
    source: 'proficiency',
    enabled: true,
  };
}
