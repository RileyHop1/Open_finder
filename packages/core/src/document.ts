/**
 * The shared envelope every polymorphic content document (Actor, Item,
 * Party, JournalEntry, Scene, Combat, ChatMessage, Calendar, RollTable) will
 * carry -- see CLAUDE.md's "Everything is a Document" list under
 * Architecture. None of those concrete types exist yet; this module is just
 * the shape they will all extend.
 *
 * `World` and `Seat` (this package's next schemas) do NOT extend this: a
 * World cannot belong to itself (it has no `worldId`), and a Seat is not
 * permission-gated the way a document is. See docs/documents.md.
 */

import { z } from 'zod';

/**
 * The four-level access scale from CLAUDE.md's Architecture section,
 * borrowed from Foundry's document permission model.
 *
 * Resolving a seat's *effective* level against a document -- including the
 * rule that the GM always resolves to `owner` regardless of what's stored
 * here -- is resolution logic, not a stored shape, and lands in a later PR.
 * This schema only describes what gets persisted.
 */
export const PERMISSION_LEVELS = ['none', 'limited', 'observer', 'owner'] as const;

export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export const permissionLevelSchema = z.enum(PERMISSION_LEVELS);

/**
 * A document's stored permissions: a `default` level for any seat with no
 * explicit entry, plus per-seat overrides.
 *
 * `default` has no schema-level default value, on purpose. Different
 * document types want different defaults -- a ChatMessage is plausibly
 * observer-by-default (chat is public at the table), while a GM's private
 * journal note is plausibly none-by-default -- and baking one assumption in
 * here would silently make that choice for every future document type
 * instead of leaving it to each type's own construction code.
 */
export const documentPermissionsSchema = z.object({
  default: permissionLevelSchema,
  seats: z.record(z.string(), permissionLevelSchema).default({}),
});

export type DocumentPermissions = z.infer<typeof documentPermissionsSchema>;

/**
 * Every document ID is a v4 UUID, generated with `crypto.randomUUID()` --
 * available natively in both the browser and Node, needs no dependency, and
 * can be generated client-side before the server ever sees the document
 * (the same reasoning ADR 0005 applies to operation IDs, for the same
 * optimistic-update reason).
 */
export const documentIdSchema = z.uuid();

/**
 * ISO 8601 timestamp strings, not epoch numbers or native `Date` objects.
 * Documents round-trip through JSON (SQLite JSON columns, the export
 * archive), where `Date` has no native representation; an ISO string stays
 * human-readable in a raw database dump and sorts correctly as a plain
 * string, which an epoch number does too but is not human-readable, and a
 * `Date` object is neither.
 */
export const timestampSchema = z.iso.datetime();

/**
 * The shared envelope every content document carries. A concrete document
 * type extends this with its own fields and narrows `type` to a literal:
 *
 * ```ts
 * const partySchema = baseDocumentSchema.extend({
 *   type: z.literal('party'),
 *   memberIds: z.array(documentIdSchema),
 * });
 * ```
 *
 * `type` stays a generic non-empty string here rather than a pre-declared
 * union of every future document kind (`'actor' | 'item' | 'party' | ...`),
 * because most of those kinds don't exist as real schemas yet -- see
 * CLAUDE.md's Development order section on growing the surface per slice
 * rather than speculating the full list now.
 */
export const baseDocumentSchema = z.object({
  id: documentIdSchema,
  worldId: documentIdSchema,
  type: z.string().min(1),
  /**
   * Forward-only, numbered from 1. The migration runner that acts on this
   * field lands in a later PR; the field exists now regardless, because
   * retrofitting it onto documents already sitting in a real campaign is
   * the expensive mistake CLAUDE.md's Data durability section warns against.
   */
  schemaVersion: z.number().int().positive(),
  permissions: documentPermissionsSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type BaseDocument = z.infer<typeof baseDocumentSchema>;
