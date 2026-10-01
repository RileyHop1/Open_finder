/**
 * Permission resolution: what a seat can actually do with a document, as
 * opposed to what's stored on the document (that's `document.ts`'s
 * `documentPermissionsSchema`). See CLAUDE.md's Architecture section
 * ("Permissions per document... GM sees all") and ADR 0007.
 */

import type { BaseDocument, PermissionLevel } from './document.js';
import type { Seat } from './seat.js';

/**
 * Resolves `seat`'s effective permission level against `document`.
 *
 * - The GM always resolves to `owner`, regardless of what's stored on the
 *   document ("GM sees all") -- a GM seat is never limited by a document's
 *   own permissions object.
 * - Otherwise, an explicit per-seat override wins; a seat with no override
 *   falls back to the document's `default`.
 * - A seat and a document from *different* worlds always resolve to `none`.
 *   Callers should never call this with a mismatched pair in the first
 *   place -- every real caller resolves within one connection's single
 *   active world -- but this function does not trust that they won't.
 */
export function resolvePermission(seat: Seat, document: BaseDocument): PermissionLevel {
  if (seat.worldId !== document.worldId) {
    return 'none';
  }
  if (seat.isGM) {
    return 'owner';
  }
  return document.permissions.seats[seat.id] ?? document.permissions.default;
}

/**
 * The level a viewer who may not have claimed a seat resolves to. A
 * connection that has not claimed a seat yet (the lobby) is not the GM and has
 * no per-seat override, so it gets exactly the document's `default`.
 */
export function resolveViewerPermission(
  seat: Seat | undefined,
  document: BaseDocument,
): PermissionLevel {
  return seat === undefined
    ? document.permissions.default
    : resolvePermission(seat, document);
}

/**
 * Whether `seat` may be *sent* `document` at all: `observer` or `owner`.
 *
 * `limited` (and `none`) are not sent. `limited` is meant to show a document's
 * existence without its details, which needs a per-type redaction step that
 * does not exist yet; withholding the whole document is the safe choice until
 * it does, because sending it would leak everything. This is spoiler
 * protection for the normal UI, not access control against a determined
 * player (ADR 0007: the table is trusted).
 */
export function canReadDocument(seat: Seat | undefined, document: BaseDocument): boolean {
  const level = resolveViewerPermission(seat, document);
  return level === 'observer' || level === 'owner';
}
