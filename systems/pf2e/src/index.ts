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

export { BASIC_ACTIONS, type BasicAction } from './content/basicActions.js';

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

export {
  CONSUMABLE_CATEGORIES,
  consumableCategorySchema,
  consumableSchema,
  consumableSpellRefSchema,
  consumableUsesSchema,
  gearEntrySchema,
  type Consumable,
  type ConsumableCategory,
  type ConsumableSpellRef,
  type ConsumableUses,
  type GearEntry,
} from './content/gear.js';

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

export { newNpcFromCreature, npcDataSchema, type NpcData } from './content/npc.js';

export { conditionEntrySchema, type ConditionEntry } from './content/condition.js';

export {
  PF2E_ENTRY_KINDS,
  pf2eEntrySchema,
  type Pf2eEntry,
  type Pf2eEntryKind,
} from './content/entry.js';

export {
  applyBoost,
  applyFlaw,
  attributeModifier,
  ATTRIBUTE_LABELS,
} from './rules/attributes.js';

export {
  buildArmorClass,
  buildSave,
  SAVE_TYPES,
  type BuildArmorClassOptions,
  type BuildSaveOptions,
  type SaveType,
} from './rules/defenses.js';

export { proficiencyModifier } from './rules/proficiency.js';

export { footprintForSize, SquareGrid } from './rules/squareGrid.js';

export {
  buildClassDc,
  buildPerception,
  buildSkill,
  SKILLS,
  type BuildClassDcOptions,
  type BuildPerceptionOptions,
  type BuildSkillOptions,
  type Skill,
} from './rules/skills.js';

export { rollCheck, type CheckRoll, type RollCheckOptions } from './rules/rollCheck.js';

export {
  buildStrikeAttack,
  rollStrikeAttack,
  type BuildStrikeAttackOptions,
  type RollStrikeAttackOptions,
  type StrikeAttackRoll,
} from './rules/strike.js';

export {
  buildStrikeDamage,
  rollStrikeDamage,
  type BuildStrikeDamageOptions,
  type RollStrikeDamageOptions,
} from './rules/strikeDamage.js';

export {
  adjustDc,
  DC_ADJUSTMENTS,
  levelDc,
  simpleDc,
  type DcAdjustment,
} from './rules/dcs.js';

export { conditionModifiers, type ConditionTarget } from './rules/conditionModifiers.js';

export { buildMaxHitPoints, type BuildMaxHitPointsOptions } from './rules/hitPoints.js';
export {
  applyDamage,
  applyHealing,
  grantTemporaryHitPoints,
  type HitPointState,
} from './rules/hitPointChanges.js';

export {
  applyRuleElements,
  type AppliedRuleElements,
  type ApplyRuleElementsOptions,
  type RuleElementSource,
} from './rules/applyRuleElements.js';

export {
  TURN_BOUNDARIES,
  conditionDurationSchema,
  type ConditionDuration,
  type TurnBoundary,
} from './content/conditionDuration.js';

export { durationSeconds, longerDuration } from './rules/conditionDuration.js';

export {
  nextCombatant,
  previousCombatant,
  sortByInitiative,
  takesTurns,
  type InitiativeEntry,
  type TurnStep,
} from './rules/initiativeOrder.js';

export { placeCombatant, type InitiativeChange } from './rules/initiativeReorder.js';

export {
  BASE_ACTIONS,
  actionCapacity,
  type ActionCapacity,
} from './rules/actionCapacity.js';

export {
  averageDamage,
  persistentDamageSchema,
  type PersistentDamage,
} from './content/persistentDamage.js';

export { meleeReach, naturalReach, threatenedCells, threatens } from './rules/reach.js';

export { speedOf, stridesFor } from './rules/movement.js';

export {
  OPPOSITE_SIDES_TOLERANCE_DEGREES,
  flanks,
  onOppositeSides,
} from './rules/flanking.js';

export {
  ASSISTED_FLAT_CHECK_DC,
  FLAT_CHECK_DC,
  addPersistentDamage,
  endsPersistentDamage,
  flatCheckDc,
  persistentDamageDue,
  resolvePersistentDamage,
  type PersistentDamageEvent,
  type PersistentDamageResult,
} from './rules/persistentDamage.js';

export {
  damageWhileDying,
  deathThreshold,
  dyingStateOf,
  healFromDying,
  instantDeath,
  knockOut,
  recoveryChange,
  recoveryCheck,
  recoveryDc,
  withDyingState,
  type DyingEvent,
  type DyingResult,
  type DyingState,
} from './rules/dyingChain.js';

export {
  endOfTurn,
  startOfTurn,
  type TurnChange,
  type TurnEvent,
  type TurnParticipant,
  type TurnResult,
} from './rules/turnBoundaries.js';

export {
  appliedConditionSchema,
  characterAttributesSchema,
  characterDataSchema,
  characterItemEntrySchema,
  characterItemSchema,
  characterRanksSchema,
  newCharacterData,
  contentRefSchema,
  itemSourceSchema,
  type AppliedCondition,
  type CharacterData,
  type CharacterItem,
  type CharacterRanks,
} from './content/character.js';

export { ZERO_COINS, coinsSchema, type Coins } from './content/coins.js';

export {
  newPartyStash,
  partyStashSchema,
  stashItemSchema,
  type PartyStash,
  type StashItem,
} from './content/partyStash.js';

export {
  prepareCharacter,
  type InertItem,
  type PreparedCharacter,
} from './rules/prepareCharacter.js';

export { prepareStrikes, type PreparedStrike } from './rules/prepareStrikes.js';

export {
  prepareNpc,
  type PreparedNpc,
  type PreparedNpcStrike,
} from './rules/prepareNpc.js';

export {
  addCondition,
  removeCondition,
  setCondition,
  type ConditionDefinitions,
} from './rules/conditionMerge.js';

export { parseBookPage, parseInline } from './book/bookPageParser.js';

export { BOOK_PAGES, type BookPage } from './book/pages.js';
