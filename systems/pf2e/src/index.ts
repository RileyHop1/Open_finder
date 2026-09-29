/**
 * @hearthtable/pf2e -- Pathfinder 2E content schemas, rule elements, the
 * importer, and the rules engine. System-specific; the only system this
 * project ships. See CLAUDE.md's Architecture section and
 * `systems/pf2e/README.md`.
 */

export {
  ACTION_COSTS,
  ATTRIBUTES,
  PROFICIENCY_BONUS,
  PROFICIENCY_RANKS,
  RARITIES,
  actionCostSchema,
  attributeSchema,
  proficiencyRankSchema,
  raritySchema,
  traitSlugSchema,
  type ActionCost,
  type Attribute,
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
