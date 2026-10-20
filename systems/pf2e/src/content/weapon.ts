/**
 * The `weapon` content kind. Fields are scoped to what Stack D's strike
 * math (attack rolls, damage, proficiency lookup) and the sheet's display
 * actually need, plus the price, Bulk, and level milestone 7's inventory
 * economy needs (ADR 0021) -- no usage entries (ammunition count, reload
 * tracking beyond the `reload` field below), which nothing yet consumes.
 * Add them when a real consumer needs them, not speculatively.
 */

import { z } from 'zod';

import { compendiumEntrySchema, damageDiceFacesSchema } from '@hearthtable/core';

import {
  bulkSchema,
  damageTypeSchema,
  itemLevelSchema,
  priceInCopperSchema,
  traitSlugSchema,
} from './common.js';

/** Which proficiency a strike with this weapon uses -- `unarmed` is its own category, not folded into `simple`. */
export const WEAPON_CATEGORIES = ['unarmed', 'simple', 'martial', 'advanced'] as const;

export type WeaponCategory = (typeof WEAPON_CATEGORIES)[number];

export const weaponCategorySchema = z.enum(WEAPON_CATEGORIES);

/** The weapon groups PF2e's critical specialization effects key off of. */
export const WEAPON_GROUPS = [
  'axe',
  'bomb',
  'bow',
  'brawling',
  'club',
  'dart',
  'firearm',
  'flail',
  'hammer',
  'knife',
  'pick',
  'polearm',
  'shield',
  'sling',
  'spear',
  'sword',
] as const;

export type WeaponGroup = (typeof WEAPON_GROUPS)[number];

export const weaponGroupSchema = z.enum(WEAPON_GROUPS);

/**
 * The three physical damage types, which an ordinary weapon's base damage always
 * is. An elemental rune adds *extra* damage of another type; it does not change a
 * weapon's own base type. An alchemical bomb's base damage can be any type, so the
 * weapon schema takes `common.ts`'s full `damageTypeSchema`.
 */
export const WEAPON_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const;

export type WeaponDamageType = (typeof WEAPON_DAMAGE_TYPES)[number];

export const weaponDamageTypeSchema = z.enum(WEAPON_DAMAGE_TYPES);

/**
 * A weapon's base damage, structured rather than a pre-built dice
 * expression -- Stack D combines this with striking runes, an ability
 * modifier, and trait dice (deadly, fatal) at roll time, so nothing should
 * pre-flatten it into a string this early. `dieFaces` reuses
 * `@hearthtable/core`'s `damageDiceFacesSchema` rather than redefining the
 * same closed set of die sizes.
 *
 * An alchemical bomb stretches it three ways: its damage can be any type (an
 * Alchemist's Fire is fire), it can be a flat amount (an Acid Flask's 1, so no
 * `dieFaces`), and it can be none at all (a Glue Bomb, `diceNumber` 0). Its splash
 * and persistent damage are the weapon's own `splash` and `persistent`.
 */
export const weaponDamageSchema = z.object({
  /** How many dice, or with no `dieFaces` a flat amount; 0 deals no damage. */
  diceNumber: z.number().int().nonnegative(),
  /** Absent for flat damage. */
  dieFaces: damageDiceFacesSchema.optional(),
  damageType: damageTypeSchema,
});

export type WeaponDamage = z.infer<typeof weaponDamageSchema>;

export const weaponEntrySchema = compendiumEntrySchema.extend({
  kind: z.literal('weapon'),
  traits: z.array(traitSlugSchema).readonly().default([]),
  category: weaponCategorySchema,
  group: weaponGroupSchema,
  damage: weaponDamageSchema,
  hands: z.union([z.literal(1), z.literal(2)]),
  /** Range in feet; absent for a melee-only weapon. Present even on a thrown melee weapon. */
  range: z.number().int().positive().optional(),
  /** Splash damage of the base damage's type to the target and everything within 5 feet, never doubled (an alchemical bomb). */
  splash: z.number().int().positive().optional(),
  /** Persistent damage a hit leaves (an Acid Flask's 1d6 acid); absent dice faces is a flat amount. */
  persistent: z
    .object({
      diceNumber: z.number().int().positive(),
      dieFaces: damageDiceFacesSchema.optional(),
      damageType: damageTypeSchema,
    })
    .optional(),
  /** Rounds to reload; absent for a weapon with no reload step (melee, or ranged with none, e.g. a thrown weapon or most bows). */
  reload: z.number().int().nonnegative().optional(),
  priceInCopper: priceInCopperSchema,
  bulk: bulkSchema,
  level: itemLevelSchema,
});

export type WeaponEntry = z.infer<typeof weaponEntrySchema>;
