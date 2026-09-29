/**
 * The `ancestry` content kind. Attribute boosts are their own fields, not
 * `ruleElements` -- a boost is a character-creation-time score adjustment
 * with its own diminishing-returns rule (a fourth boost past 18 is only
 * +1, not +2), a fundamentally different mechanic from a rule element's
 * always-on `Modifier`. Milestone 7's creation wizard is the real consumer;
 * this schema only carries the data through.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { attributeSchema, sizeSchema, traitSlugSchema } from './common.js';

export const ancestryEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('ancestry'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  hp: z.number().int().positive(),
  size: sizeSchema,
  speed: z.number().int().positive(),
  /** Fixed attribute boosts every member of this ancestry gets. */
  boosts: z.array(attributeSchema).readonly().default([]),
  /** How many additional boosts the player chooses freely (any attribute). */
  freeBoosts: z.number().int().nonnegative().default(0),
  /**
   * Fixed attribute flaws. **(confirm)**: the Remaster is understood to
   * have removed mandatory ancestry flaws entirely as a design change: kept
   * here, defaulting to empty, rather than dropped outright, in case a core
   * four-book ancestry still carries one.
   */
  flaws: z.array(attributeSchema).readonly().default([]),
  languages: z.array(z.string().min(1)).readonly().default([]),
});

export type AncestryEntry = z.infer<typeof ancestryEntrySchema>;
