/**
 * The `creature` content kind: NPC and monster stat blocks. Unlike a PC,
 * a creature's numbers are already the finished product straight from the
 * book -- AC, saves, skills, perception, and strike bonuses are flat
 * integers, not built from proficiency rank + attribute the way Stack D
 * builds a PC's. Nothing here runs through `resolveStatistic`; there is
 * nothing left to resolve.
 *
 * Reminder for golden fixtures (CLAUDE.md's Testing section, ADR 0003's
 * consequences): a published creature's stat block is Paizo content.
 * Golden creatures are our own invented monsters with hand-computed stats,
 * never a stat block copied from the compendium.
 */

import { z } from 'zod';

import { compendiumEntrySchema, damageDiceFacesSchema } from '@hearthtable/core';

import { damageTypeSchema, sizeSchema, traitSlugSchema } from './common.js';

export const creatureAttributesSchema = z.object({
  str: z.number().int(),
  dex: z.number().int(),
  con: z.number().int(),
  int: z.number().int(),
  wis: z.number().int(),
  cha: z.number().int(),
});

export type CreatureAttributes = z.infer<typeof creatureAttributesSchema>;

export const creatureSavingThrowsSchema = z.object({
  fortitude: z.number().int(),
  reflex: z.number().int(),
  will: z.number().int(),
});

export type CreatureSavingThrows = z.infer<typeof creatureSavingThrowsSchema>;

export const creatureSpeedsSchema = z.object({
  land: z.number().int().nonnegative(),
  fly: z.number().int().positive().optional(),
  swim: z.number().int().positive().optional(),
  climb: z.number().int().positive().optional(),
  burrow: z.number().int().positive().optional(),
});

export type CreatureSpeeds = z.infer<typeof creatureSpeedsSchema>;

/**
 * A resistance or weakness entry. `damageType` is a free string, not the
 * closed `damageTypeSchema` -- real stat blocks have entries like
 * "physical", "precision", and "all-except-force" that aren't damage types
 * at all, and a closed enum would need an escape hatch for them anyway.
 */
export const creatureDefenseAdjustmentSchema = z.object({
  damageType: z.string().min(1),
  value: z.number().int().positive(),
});

export type CreatureDefenseAdjustment = z.infer<typeof creatureDefenseAdjustmentSchema>;

/**
 * One damage component of a strike. `bonus` defaults to 0 for a pure dice
 * component ("plus 1d6 fire"); `diceNumber`/`dieFaces` are required, so a
 * rare flat-only rider with no dice at all ("plus 5 fire damage") isn't
 * representable in v1 -- golden creatures are ours to invent, so this
 * doesn't block them, and it can be revisited if the importer's real data
 * needs it.
 */
export const creatureStrikeDamageSchema = z.object({
  diceNumber: z.number().int().positive(),
  dieFaces: damageDiceFacesSchema,
  bonus: z.number().int().default(0),
  damageType: damageTypeSchema,
});

export type CreatureStrikeDamage = z.infer<typeof creatureStrikeDamageSchema>;

export const creatureStrikeSchema = z.object({
  name: z.string().min(1),
  attackBonus: z.number().int(),
  traits: z.array(traitSlugSchema).readonly().default([]),
  damage: z.array(creatureStrikeDamageSchema).min(1).readonly(),
});

export type CreatureStrike = z.infer<typeof creatureStrikeSchema>;

export const creatureEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('creature'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  level: z.number().int().min(-1).max(30),
  size: sizeSchema,
  perception: z.number().int(),
  ac: z.number().int().positive(),
  savingThrows: creatureSavingThrowsSchema,
  hp: z.number().int().positive(),
  resistances: z.array(creatureDefenseAdjustmentSchema).readonly().default([]),
  weaknesses: z.array(creatureDefenseAdjustmentSchema).readonly().default([]),
  speeds: creatureSpeedsSchema,
  attributes: creatureAttributesSchema,
  /** Flat modifiers by skill slug, e.g. `{ athletics: 15 }`. An open record, like `background.trainedSkills`, so Lore skills need no special case. */
  skills: z.record(z.string().min(1), z.number().int()).default({}),
  strikes: z.array(creatureStrikeSchema).readonly().default([]),
  languages: z.array(z.string().min(1)).readonly().default([]),
});

export type CreatureEntry = z.infer<typeof creatureEntrySchema>;
