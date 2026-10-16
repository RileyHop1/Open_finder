/**
 * What the creator's spells step offers a class (ADR 0025, `docs/spellcasting.md`):
 * whether it casts at all, from which tradition's list, how many cantrips it has,
 * and what its rank 1 picks are for. Pure; the step renders it and the picks go in
 * `build.spells`. Nothing is refused (ADR 0023): another tradition's list can be
 * browsed and picked from with a note, and more picks than the class has is a
 * warning on review, not a block.
 */

import {
  CASTER_TABLES,
  isCasterClass,
  type BuildRef,
  type MagicalTradition,
  type SpellPicks,
} from '@hearthtable/pf2e';

export const TRADITIONS: readonly MagicalTradition[] = [
  'arcane',
  'divine',
  'occult',
  'primal',
];

export interface CastingPlan {
  readonly kind: 'prepared' | 'spontaneous';
  /** The class's own list, or `undefined` when a class choice decides it (Witch, Sorcerer). */
  readonly tradition: MagicalTradition | undefined;
  /** The class choice that decides the tradition, when one does. */
  readonly traditionChoice: string | undefined;
  readonly cantrips: number;
  /** What the rank 1 picks are, in words, for the step's heading. */
  readonly rankedLabel: string;
}

/** The plan for `classSlug`, or `undefined` for a class that does not cast (or none yet). */
export function castingPlan(classSlug: string | undefined): CastingPlan | undefined {
  if (classSlug === undefined || !isCasterClass(classSlug)) {
    return undefined;
  }
  const table = CASTER_TABLES[classSlug];
  const fixed = typeof table.tradition === 'string' ? table.tradition : undefined;
  return {
    kind: table.kind,
    tradition: fixed,
    traditionChoice:
      typeof table.tradition === 'string' ? undefined : table.tradition.choice,
    cantrips: table.cantrips,
    rankedLabel:
      classSlug === 'wizard'
        ? 'Rank 1 spells in your spellbook'
        : table.kind === 'spontaneous'
          ? 'Rank 1 spells you know'
          : 'Rank 1 spells to prepare from',
  };
}

const same = (a: BuildRef, b: BuildRef) => a.packId === b.packId && a.slug === b.slug;

/** Whether `ref` is among `list`. */
export function isPicked(list: readonly BuildRef[], ref: BuildRef): boolean {
  return list.some((r) => same(r, ref));
}

/** `picks` with `ref` added to or removed from the `which` list. */
export function togglePick(
  picks: SpellPicks,
  which: keyof SpellPicks,
  ref: BuildRef,
): SpellPicks {
  const list = picks[which];
  return {
    ...picks,
    [which]: isPicked(list, ref) ? list.filter((r) => !same(r, ref)) : [...list, ref],
  };
}
