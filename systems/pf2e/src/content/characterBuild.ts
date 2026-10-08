/**
 * `characterBuildSchema`: the choices a character was built from (ADR 0024,
 * `docs/character-build.md`). It records *what was picked*, never results:
 * the numbers stay in `characterDataSchema`'s explicit fields, and
 * `deriveCharacter` (a later PR) proposes them from this record. Optional on
 * the character, so a hand-built one stays valid and old worlds need no
 * migration.
 *
 * Nothing here checks the rules. A boost taken twice from one source, a feat
 * in the wrong slot, or a pick the class does not offer are all storable;
 * warning about them is the derivation's job (ADR 0023).
 */

import { z } from 'zod';

import { attributeSchema } from './common.js';

/** A compendium entry by pack and slug, as `actor.addItem` and `grantItem` name one. */
export const buildRefSchema = z.object({
  packId: z.string().min(1),
  slug: z.string().min(1),
});

export type BuildRef = z.infer<typeof buildRefSchema>;

/** Where a set of attribute boosts came from. `free` is the four boosts a player places anywhere. */
export const BOOST_SOURCES = ['ancestry', 'background', 'class', 'free'] as const;

export type BoostSource = (typeof BOOST_SOURCES)[number];

export const boostSourceSchema = z.enum(BOOST_SOURCES);

/** The levels at which attribute boosts are granted: creation, then every five levels. */
export const BOOST_LEVELS = [1, 5, 10, 15, 20] as const;

export type BoostLevel = (typeof BOOST_LEVELS)[number];

/** One batch of boosts: the attributes raised, at a level, from a source. */
export const attributeBoostSchema = z.object({
  level: z.union([
    z.literal(1),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
  ]),
  source: boostSourceSchema,
  attributes: z.array(attributeSchema).min(1),
});

export type AttributeBoost = z.infer<typeof attributeBoostSchema>;

/** The kinds of feat slot a character fills. */
export const FEAT_SLOTS = ['ancestry', 'class', 'skill', 'general', 'archetype'] as const;

export type FeatSlot = (typeof FEAT_SLOTS)[number];

export const featSlotSchema = z.enum(FEAT_SLOTS);

/** A feat picked in a slot at a level. */
export const featPickSchema = z.object({
  slot: featSlotSchema,
  level: z.number().int().min(1).max(20),
  feat: buildRefSchema,
});

export type FeatPick = z.infer<typeof featPickSchema>;

export const characterBuildSchema = z.object({
  ancestry: buildRefSchema.optional(),
  heritage: buildRefSchema.optional(),
  background: buildRefSchema.optional(),
  class: buildRefSchema.optional(),
  /** Attributes the ancestry lowers (some ancestries have a flaw); each is a -1 step. */
  flaws: z.array(attributeSchema).default([]),
  boosts: z.array(attributeBoostSchema).default([]),
  /** Skills trained at creation beyond the automatic ones, by skill slug (a Lore is `<name>-lore`). */
  trainedSkills: z.array(z.string().min(1)).default([]),
  /** The skill raised by each skill increase, by the level it was taken at. */
  skillIncreases: z
    .array(z.object({ level: z.number().int().min(1).max(20), skill: z.string().min(1) }))
    .default([]),
  feats: z.array(featPickSchema).default([]),
  languages: z.array(z.string().min(1)).default([]),
  /** Class- and feature-specific picks (racket, instinct, methodology, ...), keyed by the choice that offered them. */
  classChoices: z.record(z.string().min(1), z.string().min(1)).default({}),
});

export type CharacterBuild = z.infer<typeof characterBuildSchema>;
