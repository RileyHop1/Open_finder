/**
 * What the creator's spells step offers a class (ADR 0025, `docs/spellcasting.md`):
 * whether it casts at all, from which tradition's list, how many cantrips it has,
 * and what its rank 1 picks are for. Pure; the step renders it and the picks go in
 * `build.spells`. Nothing is refused (ADR 0023): another tradition's list can be
 * browsed and picked from with a note, and more picks than the class has is a
 * warning on review, not a block.
 */

import {
  bookFor,
  CASTER_TABLES,
  CLASS_SPELL_GRANTS,
  curriculumBookSpells,
  curriculumFor,
  fontAt,
  grantedSpells,
  isCasterClass,
  slotsAtLevel,
  spellChoicesFor,
  traditionFor,
  type BuildRef,
  type ClassFeatureEntry,
  type MagicalTradition,
  type OfferedSpellChoice,
  type SpellBook,
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
  /** The class's list, or `undefined` while the class choice that decides it is unmade (or decides nothing yet). */
  readonly tradition: MagicalTradition | undefined;
  /** The class choice that decides the tradition, when one does (a Witch's patron). */
  readonly traditionChoice: string | undefined;
  /** How many cantrips to choose: the class's, or its book's (a Wizard's spellbook holds 10). */
  readonly cantrips: number;
  /** How many of those start prepared, for a book caster (the first 5 picked); else `undefined`. */
  readonly preparedCantrips: number | undefined;
  /**
   * How many rank 1 spells to choose: a spontaneous caster's repertoire (its slots), or
   * a book caster's book (a school Wizard's curriculum spells included); `undefined` for
   * another prepared caster, which is not counted.
   */
  readonly known: number | undefined;
  /** The book a prepared caster prepares from, for the step's words. */
  readonly book: SpellBook | undefined;
  /** What the rank 1 picks are, in words, for the step's heading. */
  readonly rankedLabel: string;
}

/**
 * The plan for `classSlug` with the build's `classChoices` (which decide a Witch's
 * list), or `undefined` for a class that does not cast (or none yet).
 */
export function castingPlan(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>> = {},
): CastingPlan | undefined {
  if (classSlug === undefined || !isCasterClass(classSlug)) {
    return undefined;
  }
  const table = CASTER_TABLES[classSlug];
  const book = bookFor(classSlug);
  return {
    kind: table.kind,
    tradition: traditionFor(classSlug, classChoices),
    traditionChoice:
      typeof table.tradition === 'string' ? undefined : table.tradition.choice,
    cantrips: book?.cantrips ?? table.cantrips,
    preparedCantrips: book === undefined ? undefined : table.cantrips,
    known:
      table.kind === 'spontaneous'
        ? Object.values(slotsAtLevel(table.slots, 1)).reduce((sum, n) => sum + n, 0)
        : book === undefined
          ? undefined
          : book.ranked + curriculumBookSpells(classSlug, classChoices),
    book,
    rankedLabel:
      book?.name === 'spellbook'
        ? 'Rank 1 spells in your spellbook'
        : book?.name === 'familiar'
          ? 'Rank 1 spells your familiar knows'
          : table.kind === 'spontaneous'
            ? 'Rank 1 spells you know'
            : 'Rank 1 spells to prepare from',
  };
}

/** A chosen school's curriculum, for the step: its spells and how many go in the book. */
export interface CurriculumSpells {
  readonly cantrips: readonly string[];
  /** Its rank 1 spells, by slug in the `spells` pack. */
  readonly ranked: readonly string[];
  /** How many of them the book starts with (a Wizard's 2). */
  readonly bookSpells: number;
}

/**
 * The curriculum of the class choice `classSlug` has made (a Wizard's school), read from
 * that choice's class feature among `features`; `undefined` while there is none.
 */
export function curriculumSpells(
  classSlug: string | undefined,
  classChoices: Readonly<Record<string, string>>,
  features: readonly ClassFeatureEntry[] | undefined,
): CurriculumSpells | undefined {
  const grant =
    classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug]?.curriculum;
  const chosen = grant === undefined ? undefined : classChoices[grant.choice];
  if (curriculumFor(classSlug, classChoices) === undefined || chosen === undefined) {
    return undefined;
  }
  const curriculum = features?.find((f) => f.slug === chosen)?.curriculum;
  return curriculum === undefined
    ? undefined
    : {
        cantrips: curriculum['0'] ?? [],
        ranked: curriculum['1'] ?? [],
        bookSpells: curriculumBookSpells(classSlug, classChoices),
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
  /** Picks between named spells the step itself offers (a Witch's first hex); a chosen one is not repeated in `spells`. */
  readonly choices: readonly OfferedSpellChoice[];
  /** The curriculum entry's name, once a choice that has one is made (a Wizard's school). */
  readonly curriculum: string | undefined;
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
  const choices = spellChoicesFor(classSlug, classChoices);
  const picked = new Set(choices.map((c) => c.chosen));
  const grants = classSlug === undefined ? undefined : CLASS_SPELL_GRANTS[classSlug];
  const byChoice = grants?.byChoice ?? {};
  const fromChoices = Object.entries(byChoice).flatMap(([choice, byValue]) => {
    const chosen = classChoices[choice];
    return chosen === undefined
      ? []
      : (byValue[chosen] ?? []).map((slug) => ({ slug, why: 'choice' as const, choice }));
  });
  return {
    spells: [
      ...granted.cantrips.map((slug) => ({ slug, why: 'cantrip' as const })),
      ...granted.focusSpells
        .filter((slug) => !picked.has(slug))
        .map((slug) => ({ slug, why: 'focus' as const })),
      ...fromChoices,
    ],
    focusPoints: granted.focusPoints,
    pending: [
      ...new Set([
        ...Object.keys(byChoice),
        ...Object.keys(grants?.cantripsByChoice ?? {}),
        ...Object.keys(grants?.focusByChoice ?? {}),
      ]),
    ].filter((choice) => classChoices[choice] === undefined),
    choices,
    curriculum: curriculumFor(classSlug, classChoices),
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
