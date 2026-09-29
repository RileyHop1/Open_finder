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
  SIZES,
  actionCostSchema,
  attributeSchema,
  damageTypeSchema,
  proficiencyRankSchema,
  raritySchema,
  sizeSchema,
  traitSlugSchema,
  type ActionCost,
  type Attribute,
  type DamageType,
  type ProficiencyRank,
  type Rarity,
  type Size,
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

export {
  ARMOR_CATEGORIES,
  ARMOR_GROUPS,
  armorCategorySchema,
  armorEntrySchema,
  armorGroupSchema,
  type ArmorCategory,
  type ArmorEntry,
  type ArmorGroup,
} from './content/armor.js';

export { gearEntrySchema, type GearEntry } from './content/gear.js';

export {
  AREA_SHAPES,
  MAGICAL_TRADITIONS,
  SPELL_SAVES,
  areaShapeSchema,
  magicalTraditionSchema,
  spellAreaSchema,
  spellDefenseSchema,
  spellEntrySchema,
  spellHeighteningSchema,
  spellRangeSchema,
  spellSaveSchema,
  type AreaShape,
  type MagicalTradition,
  type SpellArea,
  type SpellDefense,
  type SpellEntry,
  type SpellHeightening,
  type SpellRange,
  type SpellSave,
} from './content/spell.js';

export { ancestryEntrySchema, type AncestryEntry } from './content/ancestry.js';

export { heritageEntrySchema, type HeritageEntry } from './content/heritage.js';

export { backgroundEntrySchema, type BackgroundEntry } from './content/background.js';

export {
  classArmorProficienciesSchema,
  classEntrySchema,
  classFeatureEntrySchema,
  classProficienciesSchema,
  classSavingThrowProficienciesSchema,
  classSkillsSchema,
  classWeaponProficienciesSchema,
  proficiencyProgressionSchema,
  rankAtLevel,
  type ClassEntry,
  type ClassFeatureEntry,
  type ClassProficiencies,
  type ClassSkills,
  type ProficiencyProgression,
} from './content/class.js';

export {
  creatureAttributesSchema,
  creatureDefenseAdjustmentSchema,
  creatureEntrySchema,
  creatureSavingThrowsSchema,
  creatureSpeedsSchema,
  creatureStrikeDamageSchema,
  creatureStrikeSchema,
  type CreatureAttributes,
  type CreatureDefenseAdjustment,
  type CreatureEntry,
  type CreatureSavingThrows,
  type CreatureSpeeds,
  type CreatureStrike,
  type CreatureStrikeDamage,
} from './content/creature.js';

export { conditionEntrySchema, type ConditionEntry } from './content/condition.js';

export {
  PF2E_ENTRY_KINDS,
  pf2eEntrySchema,
  type Pf2eEntry,
  type Pf2eEntryKind,
} from './content/entry.js';

export { applyBoost, applyFlaw, attributeModifier } from './rules/attributes.js';

export { proficiencyModifier } from './rules/proficiency.js';
