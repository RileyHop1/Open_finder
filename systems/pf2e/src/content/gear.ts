/**
 * The `gear` content kind: general equipment, consumables, treasure, and
 * backpacks -- everything upstream splits into several item types that no
 * v1 rules math distinguishes between. Deliberately minimal beyond the
 * shared envelope (name, traits, description, rule elements), the price,
 * Bulk, and level milestone 7's inventory economy needs (ADR 0021), and
 * the `consumable` sub-shape below. A gear item with real automation (a
 * wand that grants a spell, a potion with a flat modifier) carries that
 * through `ruleElements`, already on the envelope -- it needs no
 * kind-specific field of its own for that; `consumable` only says "this
 * can be used" and, for a scroll or wand, what it casts.
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import {
  bulkSchema,
  itemLevelSchema,
  priceInCopperSchema,
  traitSlugSchema,
} from './common.js';

/**
 * What a consumable is, for the inventory panel's Use button and its
 * filtering -- not a mechanical distinction the way `weapon`/`armor`/`gear`
 * are: every one of these is still a `GearEntry`, just one carrying this
 * field. See ADR 0021 and `docs/inventory.md`.
 */
export const CONSUMABLE_CATEGORIES = [
  'potion',
  'elixir',
  'scroll',
  'wand',
  'talisman',
  'ammo',
  'other',
] as const;

export type ConsumableCategory = (typeof CONSUMABLE_CATEGORIES)[number];

export const consumableCategorySchema = z.enum(CONSUMABLE_CATEGORIES);

/**
 * What a scroll or wand casts, by reference rather than embedding the
 * spell's own text -- the same `{packId, slug}` shape `grantItem` rule
 * elements and `actor.addItem` already use to point at another compendium
 * entry. `rank` is the rank it is cast (or heightened to), matching
 * `spell.ts`'s own `rank` range (1-10) rather than the spell entry's base
 * rank, since a scroll is tied to one specific casting rank.
 */
export const consumableSpellRefSchema = z.object({
  packId: z.string().min(1),
  slug: z.string().min(1),
  rank: z.number().int().min(1).max(10),
});

export type ConsumableSpellRef = z.infer<typeof consumableSpellRefSchema>;

/**
 * Remaining/maximum uses for a multi-use consumable (a wand, a talisman
 * with charges). Absent on `GearEntry.consumable` means single-use: using
 * it consumes one of the item's own `quantity` instead (`docs/inventory.md`).
 */
export const consumableUsesSchema = z.object({
  current: z.number().int().nonnegative(),
  max: z.number().int().positive(),
});

export type ConsumableUses = z.infer<typeof consumableUsesSchema>;

export const consumableSchema = z.object({
  category: consumableCategorySchema,
  uses: consumableUsesSchema.optional(),
  /** Only present when the referenced spell was actually imported -- see `docs/inventory.md`'s Importer notes. */
  spell: consumableSpellRefSchema.optional(),
});

export type Consumable = z.infer<typeof consumableSchema>;

export const gearEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('gear'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  priceInCopper: priceInCopperSchema,
  bulk: bulkSchema,
  level: itemLevelSchema,
  /** Absent means this is ordinary gear, not a consumable -- there is no Use button for it. */
  consumable: consumableSchema.optional(),
});

export type GearEntry = z.infer<typeof gearEntrySchema>;
