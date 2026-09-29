/**
 * The `spell` content kind -- PF2e's most structurally complex content, and
 * the reason spellcasting is its own milestone-7 stage rather than folded
 * into the martial classes' wizard skeleton. This schema carries the data
 * milestone 2 needs to import a spell correctly; the mechanics that consume
 * it (slots by rank, prepared vs. spontaneous, what heightening actually
 * does numerically) are milestone 7(b)'s job, not this one's.
 *
 * Notably absent: a "components" field. The Remaster replaced the legacy
 * verbal/somatic/material component system with two traits --
 * `concentrate` (can't cast if you can't think or speak) and `manipulate`
 * (needs a free hand, provokes reactions) -- carried on the shared `traits`
 * field the envelope already has, not a spell-specific structure.
 * **(confirm)** against real upstream data during the importer PR: this is
 * a Remaster rules-modeling decision, not a verified transcription.
 *
 * Also out of scope: rituals. They are catalogued separately from spells in
 * real PF2e (no spell slot, any character can attempt one with the right
 * skill), no milestone currently names them, and folding them into this
 * schema would misrepresent how they actually work. `castTime` stays a free
 * string precisely so a rare non-standard cast time doesn't need one.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { traitSlugSchema } from './common.js';

/** The four magical traditions. A focus spell (tied to a class, not a tradition) has none -- see `spellEntrySchema.traditions`. */
export const MAGICAL_TRADITIONS = ['arcane', 'divine', 'occult', 'primal'] as const;

export type MagicalTradition = (typeof MAGICAL_TRADITIONS)[number];

export const magicalTraditionSchema = z.enum(MAGICAL_TRADITIONS);

/** A spell's range: a fixed distance, or one of the three special cases that aren't a distance at all. */
export const spellRangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('self') }),
  z.object({ kind: z.literal('touch') }),
  z.object({ kind: z.literal('feet'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('unlimited') }),
]);

export type SpellRange = z.infer<typeof spellRangeSchema>;

/** The area-template shapes -- the same four milestone 5's battle-map templates (CLAUDE.md) will render, though that machinery is unbuilt and unrelated to this schema. */
export const AREA_SHAPES = ['burst', 'cone', 'emanation', 'line'] as const;

export type AreaShape = (typeof AREA_SHAPES)[number];

export const areaShapeSchema = z.enum(AREA_SHAPES);

export const spellAreaSchema = z.object({
  shape: areaShapeSchema,
  /** Feet -- a burst/emanation's radius, a cone's length, a line's length. */
  size: z.number().int().positive(),
});

export type SpellArea = z.infer<typeof spellAreaSchema>;

export const SPELL_SAVES = ['fortitude', 'reflex', 'will'] as const;

export type SpellSave = (typeof SPELL_SAVES)[number];

export const spellSaveSchema = z.enum(SPELL_SAVES);

/**
 * What a target rolls against the spell, if anything. `basic` marks a
 * "basic save" -- the standard degree-of-success-to-damage scaling
 * (critical success: no effect, success: half damage, failure: full
 * damage, critical failure: double damage) that a later milestone's
 * automation can apply generically rather than per spell.
 */
export const spellDefenseSchema = z.object({
  save: spellSaveSchema,
  basic: z.boolean().default(false),
});

export type SpellDefense = z.infer<typeof spellDefenseSchema>;

/**
 * How a spell scales when cast with a higher-rank slot. PF2e uses two
 * styles: a flat effect repeated every N ranks ("Heightened (+1)"), or a
 * distinct effect at specific ranks ("Heightened (4th)", "Heightened
 * (7th)"). Both are carried as prose, like `description` -- parsing
 * heightening into a numeric delta automation can apply is well beyond v1;
 * an actually-automatable heightening effect is expressed via
 * `ruleElements` instead, the same as any other automation on this entry.
 */
export const spellHeighteningSchema = z.union([
  z.object({
    kind: z.literal('interval'),
    interval: z.number().int().positive(),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal('fixedRanks'),
    entries: z
      .array(
        z.object({
          rank: z.number().int().min(2).max(10),
          description: z.string().min(1),
        }),
      )
      .min(1),
  }),
]);

export type SpellHeightening = z.infer<typeof spellHeighteningSchema>;

export const spellEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('spell'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  rank: z.number().int().min(1).max(10),
  /** Empty for a focus spell, which is tied to a class rather than a tradition. */
  traditions: z.array(magicalTraditionSchema).readonly().default([]),
  /** Usually one of `ACTION_COSTS`' values; a free string rather than that schema so a rare non-standard cast time (e.g. a slow ritual-like effect) doesn't need special-casing. */
  castTime: z.string().min(1),
  range: spellRangeSchema,
  area: spellAreaSchema.optional(),
  /** Free text ("1 creature", "5 willing creatures"); no v1 rules math parses a target count. */
  targets: z.string().min(1).optional(),
  /** Absent means instantaneous -- PF2e's default and the common case. */
  duration: z.string().min(1).optional(),
  sustained: z.boolean().default(false),
  defense: spellDefenseSchema.optional(),
  heightening: spellHeighteningSchema.optional(),
});

export type SpellEntry = z.infer<typeof spellEntrySchema>;
