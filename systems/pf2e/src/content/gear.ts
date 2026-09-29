/**
 * The `gear` content kind: general equipment, consumables, treasure, and
 * backpacks -- everything upstream splits into several item types that no
 * v1 rules math distinguishes between. Deliberately minimal: nothing in
 * Stack D computes a statistic from a piece of ordinary gear, so beyond the
 * shared envelope (name, traits, description, rule elements) there is
 * nothing to add speculatively. A gear item with real automation (a wand
 * that grants a spell, a potion with a flat modifier) carries that through
 * `ruleElements`, already on the envelope -- it needs no kind-specific
 * field of its own.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import { traitSlugSchema } from './common.js';

export const gearEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('gear'),
  traits: z.array(traitSlugSchema).readonly().default([]),
});

export type GearEntry = z.infer<typeof gearEntrySchema>;
