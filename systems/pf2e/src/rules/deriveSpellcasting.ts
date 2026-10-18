/**
 * The spellcasting a build gives (ADR 0025, `docs/spellcasting.md`): the parts
 * of a caster's entry that follow from the class and level, and the merge that
 * puts them on a character without touching what play has changed.
 *
 * `deriveSpellcasting` is pure and proposes only the *static* parts: kind,
 * tradition, attribute, proficiency rank, the slot maximums and how many
 * cantrips to have. The spells picked, the slots used and the spells prepared
 * are play state; `mergeSpellcasting` leaves them alone, so re-applying a
 * build (or levelling up) only raises the maximums. It never removes an entry,
 * the same way `actor.applyBuild` never removes an item.
 *
 * A class whose tradition depends on a choice (the Witch's patron, the
 * Sorcerer's bloodline) gets no entry until the choice is made and maps to a
 * tradition (`traditionFor`); the derivation says so in a warning instead of
 * guessing. Nothing here refuses anything (ADR 0023).
 */

import type { Attribute, ProficiencyRank } from '../content/common.js';
import type { ClassEntry } from '../content/class.js';
import type { MagicalTradition } from '../content/spell.js';
import type { SpellcastingEntry } from '../content/spellcasting.js';
import {
  CASTER_TABLES,
  isCasterClass,
  slotsAtLevel,
  traditionFor,
} from './spellcastingTables.js';

export interface DerivedSpellcasting {
  /** Which build source this entry belongs to (`class:wizard`), so a re-apply finds it. */
  readonly source: string;
  readonly name: string;
  readonly kind: 'prepared' | 'spontaneous';
  readonly tradition: MagicalTradition;
  readonly attribute: Attribute;
  readonly rank: ProficiencyRank;
  /** Slot maximums per rank, ranks not open yet left out. */
  readonly slots: Readonly<Record<number, number>>;
  /** How many cantrips the class has at this point; the entry's list of them is filled by picking. */
  readonly cantrips: number;
}

export type SpellcastingWarning = {
  readonly kind: 'spellcasting-tradition-undecided';
  /** The class choice that decides the tradition (`patron`, `bloodline`). */
  readonly choice: string;
  readonly classSlug: string;
};

export interface DerivedSpellcastingResult {
  readonly spellcasting?: DerivedSpellcasting;
  readonly warnings: readonly SpellcastingWarning[];
}

/**
 * The spellcasting `cls` gives at `level`, or none for a class that does not
 * cast. `classChoices` (the build's) decide the tradition for the classes whose
 * tradition is a choice (the Witch's patron). `rank` is
 * the spellcasting proficiency, which the class features raise (Expert
 * Spellcaster, a Cloistered Cleric's third doctrine; `deriveCharacter` works it
 * out from their `rankUps`).
 */
export function deriveSpellcasting(
  cls: Pick<ClassEntry, 'slug' | 'name'> | undefined,
  level: number,
  attribute: Attribute,
  classChoices: Readonly<Record<string, string>> = {},
  rank: ProficiencyRank = 'trained',
): DerivedSpellcastingResult {
  if (cls === undefined || !isCasterClass(cls.slug)) {
    return { warnings: [] };
  }
  const table = CASTER_TABLES[cls.slug];
  const tradition = traditionFor(cls.slug, classChoices);
  if (tradition === undefined) {
    const choice = typeof table.tradition === 'string' ? '' : table.tradition.choice;
    return {
      warnings: [
        { kind: 'spellcasting-tradition-undecided', choice, classSlug: cls.slug },
      ],
    };
  }
  return {
    spellcasting: {
      source: `class:${cls.slug}`,
      name: `${cls.name} spellcasting`,
      kind: table.kind,
      tradition,
      attribute,
      rank,
      slots: slotsAtLevel(table.slots, level),
      cantrips: table.cantrips,
    },
    warnings: [],
  };
}

/** `{ 1: 3 }` as the record keys the entry stores (`{ "1": 3 }`). */
const byRankKey = <T>(values: Readonly<Record<number, number>>, make: (n: number) => T) =>
  Object.fromEntries(Object.entries(values).map(([rank, n]) => [rank, make(n)]));

/**
 * `derived` put onto `existing` entries. An entry with the same `source` has its
 * static parts updated and keeps its play state (used slots, prepared spells,
 * repertoire, cantrips, signature spells); no entry for that source makes a new,
 * empty one with an id from `newId`. Nothing is ever removed, and no `derived`
 * leaves `existing` as it is.
 */
export function mergeSpellcasting(
  existing: readonly SpellcastingEntry[],
  derived: DerivedSpellcasting | undefined,
  newId: () => string,
): SpellcastingEntry[] {
  if (derived === undefined) {
    return [...existing];
  }
  const index = existing.findIndex(
    (e) => e.source === derived.source && e.kind === derived.kind,
  );
  const common = {
    source: derived.source,
    name: derived.name,
    tradition: derived.tradition,
    attribute: derived.attribute,
    rank: derived.rank,
  };
  const prior = index === -1 ? undefined : existing[index];

  let next: SpellcastingEntry;
  if (derived.kind === 'prepared') {
    const state = prior?.kind === 'prepared' ? prior : undefined;
    next = {
      ...common,
      id: prior?.id ?? newId(),
      kind: 'prepared',
      cantrips: state?.cantrips ?? [],
      slots: byRankKey(derived.slots, (n) => n),
      prepared: state?.prepared ?? [],
    };
  } else {
    const state = prior?.kind === 'spontaneous' ? prior : undefined;
    next = {
      ...common,
      id: prior?.id ?? newId(),
      kind: 'spontaneous',
      cantrips: state?.cantrips ?? [],
      slots: byRankKey(derived.slots, (max) => ({ max, used: 0 })),
      repertoire: state?.repertoire ?? [],
      signature: state?.signature ?? [],
    };
    if (state !== undefined) {
      for (const [rank, slot] of Object.entries(next.slots)) {
        next.slots[rank] = { max: slot.max, used: state.slots[rank]?.used ?? 0 };
      }
    }
  }
  return index === -1
    ? [...existing, next]
    : existing.map((e, i) => (i === index ? next : e));
}

const union = (list: readonly string[], more: readonly string[]): string[] => [
  ...list,
  ...more.filter((id, i) => !list.includes(id) && more.indexOf(id) === i),
];

/**
 * The build's picked spells, by item id, added to the entry from `source`: the
 * cantrips to its cantrips, and the ranked spells to a spontaneous entry's
 * repertoire. A prepared entry's ranked picks are only items on the character
 * (a Wizard's spellbook, a Cleric's first choices); preparing them is play.
 * Only ever adds, like the rest of the merge, and leaves the other entries alone.
 */
export function addSpellPicks(
  entries: readonly SpellcastingEntry[],
  source: string,
  picks: { readonly cantrips: readonly string[]; readonly ranked: readonly string[] },
): SpellcastingEntry[] {
  return entries.map((entry) => {
    if (entry.source !== source) {
      return entry;
    }
    const cantrips = union(entry.cantrips, picks.cantrips);
    return entry.kind === 'spontaneous'
      ? { ...entry, cantrips, repertoire: union(entry.repertoire, picks.ranked) }
      : { ...entry, cantrips };
  });
}

/** The highest rank `derived` has slots in (1 for none). */
export function highestRank(derived: Pick<DerivedSpellcasting, 'slots'>): number {
  const ranks = Object.keys(derived.slots).map(Number);
  return ranks.length === 0 ? 1 : Math.max(...ranks);
}

/**
 * A font as its own prepared entry beside `main` (a Cleric's Divine Font): the same
 * tradition, attribute and proficiency, `count` slots at `main`'s highest rank, no
 * cantrips. Its source is `main`'s plus `:font`, so a re-apply finds it.
 */
export function deriveFont(
  main: DerivedSpellcasting,
  name: string,
  count: number,
): DerivedSpellcasting {
  return {
    ...main,
    source: `${main.source}:font`,
    name,
    kind: 'prepared',
    slots: { [highestRank(main)]: count },
    cantrips: 0,
  };
}

/** The highest rank a curriculum has spells for; the 10th rank's slot takes no extra slots. */
const CURRICULUM_TOP_RANK = 9;

/**
 * A curriculum as its own prepared entry beside `main` (a Wizard's school): one extra
 * cantrip and one slot at each rank `main` has, up to the 9th, all for the
 * curriculum's spells. Same tradition, attribute and proficiency; its source is
 * `main`'s plus `:curriculum`, so a re-apply finds it. What is prepared in it is play.
 */
export function deriveCurriculum(
  main: DerivedSpellcasting,
  name: string,
): DerivedSpellcasting {
  const ranks = Object.keys(main.slots)
    .map(Number)
    .filter((rank) => rank <= CURRICULUM_TOP_RANK);
  return {
    ...main,
    source: `${main.source}:curriculum`,
    name,
    kind: 'prepared',
    slots: Object.fromEntries(ranks.map((rank) => [rank, 1])),
    cantrips: 1,
  };
}

/**
 * The font entry from `source` with `itemId` prepared in every one of its `count`
 * slots at `rank`. Copies already cast at that rank stay cast (up to `count`), so
 * re-applying a build does not hand back a spent slot; with no spell chosen yet
 * (`itemId` undefined) nothing is prepared. Other entries are left alone.
 */
export function prepareFont(
  entries: readonly SpellcastingEntry[],
  source: string,
  itemId: string | undefined,
  rank: number,
  count: number,
): SpellcastingEntry[] {
  return entries.map((entry) => {
    if (entry.source !== source || entry.kind !== 'prepared') {
      return entry;
    }
    if (itemId === undefined) {
      return { ...entry, prepared: [] };
    }
    const spent = entry.prepared.filter(
      (row) => row.itemId === itemId && row.rank === rank && row.expended,
    ).length;
    return {
      ...entry,
      prepared: Array.from({ length: count }, (_, i) => ({
        rank,
        itemId,
        expended: i < Math.min(spent, count),
      })),
    };
  });
}
