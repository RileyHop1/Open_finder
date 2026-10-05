/**
 * The `armor` content kind. Fields are scoped to what Stack D's AC math
 * needs: the item bonus, the Dexterity cap it imposes, and the penalties
 * and Strength threshold that determine whether those penalties apply --
 * plus the price, Bulk, and level milestone 7's inventory economy needs
 * (ADR 0021).
 */

import { z } from 'zod';

import { compendiumEntrySchema } from '@hearthtable/core';

import {
  bulkSchema,
  itemLevelSchema,
  priceInCopperSchema,
  traitSlugSchema,
} from './common.js';

/** Armor's proficiency categories -- `unarmored` is its own category, the same pattern `weapon.ts`'s `unarmed` uses. */
export const ARMOR_CATEGORIES = ['unarmored', 'light', 'medium', 'heavy'] as const;

export type ArmorCategory = (typeof ARMOR_CATEGORIES)[number];

export const armorCategorySchema = z.enum(ARMOR_CATEGORIES);

/** The armor groups PF2e's critical specialization and material effects key off of. */
export const ARMOR_GROUPS = ['cloth', 'leather', 'composite', 'chain', 'plate'] as const;

export type ArmorGroup = (typeof ARMOR_GROUPS)[number];

export const armorGroupSchema = z.enum(ARMOR_GROUPS);

export const armorEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('armor'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  category: armorCategorySchema,
  /** Absent for the rare armor with no group (some unarmored options). */
  group: armorGroupSchema.optional(),
  acBonus: z.number().int().nonnegative(),
  /** The maximum Dexterity modifier this armor allows toward AC. Absent means uncapped. */
  dexCap: z.number().int().nonnegative().optional(),
  /** Penalty to Strength/Dexterity-based skill checks while worn without meeting `strength`. Zero or negative; defaults to 0 (no penalty). */
  checkPenalty: z.number().int().nonpositive().default(0),
  /** Speed penalty (in feet, zero or negative) while worn without meeting `strength`. Defaults to 0. */
  speedPenalty: z.number().int().nonpositive().default(0),
  /** Minimum Strength score to avoid checkPenalty/speedPenalty. Absent means no requirement. */
  strength: z.number().int().positive().optional(),
  priceInCopper: priceInCopperSchema,
  bulk: bulkSchema,
  level: itemLevelSchema,
});

export type ArmorEntry = z.infer<typeof armorEntrySchema>;
