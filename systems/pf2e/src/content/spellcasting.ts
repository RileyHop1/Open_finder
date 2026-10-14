/**
 * What a character can cast and how much of it is left (ADR 0025,
 * `docs/spellcasting.md`). A character holds a list of **spellcasting
 * entries**, one per way of casting; the spells themselves stay ordinary
 * `spell` items on the character (ADR 0014), and an entry refers to them by
 * item id.
 *
 * Two kinds of entry exist at first, because they keep their state in
 * different places:
 * - **prepared** (Cleric, Druid, Witch, Wizard): slots have only a maximum per
 *   rank, and the spells chosen for them are a list of rows, each with whether
 *   it has been cast. How many are spent is the number of expended rows, so it
 *   is never stored twice.
 * - **spontaneous** (Bard, Oracle, Sorcerer): slots have a maximum and a used
 *   count per rank, and the spells known are a repertoire.
 *
 * Nothing here checks the rules (ADR 0023): a row may name a spell of the wrong
 * rank, more rows than slots, or an item the character no longer has. Telling
 * the player is the sheet's job, and the GM can set any number by hand.
 * Focus points are not part of an entry; they are one pool on the character.
 */

import { z } from 'zod';

import { idSchema } from '@hearthtable/core';

import { attributeSchema, proficiencyRankSchema } from './common.js';
import { magicalTraditionSchema } from './spell.js';

/** A spell rank as a record key: `"1"` to `"10"` (a cantrip is not a rank here; it has its own list). */
export const spellRankKeySchema = z
  .string()
  .regex(/^([1-9]|10)$/, 'a spell rank from 1 to 10');

const spellRankSchema = z.number().int().min(1).max(10);
const countSchema = z.number().int().nonnegative();

/** Fields every kind of entry has. */
const entryBaseSchema = z.object({
  id: idSchema,
  /**
   * Which build source made this entry (`class:wizard`), so applying a build again
   * updates it instead of adding a second. Absent for an entry made by hand.
   */
  source: z.string().min(1).max(100).optional(),
  /** What the sheet calls it ("Wizard spellcasting"). */
  name: z.string().min(1).max(100),
  tradition: magicalTraditionSchema,
  /** The attribute spell attack and spell DC use. */
  attribute: attributeSchema,
  /** The spellcasting proficiency rank, separate from the class DC's (ADR 0014: ranks are explicit). */
  rank: proficiencyRankSchema.default('trained'),
  /** Cantrips are cast at will, so they are a list of items and nothing is counted. */
  cantrips: z.array(idSchema).default([]),
});

/** One prepared spell: the item, the rank of the slot it sits in, and whether it has been cast. */
export const preparedSpellSchema = z.object({
  rank: spellRankSchema,
  itemId: idSchema,
  expended: z.boolean().default(false),
});

export type PreparedSpell = z.infer<typeof preparedSpellSchema>;

export const preparedEntrySchema = entryBaseSchema.extend({
  kind: z.literal('prepared'),
  /** Slots per rank: the most that can be prepared. */
  slots: z.record(spellRankKeySchema, countSchema).default({}),
  prepared: z.array(preparedSpellSchema).default([]),
});

export const spontaneousSlotsSchema = z.object({
  max: countSchema,
  used: countSchema.default(0),
});

export const spontaneousEntrySchema = entryBaseSchema.extend({
  kind: z.literal('spontaneous'),
  slots: z.record(spellRankKeySchema, spontaneousSlotsSchema).default({}),
  /** The spells known. */
  repertoire: z.array(idSchema).default([]),
  /** The repertoire spells that can be cast at any rank (a subset of it, not checked). */
  signature: z.array(idSchema).default([]),
});

export const spellcastingEntrySchema = z.discriminatedUnion('kind', [
  preparedEntrySchema,
  spontaneousEntrySchema,
]);

export type SpellcastingEntry = z.infer<typeof spellcastingEntrySchema>;

/**
 * The character's focus points: a pool shared by every source of focus spells.
 * The rules cap it at 3; that is a warning on the sheet, not a limit here.
 */
export const focusPointsSchema = z.object({
  max: countSchema.default(0),
  current: countSchema.default(0),
});

export type FocusPoints = z.infer<typeof focusPointsSchema>;
