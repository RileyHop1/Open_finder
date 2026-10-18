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
  CLASS_SPELL_GRANTS,
  fontAt,
  grantedSpells,
  isCasterClass,
  slotsAtLevel,
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
  /** How many rank 1 spells a spontaneous caster knows (its slots); `undefined` for a prepared caster, not counted yet. */
  readonly known: number | undefined;
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
    known:
      table.kind === 'spontaneous'
        ? Object.values(slotsAtLevel(table.slots, 1)).reduce((sum, n) => sum + n, 0)
        : undefined,
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

/** One spell the class gives by itself, and why, for the step to list. */
export interface ClassGift {
  readonly slug: string;
  readonly why: 'cantrip' | 'focus' | 'choice';
  /** For `choice`: the class choice that gave it (`muse`). */
  readonly choice?: string;
}

export interface ClassGifts {
  readonly spells: readonly ClassGift[];
  readonly focusPoints: number;
  /** Class choices that will add a spell once they are made (a Bard's muse). */
  readonly pending: readonly string[];
  /**
   * A font's extra slots at level 1 (a Cleric's Divine Font): the spell they hold
   * once the font is chosen, else every spell it could be.
   */
  readonly font:
    | {
        readonly name: string;
        readonly count: number;
        readonly spell: string | undefined;
        readonly options: readonly string[];
      }
    | undefined;
}

/** What `classSlug` gives by itself (`classSpells.ts` in the PF2e system), given the choices made so far. */
export function classGifts(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
): ClassGifts {
  const granted = grantedSpells(classSlug, classChoices);
  const byChoice =
    classSlug === undefined ? {} : (CLASS_SPELL_GRANTS[classSlug]?.byChoice ?? {});
  const fromChoices = Object.entries(byChoice).flatMap(([choice, byValue]) => {
    const chosen = classChoices[choice];
    return chosen === undefined
      ? []
      : (byValue[chosen] ?? []).map((slug) => ({ slug, why: 'choice' as const, choice }));
  });
  return {
    spells: [
      ...granted.cantrips.map((slug) => ({ slug, why: 'cantrip' as const })),
      ...granted.focusSpells.map((slug) => ({ slug, why: 'focus' as const })),
      ...fromChoices,
    ],
    focusPoints: granted.focusPoints,
    pending: [
      ...new Set([
        ...Object.keys(byChoice),
        ...Object.keys(
          classSlug === undefined
            ? {}
            : (CLASS_SPELL_GRANTS[classSlug]?.focusByChoice ?? {}),
        ),
      ]),
    ].filter((choice) => classChoices[choice] === undefined),
    font: fontGift(classSlug, classChoices),
  };
}

function fontGift(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
): ClassGifts['font'] {
  const font = fontAt(classSlug, classChoices, 1);
  const grant = classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug]?.font;
  return font === undefined || grant === undefined
    ? undefined
    : {
        name: font.name,
        count: font.count,
        spell: font.spell,
        options: Object.values(grant.spells),
      };
}

/** A class choice's key in words, for a sentence: `druidicOrder` -> `druidic order`, `divine-font` -> `divine font`. */
export function choiceWords(choice: string): string {
  return choice
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/-/g, ' ')
    .toLowerCase();
}
