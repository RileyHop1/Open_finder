/**
 * @hearthtable/core -- the document model: Zod schemas, permissions, and
 * shared types every other package builds on. System-agnostic; see
 * CLAUDE.md's Architecture section and `docs/documents.md`.
 */

export {
  PERMISSION_LEVELS,
  baseDocumentSchema,
  documentIdSchema,
  documentPermissionsSchema,
  permissionLevelSchema,
  timestampSchema,
  type BaseDocument,
  type DocumentPermissions,
  type PermissionLevel,
} from './document.js';
