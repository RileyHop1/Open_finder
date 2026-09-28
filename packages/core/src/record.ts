/**
 * The absolute minimum shape anything persisted by this project shares: an
 * identity, a migratable version, and when it was created and last touched.
 *
 * `Document` (document.ts), `World`, and `Seat` all extend this. Extracted
 * here rather than duplicated three times, now that three real consumers
 * actually need the identical trio -- see the Development order section of
 * CLAUDE.md on not generalizing ahead of a real second (here, third) use.
 */

import { z } from 'zod';

/**
 * A v4 UUID from `crypto.randomUUID()` -- available natively in both the
 * browser and Node, needs no dependency, and can be generated client-side
 * before the server ever sees the record (the same reasoning ADR 0005
 * applies to operation IDs, for the same optimistic-update purpose). Used
 * for every ID in this project: a record's own `id`, and any field that
 * references one (`worldId`, etc).
 */
export const idSchema = z.uuid();

/**
 * ISO 8601 timestamp strings, not epoch numbers or native `Date` objects.
 * Everything here round-trips through JSON (SQLite JSON columns, the export
 * archive, `world.json`), where neither has a native representation; an ISO
 * string stays human-readable in a raw file and sorts correctly as a plain
 * string.
 */
export const timestampSchema = z.iso.datetime();

/**
 * Forward-only, numbered from 1. The migration runner that acts on this
 * field lands in a later PR; the field exists on everything persisted
 * regardless, because retrofitting it onto records already sitting in a
 * real campaign is the expensive mistake CLAUDE.md's Data durability
 * section warns against.
 */
export const schemaVersionSchema = z.number().int().positive();

export const baseRecordSchema = z.object({
  id: idSchema,
  schemaVersion: schemaVersionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

export type BaseRecord = z.infer<typeof baseRecordSchema>;
