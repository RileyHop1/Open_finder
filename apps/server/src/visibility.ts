/**
 * What a given viewer is allowed to be *sent*: the one place the server's
 * "who is asking" rule lives, shared by the live broadcast, the sync replay,
 * and the documents route. It is spoiler protection for the normal UI, not
 * access control against a determined player -- ADR 0007 deliberately trusts
 * the table, and `Seat.pin` / `claimedByDeviceToken` are not redacted either.
 *
 * A document is sent when `canReadDocument` says so (`packages/core`).
 * Operations carry their payload, and a payload can describe a document the
 * viewer cannot see (a future `actor.update` on a hidden NPC), so a payload is
 * withheld, replaced by `{}`, whenever it could reveal one.
 */

import type { AppliedOperation, Broadcast, Seat } from '@hearthtable/core';
import { baseDocumentSchema, canReadDocument } from '@hearthtable/core';

/** Operation types whose payload is public to everyone at the table, so sync replays them in full. */
const PUBLIC_PAYLOAD_TYPES: ReadonlySet<string> = new Set([
  'seat.claim',
  'seat.release',
  'chat.sendMessage',
  'chat.sendRoll',
]);

/** `operation` with its payload withheld. */
function withoutPayload(operation: AppliedOperation): AppliedOperation {
  return { ...operation, payload: {} };
}

/**
 * The broadcast `seat` (or a viewer with no seat) should receive. Documents
 * they cannot read are dropped. If any were dropped, the operation's payload
 * is withheld too, unless the viewer is the GM. The sequence number and the
 * operation's identity are always kept, so a client never sees a gap in the
 * sequence just because it was not allowed to see what changed.
 */
export function broadcastFor(seat: Seat | undefined, broadcast: Broadcast): Broadcast {
  const documents = broadcast.documents.filter((document) =>
    canReadDocument(seat, document),
  );
  if (documents.length === broadcast.documents.length) {
    return broadcast;
  }
  return { ...broadcast, documents, operation: withoutPayload(broadcast.operation) };
}

/**
 * Operations replayed to a reconnecting client. The log does not record which
 * documents an operation touched, so the rule is by type: public operations
 * keep their payload, anything else is withheld from everyone but the GM.
 */
export function operationsFor(
  seat: Seat | undefined,
  operations: readonly AppliedOperation[],
): AppliedOperation[] {
  if (seat?.isGM === true) {
    return [...operations];
  }
  return operations.map((operation) =>
    PUBLIC_PAYLOAD_TYPES.has(operation.type) ? operation : withoutPayload(operation),
  );
}

/**
 * Stored documents (raw JSON from `WorldStore.listDocuments`) filtered to what
 * `seat` may read. A row that does not even parse as a document envelope is
 * dropped for everyone, since permissions cannot be judged without one.
 */
export function readableDocuments(
  seat: Seat | undefined,
  documents: readonly unknown[],
): unknown[] {
  return documents.filter((raw) => {
    const parsed = baseDocumentSchema.loose().safeParse(raw);
    return parsed.success && canReadDocument(seat, parsed.data);
  });
}
