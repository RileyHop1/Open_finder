/**
 * The `background` content kind. A background's granted skill feat is
 * expressed via `ruleElements`' existing `grantItem` element, not a bespoke
 * field here -- that is exactly what `grantItem` already models, and adding
 * a second field for the same relationship would just be two ways to say
 * the same thing.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { attributeSchema, traitSlugSchema } from './common.js';

export const backgroundEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('background'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  /**
   * The attributes this background offers a boost choice between (a
   * background always grants one additional free boost besides, identical
   * across every background, so it isn't listed per entry here).
   */
  boostOptions: z.array(attributeSchema).min(1).readonly(),
  /**
   * The skill(s) this background trains. A free string, not a closed skill
   * vocabulary (not yet defined anywhere in this codebase) -- Lore skills
   * ("Academia Lore") are themselves free text in PF2e, so a closed enum
   * would need an escape hatch for them anyway.
   */
  trainedSkills: z.array(z.string().min(1)).min(1).readonly(),
});

export type BackgroundEntry = z.infer<typeof backgroundEntrySchema>;
