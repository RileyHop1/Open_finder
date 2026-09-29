/**
 * @hearthtable/pf2e -- Pathfinder 2E content schemas, rule elements, the
 * importer, and the rules engine. System-specific; the only system this
 * project ships. See CLAUDE.md's Architecture section and
 * `systems/pf2e/README.md`.
 */

export {
  ACTION_COSTS,
  ATTRIBUTES,
  DAMAGE_TYPES,
  PROFICIENCY_BONUS,
  PROFICIENCY_RANKS,
  RARITIES,
  actionCostSchema,
  attributeSchema,
  damageTypeSchema,
  proficiencyRankSchema,
  raritySchema,
  traitSlugSchema,
  type ActionCost,
  type Attribute,
  type DamageType,
  type ProficiencyRank,
  type Rarity,
} from './content/common.js';

export { actionEntrySchema, type ActionEntry } from './content/action.js';

export {
  FEAT_CATEGORIES,
  featCategorySchema,
  featEntrySchema,
  type FeatCategory,
  type FeatEntry,
} from './content/feat.js';

export {
  WEAPON_CATEGORIES,
  WEAPON_DAMAGE_TYPES,
  WEAPON_GROUPS,
  weaponCategorySchema,
  weaponDamageSchema,
  weaponDamageTypeSchema,
  weaponEntrySchema,
  weaponGroupSchema,
  type WeaponCategory,
  type WeaponDamage,
  type WeaponDamageType,
  type WeaponEntry,
  type WeaponGroup,
} from './content/weapon.js';
