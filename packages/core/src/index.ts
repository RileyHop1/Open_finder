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

export { seatSchema, type Seat } from './seat.js';

export {
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

export { resolvePermission } from './permission.js';
