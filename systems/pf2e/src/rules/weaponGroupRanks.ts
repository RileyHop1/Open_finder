/**
 * Weapon-group proficiencies a class has beyond its weapon categories
 * (`ranks.weaponGroups`, `docs/actor.md`): an Alchemist is trained in alchemical bombs,
 * expert from Alchemical Weapon Expertise (level 7) and master from Alchemical Weapon
 * Mastery (level 15). Upstream writes these as an effect on a base weapon
 * (`weapon-base-alchemical-bomb`), which our rule-element subset does not read, so they
 * are our own data. Every bomb in the core four books is an alchemical bomb, so the
 * `bomb` group stands for them (`docs/rulings.md`). Checked against the pinned upstream
 * data (2026-10-25), not Archives of Nethys. **(confirm)**
 */

import type { ProficiencyRank } from '../content/common.js';
import type { WeaponGroup } from '../content/weapon.js';

type Progression = readonly (readonly [level: number, rank: ProficiencyRank])[];

/** By class slug, then group: the rank from each level on, in rising order. */
export const CLASS_WEAPON_GROUP_RANKS: Readonly<
  Record<string, Readonly<Partial<Record<WeaponGroup, Progression>>>>
> = {
  alchemist: {
    bomb: [
      [1, 'trained'],
      [7, 'expert'],
      [15, 'master'],
    ],
  },
};

/** The weapon-group ranks `classSlug` has at `level`; none for a class with no row. */
export function classWeaponGroupRanks(
  classSlug: string | undefined,
  level: number,
): Partial<Record<WeaponGroup, ProficiencyRank>> {
  const groups =
    classSlug === undefined ? undefined : CLASS_WEAPON_GROUP_RANKS[classSlug];
  const ranks: Partial<Record<WeaponGroup, ProficiencyRank>> = {};
  for (const [group, progression] of Object.entries(groups ?? {}) as [
    WeaponGroup,
    Progression,
  ][]) {
    const rank = progression.filter(([from]) => level >= from).at(-1)?.[1];
    if (rank !== undefined) {
      ranks[group] = rank;
    }
  }
  return ranks;
}
