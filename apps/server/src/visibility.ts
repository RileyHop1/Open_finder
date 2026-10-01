/**
 * What a given viewer is allowed to be *sent*: the one place the server's
 * "who is asking" rule lives, shared by the live broadcast, the sync replay,
 * and the documents route. It is spoiler protection for the normal UI, not
 * access control against a determined player -- ADR 0007 deliberately trusts
 * the table, and `Seat.pin` / `claimedByDeviceToken` are not redacted either.
 *
 * A document (or a deletion's tombstone) is sent when `canReadDocument` says so (`packages/core`),
 * and a document that has just become unreadable is sent as a deletion to those who held it
 * (`broadcastFor`).
 * Operations carry their payload, and a payload can describe a document the
 * viewer cannot see (a future `actor.update` on a hidden NPC), so a payload is
 * withheld, replaced by `{}`, whenever it could reveal one.
 */

import type { AppliedOperation, BaseDocument, Broadcast, Seat } from '@hearthtable/core';
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
 *
 * **Taking access away.** A document that changed and is now unreadable to this
 * viewer is not just dropped if they could read it *before* (`previous`, from
 * `recordPreviousDocuments`): they hold a copy, so it is sent as a deletion
 * (the bare envelope as they last saw it) and their client removes it. A viewer
 * who could not read it before gets nothing, so editing a hidden document never
 * announces that it exists. This is how hiding a token, or moving the party out
 * of a scene, reaches the players who already have it (ADR 0017).
 */
export function broadcastFor(
  seat: Seat | undefined,
  broadcast: Broadcast,
  previous: ReadonlyMap<string, BaseDocument> = new Map(),
): Broadcast {
  const documents: Broadcast['documents'] = [];
  const revoked: BaseDocument[] = [];
  for (const document of broadcast.documents) {
    if (canReadDocument(seat, document)) {
      documents.push(document);
      continue;
    }
    const before = previous.get(document.id);
    if (before !== undefined && canReadDocument(seat, before)) {
      revoked.push(before);
    }
  }
  const deleted = broadcast.deleted.filter((document) => canReadDocument(seat, document));
  const alreadyDeleted = new Set(deleted.map((document) => document.id));
  const revocations = revoked.filter((document) => !alreadyDeleted.has(document.id));

  if (
    documents.length === broadcast.documents.length &&
    deleted.length === broadcast.deleted.length
  ) {
    return broadcast;
  }
  return {
    ...broadcast,
    documents,
    deleted: [...deleted, ...revocations],
    operation: withoutPayload(broadcast.operation),
  };
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
