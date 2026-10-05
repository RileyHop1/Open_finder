/**
 * Content primitives shared across every PF2e content kind: the small
 * closed vocabularies -- rarity, proficiency rank, attribute, action cost --
 * and the trait slug format every content schema tags entries with. Nothing
 * here is specific to one content kind; the feat, weapon, spell, and
 * ancestry schemas (Stack B) all build on this module rather than each
 * defining their own copy.
 */

import { z } from 'zod';

/** PF2e's rarity tiers, from most to least available. */
export const RARITIES = ['common', 'uncommon', 'rare', 'unique'] as const;

export type Rarity = (typeof RARITIES)[number];

export const raritySchema = z.enum(RARITIES);

/** The five proficiency ranks, from none to best. */
export const PROFICIENCY_RANKS = [
  'untrained',
  'trained',
  'expert',
  'master',
  'legendary',
] as const;

export type ProficiencyRank = (typeof PROFICIENCY_RANKS)[number];

export const proficiencyRankSchema = z.enum(PROFICIENCY_RANKS);

/**
 * The flat bonus each rank contributes to a proficiency-based statistic --
 * the rank component only. The level component (added for every rank except
 * untrained; see `docs/rulings.md`) is Stack D's `proficiencyModifier`, not
 * this module: a content primitive should not depend on an actor's level.
 */
export const PROFICIENCY_BONUS: Readonly<Record<ProficiencyRank, number>> = {
  untrained: 0,
  trained: 2,
  expert: 4,
  master: 6,
  legendary: 8,
};

/** The six attributes, by their standard three-letter slugs. */
export const ATTRIBUTES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export type Attribute = (typeof ATTRIBUTES)[number];

export const attributeSchema = z.enum(ATTRIBUTES);

/**
 * The fixed action costs the north star's action bar displays as ◆ / ◆◆ /
 * ◆◆◆ / a reaction icon, plus `free` for actions with no cost at all.
 * Variable costs (an ability usable for a range of actions) are a
 * per-content-kind concern for whichever schema needs one, not a shared
 * primitive -- there is no single "variable cost" shape common enough to
 * generalize yet.
 */
export const ACTION_COSTS = ['free', 'one', 'two', 'three', 'reaction'] as const;

export type ActionCost = (typeof ACTION_COSTS)[number];

export const actionCostSchema = z.enum(ACTION_COSTS);

/**
 * A trait slug: lowercase, kebab-case, alphanumeric segments -- matches real
 * slugs like `agile`, `two-hand-d8`, `deadly-d10`. Validated so a malformed
 * slug fails at import time rather than silently becoming a tag nothing
 * ever matches against.
 */
export const traitSlugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase kebab-case slug');

/**
 * Every damage type the Remaster rules use: the three physical types, the
 * energy types, `mental`/`poison`/`bleed`, the two life types (`vitality`
 * replaces "positive", `void` replaces "negative"), and the four alignment
 * types (rare after the Remaster, but not removed -- a handful of
 * exorcism-adjacent effects still use them). **(confirm)** this list is
 * exhaustive against real upstream data during the importer PRs -- getting
 * this wrong rejects valid content at import time, which is worse than
 * carrying one extra value nothing uses yet.
 *
 * Shared here rather than only on `weapon.ts`'s base damage (a strict
 * subset -- see `WEAPON_DAMAGE_TYPES`) because spells (a later Stack B PR)
 * and rule elements' `damageDice.damageType` override need the full range.
 */
export const DAMAGE_TYPES = [
  'bludgeoning',
  'piercing',
  'slashing',
  'acid',
  'cold',
  'electricity',
  'fire',
  'force',
  'sonic',
  'mental',
  'poison',
  'bleed',
  'vitality',
  'void',
  'chaotic',
  'evil',
  'good',
  'lawful',
] as const;

export type DamageType = (typeof DAMAGE_TYPES)[number];

export const damageTypeSchema = z.enum(DAMAGE_TYPES);

/** PF2e's size categories. Shared between ancestries (an ancestry's base size) and creatures (a later Stack B PR). */
export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;

export type Size = (typeof SIZES)[number];

export const sizeSchema = z.enum(SIZES);

/**
 * An item's price as one integer of copper pieces (1 pp = 1000, 1 gp = 100,
 * 1 sp = 10), rather than a `{pp, gp, sp, cp}` struct -- see ADR 0021.
 * Optional: absent means the importer could not read a price, not "free."
 */
export const priceInCopperSchema = z.number().int().nonnegative().optional();

/**
 * An item's Bulk: `0.1` for a *light* item, `0` for negligible, whole
 * numbers above that. Optional on the schema like `priceInCopperSchema`
 * above (so an entry imported before this field existed, or one the
 * importer could not read a value for, still parses); unlike price, an
 * absent value is meant to be read as `0` (no weight) by the Bulk math that
 * consumes it (milestone 7), not as "unknown" -- most adventuring gear
 * genuinely has none. See ADR 0021 and `docs/inventory.md`.
 */
export const bulkSchema = z.number().nonnegative().optional();

/**
 * The level at which an item becomes available, shared by weapons, armor,
 * and gear the same way a feat already has one (`feat.ts`). Optional:
 * absent means the importer could not read a level, not "level 0."
 */
export const itemLevelSchema = z.number().int().nonnegative().optional();
