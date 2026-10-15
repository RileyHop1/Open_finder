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
 * Sorcerer's bloodline) gets no entry until that class's own PR supplies how the
 * choice maps to a tradition; the derivation says so in a warning instead of
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
  spellcastingRankAtLevel,
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
 * cast. `traditionOf` maps a class choice (its key and chosen value) to a
 * tradition for the classes that need one; no class supplies it yet.
 */
export function deriveSpellcasting(
  cls: Pick<ClassEntry, 'slug' | 'name'> | undefined,
  level: number,
  attribute: Attribute,
  traditionOf?: (choice: string) => MagicalTradition | undefined,
): DerivedSpellcastingResult {
  if (cls === undefined || !isCasterClass(cls.slug)) {
    return { warnings: [] };
  }
  const table = CASTER_TABLES[cls.slug];
  const tradition =
    typeof table.tradition === 'string'
      ? table.tradition
      : traditionOf?.(table.tradition.choice);
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
      rank: spellcastingRankAtLevel(level),
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
