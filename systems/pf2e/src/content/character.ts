/**
 * `characterDataSchema`: the PF2e payload stored in an `Actor`'s opaque
 * `system` field (ADR 0014). It holds exactly what the sheet edits by hand
 * today and the milestone 7 wizard writes later, so the two can never
 * disagree about shape.
 *
 * Everything the rules engine computes -- AC, saves, skill totals, strikes,
 * max HP -- is deliberately absent. Those are derived by `prepareCharacter`
 * from this data on every read, never stored, so a stored total can never go
 * stale against the numbers that produce it.
 */

import { z } from 'zod';

import { idSchema } from '@hearthtable/core';

import { actionEntrySchema } from './action.js';
import { armorEntrySchema } from './armor.js';
import { classFeatureEntrySchema } from './class.js';
import { attributeSchema, proficiencyRankSchema } from './common.js';
import { featEntrySchema } from './feat.js';
import { gearEntrySchema } from './gear.js';
import { spellEntrySchema } from './spell.js';
import { weaponEntrySchema } from './weapon.js';

const rank = () => proficiencyRankSchema.default('untrained');

/**
 * Attribute *modifiers*, not scores: the Remaster rules work in modifiers
 * (`+3`), and storing what the rules use avoids a score-to-modifier step that
 * a hand-built character has no reason to round-trip through.
 */
export const characterAttributesSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});

/**
 * Explicit proficiency ranks (ADR 0014). An absent rank is `untrained`.
 * `skills` is an open record so Lore skills (`academia-lore`) need no
 * special casing; a skill missing from it is untrained.
 */
export const characterRanksSchema = z.object({
  perception: proficiencyRankSchema.default('untrained'),
  fortitude: proficiencyRankSchema.default('untrained'),
  reflex: proficiencyRankSchema.default('untrained'),
  will: proficiencyRankSchema.default('untrained'),
  classDc: proficiencyRankSchema.default('untrained'),
  weapons: z
    .object({ unarmed: rank(), simple: rank(), martial: rank(), advanced: rank() })
    .default({
      unarmed: 'untrained',
      simple: 'untrained',
      martial: 'untrained',
      advanced: 'untrained',
    }),
  armor: z
    .object({ unarmored: rank(), light: rank(), medium: rank(), heavy: rank() })
    .default({
      unarmored: 'untrained',
      light: 'untrained',
      medium: 'untrained',
      heavy: 'untrained',
    }),
  skills: z.record(z.string().min(1), proficiencyRankSchema).default({}),
});

export type CharacterRanks = z.infer<typeof characterRanksSchema>;

/** Where an embedded item was copied from, kept for display and a future deliberate "refresh from compendium." */
export const itemSourceSchema = z.object({
  packId: z.string().min(1),
  slug: z.string().min(1),
});

/** A compendium entry kind a character can carry. Conditions are tracked separately, and ancestries/classes are references, not items. */
export const characterItemEntrySchema = z.discriminatedUnion('kind', [
  weaponEntrySchema,
  armorEntrySchema,
  gearEntrySchema,
  featEntrySchema,
  classFeatureEntrySchema,
  spellEntrySchema,
  actionEntrySchema,
]);

/**
 * An embedded copy of a compendium entry (ADR 0014). `id` is this copy's own
 * identity on the actor -- two longswords are two items -- distinct from the
 * entry's own id, which is shared by every copy.
 */
export const characterItemSchema = z.object({
  id: idSchema,
  source: itemSourceSchema.optional(),
  entry: characterItemEntrySchema,
  equipped: z.boolean().default(false),
  quantity: z.number().int().positive().default(1),
});

export type CharacterItem = z.infer<typeof characterItemSchema>;

/** A condition currently on the character. Its modifiers are computed from the slug and value, never stored. */
export const appliedConditionSchema = z.object({
  slug: z.string().min(1),
  value: z.number().int().positive().optional(),
});

export type AppliedCondition = z.infer<typeof appliedConditionSchema>;

/** A reference to the ancestry, class, or background this character was built from. Optional on the sheet: a hand-built character may not use one. */
export const contentRefSchema = z.object({
  name: z.string().min(1),
  source: itemSourceSchema.optional(),
});

export const characterDataSchema = z
  .object({
    level: z.number().int().min(1).max(20),
    attributes: characterAttributesSchema,
    /** The chosen key attribute, which drives the class DC. */
    keyAttribute: attributeSchema,
    ranks: characterRanksSchema,
    ancestry: contentRefSchema.optional(),
    heritage: contentRefSchema.optional(),
    background: contentRefSchema.optional(),
    class: contentRefSchema.optional(),
    /** HP granted once by the ancestry. Max HP itself is derived (`ancestryHp + (classHp + con) * level`). */
    ancestryHp: z.number().int().nonnegative().default(0),
    /** HP the class grants per level, before the Constitution modifier. */
    classHp: z.number().int().nonnegative().default(0),
    hp: z.object({
      current: z.number().int().nonnegative(),
      temp: z.number().int().nonnegative().default(0),
    }),
    items: z.array(characterItemSchema).default([]),
    conditions: z.array(appliedConditionSchema).default([]),
    /** Already-made `choiceSet` selections, keyed by the element's `rollOptionPrefix` (see `applyRuleElements`). */
    choices: z.record(z.string().min(1), z.string().min(1)).default({}),
  })
  .refine(
    (data) => new Set(data.items.map((item) => item.id)).size === data.items.length,
    {
      message: 'two items cannot share an id',
      path: ['items'],
    },
  )
  .refine(
    (data) =>
      new Set(data.conditions.map((condition) => condition.slug)).size ===
      data.conditions.length,
    {
      message: 'a condition can appear only once; a valued condition carries one value',
      path: ['conditions'],
    },
  );

export type CharacterData = z.infer<typeof characterDataSchema>;

/**
 * A blank level 1 character, ready to hand-build: every attribute modifier 0,
 * every rank untrained, no items, no conditions, 0 HP. What `actor.create`
 * stores for a new character (the server builds it, never a client). Blank on
 * purpose: any starting number here would be an arbitrary game choice, and
 * milestone 7's wizard fills these same fields in properly.
 */
export function newCharacterData(): CharacterData {
  return characterDataSchema.parse({
    level: 1,
    attributes: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    keyAttribute: 'str',
    ranks: {},
    hp: { current: 0 },
  });
}
