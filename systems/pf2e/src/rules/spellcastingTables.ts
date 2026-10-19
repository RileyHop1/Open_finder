/**
 * The seven casters' spellcasting tables (ADR 0025, `docs/spellcasting.md`):
 * the facts about each class that the imported data does not carry. Upstream
 * gives a class only a flag (`spellcasting: 1`); the slots, the cantrips and the
 * tradition exist only as prose and as a table the pack never includes, so they
 * are our own authored data.
 *
 * **Every number here is (confirm)** against Archives of Nethys, which the
 * sandbox this was written in could not reach. What was checked instead:
 * the slot counts for levels 1 to 10 match the sample characters Paizo
 * publishes in the pinned upstream pack (read, never copied), for the Bard,
 * Cleric, Druid, Oracle, Sorcerer and Witch, and the Wizard's base counts (the
 * curriculum's extra slots are not here; they come with the Wizard). Levels 11
 * to 20 follow the same pattern but were not checked against anything.
 *
 * The Witch's familiar and the Wizard's spellbook start with 10 cantrips and five
 * rank 1 spells (the pinned upstream text, checked 2026-10-19).
 *
 * Pure data and arithmetic; none of it refuses anything (ADR 0023).
 */

import type { MagicalTradition } from '../content/spell.js';

export const CASTER_CLASS_SLUGS = [
  'bard',
  'cleric',
  'druid',
  'oracle',
  'sorcerer',
  'witch',
  'wizard',
] as const;

export type CasterClassSlug = (typeof CASTER_CLASS_SLUGS)[number];

/** Whether `slug` names one of the seven casters this milestone builds. */
export function isCasterClass(slug: string): slug is CasterClassSlug {
  return (CASTER_CLASS_SLUGS as readonly string[]).includes(slug);
}

/**
 * How many slots a class gets per rank, as a style:
 * - `standard`: 2 slots when a rank first opens, 3 from the next level (the
 *   first rank opens at level 1 with 2, then 3 from level 2).
 * - `sorcerer`: one more of each, so 3 when a rank opens and 4 after.
 * The tenth rank is a single slot at level 19 in both.
 */
export type SlotStyle = 'standard' | 'sorcerer';

export interface CasterTable {
  readonly kind: 'prepared' | 'spontaneous';
  /**
   * A fixed tradition, or the class choice that decides it (the Witch's patron,
   * the Sorcerer's bloodline) and the tradition for each value of it. A value
   * missing from `byValue` decides nothing (the Sorcerer's bloodlines come in its
   * own PR); `traditionFor` resolves it.
   */
  readonly tradition:
    | MagicalTradition
    | {
        readonly choice: string;
        readonly byValue: Readonly<Record<string, MagicalTradition>>;
      };
  /** Cantrips known or prepared at level 1 (a Wizard's curriculum adds one, in its own entry: `classSpells.ts`). */
  readonly cantrips: number;
  readonly slots: SlotStyle;
  /** What a prepared caster prepares from when it is its own (a Wizard's spellbook, a Witch's familiar). */
  readonly book?: SpellBook;
}

/**
 * A prepared caster's own store of spells, and what it starts with at level 1. The
 * build's picks fill it; only the first `cantrips` of the table's are prepared to start.
 */
export interface SpellBook {
  /** What the rules call it, for a sentence ("your spellbook", "your familiar"). */
  readonly name: 'spellbook' | 'familiar';
  readonly cantrips: number;
  /** Rank 1 spells, beyond the ones the class adds by itself (a patron's lesson). */
  readonly ranked: number;
}

export const CASTER_TABLES: Readonly<Record<CasterClassSlug, CasterTable>> = {
  bard: { kind: 'spontaneous', tradition: 'occult', cantrips: 5, slots: 'standard' },
  cleric: { kind: 'prepared', tradition: 'divine', cantrips: 5, slots: 'standard' },
  druid: { kind: 'prepared', tradition: 'primal', cantrips: 5, slots: 'standard' },
  oracle: { kind: 'spontaneous', tradition: 'divine', cantrips: 5, slots: 'standard' },
  sorcerer: {
    kind: 'spontaneous',
    tradition: { choice: 'bloodline', byValue: {} },
    cantrips: 5,
    slots: 'sorcerer',
  },
  witch: {
    kind: 'prepared',
    // Each patron's Spell List, checked against the pinned upstream text (2026-10-18).
    book: { name: 'familiar', cantrips: 10, ranked: 5 },
    tradition: {
      choice: 'patron',
      byValue: {
        'faiths-flamekeeper': 'divine',
        'silence-in-snow': 'primal',
        'spinner-of-threads': 'occult',
        'starless-shadow': 'occult',
        'the-inscribed-one': 'arcane',
        'the-resentment': 'occult',
        'wilding-steward': 'primal',
      },
    },
    cantrips: 5,
    slots: 'standard',
  },
  wizard: {
    kind: 'prepared',
    tradition: 'arcane',
    cantrips: 5,
    slots: 'standard',
    book: { name: 'spellbook', cantrips: 10, ranked: 5 },
  },
};

/** The book `slug` prepares from, or `undefined` for a class with none. */
export function bookFor(slug: string | undefined): SpellBook | undefined {
  return slug !== undefined && isCasterClass(slug) ? CASTER_TABLES[slug].book : undefined;
}

/**
 * The tradition `slug` casts from, given the build's class choices: its fixed one,
 * or the one its deciding choice maps to. `undefined` for a class that does not
 * cast, or while the choice is unmade or maps to nothing.
 */
export function traditionFor(
  slug: string,
  classChoices: Readonly<Record<string, string>>,
): MagicalTradition | undefined {
  if (!isCasterClass(slug)) {
    return undefined;
  }
  const { tradition } = CASTER_TABLES[slug];
  if (typeof tradition === 'string') {
    return tradition;
  }
  const chosen = classChoices[tradition.choice];
  return chosen === undefined ? undefined : tradition.byValue[chosen];
}

/** The level a rank's slots first open: rank 1 at 1, rank r at 2r - 1, the tenth at 19. */
export function rankOpensAt(rank: number): number {
  return rank >= 10 ? 19 : 2 * rank - 1;
}

/**
 * The slots per rank at `level` for a slot style, as `rank -> count`, leaving
 * out ranks not open yet. A level outside 1 to 20 is clamped.
 */
export function slotsAtLevel(style: SlotStyle, level: number): Record<number, number> {
  const at = Math.min(20, Math.max(1, Math.floor(level)));
  const base = style === 'sorcerer' ? 3 : 2;
  const slots: Record<number, number> = {};
  for (let rank = 1; rank <= 10; rank++) {
    const opens = rankOpensAt(rank);
    if (at < opens) {
      continue;
    }
    if (rank === 10) {
      slots[rank] = 1;
    } else {
      // The first rank opens at level 1 and gains its extra slot at level 2;
      // every other rank gains it the level after it opens.
      slots[rank] = at === opens ? base : base + 1;
    }
  }
  return slots;
}
