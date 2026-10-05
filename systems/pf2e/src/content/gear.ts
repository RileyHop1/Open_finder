/**
 * The `gear` content kind: general equipment, consumables, treasure, and
 * backpacks -- everything upstream splits into several item types that no
 * v1 rules math distinguishes between. Deliberately minimal beyond the
 * shared envelope (name, traits, description, rule elements) and the
 * price, Bulk, and level milestone 7's inventory economy needs (ADR 0021).
 * A gear item with real automation (a wand that grants a spell, a potion
 * with a flat modifier) carries that through `ruleElements`, already on
 * the envelope -- it needs no kind-specific field of its own for that.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import {
  bulkSchema,
  itemLevelSchema,
  priceInCopperSchema,
  traitSlugSchema,
} from './common.js';

export const gearEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('gear'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  priceInCopper: priceInCopperSchema,
  bulk: bulkSchema,
  level: itemLevelSchema,
});

export type GearEntry = z.infer<typeof gearEntrySchema>;
