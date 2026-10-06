/**
 * @hearthtable/core -- the document model: Zod schemas, permissions, and
 * shared types every other package builds on. System-agnostic; see
 * CLAUDE.md's Architecture section, `docs/documents.md`, and
 * `docs/world-and-seats.md`.
 */

export {
  baseRecordSchema,
  idSchema,
  schemaVersionSchema,
  timestampSchema,
  type BaseRecord,
} from './record.js';

export {
  PERMISSION_LEVELS,
  baseDocumentSchema,
  documentPermissionsSchema,
  permissionLevelSchema,
  type BaseDocument,
  type DocumentPermissions,
  type PermissionLevel,
} from './document.js';

export { worldSchema, type World } from './world.js';

export {
  chatCheckMessageSchema,
  chatItemUseMessageSchema,
  chatStrikeAttackMessageSchema,
  chatStrikeDamageMessageSchema,
  chatMessageSchema,
  chatRollMessageSchema,
  chatTextMessageSchema,
  damageByTypeSchema,
  degreeOfSuccessSchema,
  rollResultSchema,
  rollTermSchema,
  type ChatCheckMessage,
  type ChatItemUseMessage,
  type ChatStrikeAttackMessage,
  type ChatStrikeDamageMessage,
  type ChatMessage,
  type ChatRollMessage,
  type ChatTextMessage,
} from './chatMessage.js';

export {
  emptyHotbar,
  hotbarActionSchema,
  hotbarCostSchema,
  hotbarSchema,
  HOTBAR_SLOTS,
  MAX_SITUATIONAL_MODIFIERS,
  situationalModifierSchema,
  situationalModifiersSchema,
  type HotbarAction,
  type SituationalModifier,
} from './quickbar.js';
export {
  ACTOR_KINDS,
  actorKindSchema,
  actorSchema,
  type Actor,
  type ActorKind,
} from './actor.js';

export { applyChanges, parsePath, PatchError } from './patch.js';

export { partySchema, type Party } from './party.js';

export {
  GRID_TYPES,
  MAX_SCENE_PIXELS,
  SCENE_KINDS,
  gridTypeSchema,
  sceneGridChangesSchema,
  sceneGridSchema,
  sceneKindSchema,
  sceneLinkSchema,
  sceneSchema,
  type GridType,
  type Scene,
  type SceneGrid,
  type SceneGridChanges,
  type SceneKind,
  type SceneLink,
} from './scene.js';

export { MAX_TOKEN_SIZE, tokenSchema, type Token } from './token.js';

export {
  MAX_TEMPLATE_FEET,
  TEMPLATE_SHAPES,
  templateSchema,
  templateShapeSchema,
  type Template,
  type TemplateShape,
} from './template.js';

export {
  COMBAT_STATUSES,
  MAX_COUNTER,
  MAX_INITIATIVE,
  MAX_ROUND,
  combatSchema,
  combatStatusSchema,
  combatantSchema,
  turnStateSchema,
  type Combat,
  type Combatant,
  type CombatStatus,
  type TurnState,
} from './combat.js';

export type { Cell, Footprint, GridStrategy, Point } from './grid/gridStrategy.js';
export { GridlessGrid } from './grid/gridless.js';

export { seatSchema, type Seat } from './seat.js';

export {
  actorCreateFromCreatureOperationSchema,
  actorCreateOperationSchema,
  actorDeleteOperationSchema,
  actorAddConditionOperationSchema,
  actorAddItemOperationSchema,
  actorRemoveConditionOperationSchema,
  actorSetConditionOperationSchema,
  MAX_CONDITION_VALUE,
  MAX_ROLL_DC,
  actorRollCheckOperationSchema,
  actorRollDamageOperationSchema,
  actorRollStrikeOperationSchema,
  partyAddMemberOperationSchema,
  partyRemoveMemberOperationSchema,
  partyReorderOperationSchema,
  sceneCreateOperationSchema,
  sceneDeleteOperationSchema,
  sceneActivateOperationSchema,
  tokenChangesSchema,
  tokenCreateOperationSchema,
  tokenDeleteOperationSchema,
  tokenMoveOperationSchema,
  tokenUpdateOperationSchema,
  templatePlaceOperationSchema,
  templateRemoveOperationSchema,
  combatCreateOperationSchema,
  combatAddCombatantOperationSchema,
  combatRemoveCombatantOperationSchema,
  combatRollInitiativeOperationSchema,
  combatSetInitiativeOperationSchema,
  combatMoveCombatantOperationSchema,
  combatStartOperationSchema,
  combatEndOperationSchema,
  combatNextTurnOperationSchema,
  combatPreviousTurnOperationSchema,
  combatSetMovementRulingOperationSchema,
  combatSpendActionOperationSchema,
  combatUndoOperationSchema,
  actorApplyDamageOperationSchema,
  actorHealOperationSchema,
  actorRollRecoveryOperationSchema,
  actorAdjustCoinsOperationSchema,
  partyAdjustCoinsOperationSchema,
  inventoryTransferOperationSchema,
  transferHolderSchema,
  type TransferHolder,
  type TransferPayload,
  actorUseItemOperationSchema,
  type CoinsDelta,
  MAX_HIT_POINT_CHANGE,
  sceneAddLinkOperationSchema,
  sceneRemoveLinkOperationSchema,
  sceneUpdateOperationSchema,
  sceneChangesSchema,
  actorRemoveItemOperationSchema,
  actorUpdateItemOperationSchema,
  actorUpdateOperationSchema,
  actorSetQuickbarOperationSchema,
  MAX_ITEM_QUANTITY,
  MAX_ACTOR_CHANGES,
  appliedOperationSchema,
  broadcastSchema,
  chatSendMessageOperationSchema,
  chatSendRollOperationSchema,
  chatAdjustRollOperationSchema,
  MAX_GM_ROLL_TOTAL,
  clientOperationSchema,
  clientOperationUnionSchema,
  seatClaimOperationSchema,
  seatReleaseOperationSchema,
  type AnyClientOperation,
  type AppliedOperation,
  type Broadcast,
  type ClientOperation,
} from './operation.js';

export {
  MODIFIER_TYPES,
  modifierSchema,
  modifierTypeSchema,
  resolvedModifierSchema,
  statisticSchema,
  type Modifier,
  type ModifierType,
  type ResolvedModifier,
  type Statistic,
} from './modifier.js';

export { predicateSchema, testPredicate, type Predicate } from './predicate.js';

export { resolveStatistic, type ResolveStatisticOptions } from './resolveStatistic.js';

export {
  DAMAGE_DICE_FACES,
  choiceOptionSchema,
  choiceSetElementSchema,
  damageDiceElementSchema,
  damageDiceFacesSchema,
  flatModifierElementSchema,
  grantItemElementSchema,
  inertRuleElementSchema,
  rollOptionElementSchema,
  ruleElementSchema,
  type ChoiceOption,
  type ChoiceSetElement,
  type DamageDiceElement,
  type FlatModifierElement,
  type GrantItemElement,
  type InertRuleElement,
  type RollOptionElement,
  type RuleElement,
} from './ruleElement.js';

export {
  canReadDocument,
  resolvePermission,
  resolveViewerPermission,
} from './permission.js';

export {
  LICENSES,
  licenseSchema,
  provenanceSchema,
  type License,
  type Provenance,
} from './provenance.js';

export {
  compendiumEntrySchema,
  packManifestSchema,
  type CompendiumEntry,
  type PackManifest,
} from './compendium.js';

export {
  TERM_KINDS,
  richTextNodeSchema,
  richTextSchema,
  termKindSchema,
  type HeadingLevel,
  type RichText,
  type RichTextNode,
  type TermKind,
} from './richText.js';

export { traitEntrySchema, type TraitEntry } from './traitEntry.js';

export { sameName } from './name.js';

export { tokenDragSchema } from './realtime.js';

export type {
  ClientToServerEvents,
  OperationAck,
  ServerToClientEvents,
  SyncAck,
  TokenDrag,
} from './realtime.js';
