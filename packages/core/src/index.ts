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
  chatMessageSchema,
  chatRollMessageSchema,
  chatTextMessageSchema,
  damageByTypeSchema,
  degreeOfSuccessSchema,
  rollResultSchema,
  rollTermSchema,
  type ChatMessage,
  type ChatRollMessage,
  type ChatTextMessage,
} from './chatMessage.js';

export {
  ACTOR_KINDS,
  actorKindSchema,
  actorSchema,
  type Actor,
  type ActorKind,
} from './actor.js';

export { partySchema, type Party } from './party.js';

export { seatSchema, type Seat } from './seat.js';

export {
  actorCreateOperationSchema,
  actorDeleteOperationSchema,
  actorAddConditionOperationSchema,
  actorAddItemOperationSchema,
  actorRemoveConditionOperationSchema,
  actorSetConditionOperationSchema,
  MAX_CONDITION_VALUE,
  partyAddMemberOperationSchema,
  partyRemoveMemberOperationSchema,
  partyReorderOperationSchema,
  actorRemoveItemOperationSchema,
  actorUpdateItemOperationSchema,
  actorUpdateOperationSchema,
  MAX_ITEM_QUANTITY,
  MAX_ACTOR_CHANGES,
  appliedOperationSchema,
  broadcastSchema,
  chatSendMessageOperationSchema,
  chatSendRollOperationSchema,
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

export type {
  ClientToServerEvents,
  OperationAck,
  ServerToClientEvents,
  SyncAck,
} from './realtime.js';
