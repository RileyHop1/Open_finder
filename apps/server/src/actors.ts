/**
 * Actor operations: creating and deleting. Pure with respect to the
 * connection -- they take the already-resolved `Seat` and a `WorldStore` and
 * return what changed -- so they can be tested without a socket, and
 * `realtime.ts` only has to dispatch to them.
 *
 * Who may do what (the decision recorded in the milestone 3 plan):
 * - **Any seat may create** an actor, and becomes its `owner`. Everyone at the
 *   table can see it (`observer`), so a party can see each other's sheets. The
 *   GM can change either afterwards.
 * - **Only an owner may delete** one, and the GM always owns (`writeGuard.ts`).
 */

import type { Actor, BaseDocument, Seat } from '@hearthtable/core';
import { actorSchema, baseDocumentSchema } from '@hearthtable/core';
import { newCharacterData } from '@hearthtable/pf2e';

import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

/**
 * Creates and stores an actor owned by `seat`. A character gets a blank
 * level 1 sheet built here, never taken from the client; an NPC or hazard
 * gets an empty system payload until their schemas exist.
 */
export function createActor(
  store: WorldStore,
  seat: Seat,
  payload: { kind: Actor['kind']; name: string },
): Actor {
  const now = new Date().toISOString();
  const actor = actorSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: { [seat.id]: 'owner' } },
    createdAt: now,
    updatedAt: now,
    kind: payload.kind,
    name: payload.name,
    system: payload.kind === 'character' ? newCharacterData() : {},
  });
  store.putDocument(actor);
  return actor;
}

/**
 * Deletes actor `actorId` if `seat` owns it, and returns its bare envelope as
 * the tombstone to broadcast (never the body, so a deletion does not re-send
 * what was removed). Does nothing else yet: a party that lists this actor
 * still does, until `party.*` operations exist (B.7) and clean it up.
 */
export function deleteActor(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string },
): BaseDocument {
  const { raw } = loadOwnedDocument(store, seat, payload.actorId, 'actor', 'actor');
  const tombstone = baseDocumentSchema.parse(raw);
  store.deleteDocument(payload.actorId);
  return tombstone;
}
