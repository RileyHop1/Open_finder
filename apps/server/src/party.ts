/**
 * Party operations: who is in the adventuring group and in what order. The
 * world has one party, created the first time anything needs it, and only the
 * GM changes it (the party bar's membership is a table decision, not a
 * player's). Players still *see* it: it is `observer` for everyone.
 *
 * Membership is cleaned up here as well as edited: deleting an actor takes it
 * out of the party (`removeFromParty`), so the party never lists an actor that
 * no longer exists.
 */

import type { Seat } from '@hearthtable/core';
import { actorSchema, partySchema, type Party } from '@hearthtable/core';

import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

function requireGM(seat: Seat): void {
  if (!seat.isGM) {
    throw new OperationRejected('only the GM can change the party');
  }
}

/** The world's party, or `undefined` if none has been created yet. */
function findParty(store: WorldStore): Party | undefined {
  const [raw] = store.listDocuments('party');
  return raw === undefined ? undefined : partySchema.parse(raw);
}

function newParty(store: WorldStore): Party {
  const now = new Date().toISOString();
  return partySchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'party',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    name: 'Party',
    memberIds: [],
    level: 1,
  });
}

function save(store: WorldStore, party: Party, memberIds: string[]): Party {
  const updated: Party = {
    ...party,
    memberIds,
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/** Adds actor `actorId` to the end of the party, creating the party if need be. Adding a current member changes nothing. */
export function addPartyMember(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string },
): Party {
  requireGM(seat);
  const actor = actorSchema.safeParse(store.getDocument(payload.actorId));
  if (!actor.success) {
    throw new OperationRejected(`no actor found with id ${payload.actorId}`);
  }
  if (actor.data.kind === 'hazard') {
    throw new OperationRejected('a hazard cannot join the party');
  }
  const party = findParty(store) ?? newParty(store);
  if (party.memberIds.includes(payload.actorId)) {
    return party;
  }
  return save(store, party, [...party.memberIds, payload.actorId]);
}

/** Removes actor `actorId` from the party. Not being a member is not an error. */
export function removePartyMember(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string },
): Party | undefined {
  requireGM(seat);
  return removeFromParty(store, payload.actorId);
}

/**
 * Takes `actorId` out of the party if it is in it, returning the changed
 * party, or `undefined` if there was nothing to change. Not GM-checked: it is
 * also what deleting an actor calls, and the deleting seat may be its owner.
 */
export function removeFromParty(store: WorldStore, actorId: string): Party | undefined {
  const party = findParty(store);
  if (party === undefined || !party.memberIds.includes(actorId)) {
    return undefined;
  }
  return save(
    store,
    party,
    party.memberIds.filter((id) => id !== actorId),
  );
}

/**
 * Clears the party's scene if it is `sceneId`, returning the changed party, or
 * `undefined` if the party was not there. Called when a scene is deleted, so the
 * party never points at a scene that no longer exists. Not GM-checked: the caller
 * already is.
 */
export function clearPartyScene(store: WorldStore, sceneId: string): Party | undefined {
  const party = findParty(store);
  if (party?.sceneId !== sceneId) {
    return undefined;
  }
  const updated: Party = { ...party, updatedAt: new Date().toISOString() };
  delete updated.sceneId;
  store.putDocument(updated);
  return updated;
}

/** Sets the party order. `memberIds` must be exactly the current members, each once. */
export function reorderParty(
  store: WorldStore,
  seat: Seat,
  payload: { memberIds: readonly string[] },
): Party {
  requireGM(seat);
  const party = findParty(store) ?? newParty(store);
  const wanted = new Set(payload.memberIds);
  const sameMembers =
    wanted.size === payload.memberIds.length &&
    wanted.size === party.memberIds.length &&
    party.memberIds.every((id) => wanted.has(id));
  if (!sameMembers) {
    throw new OperationRejected(
      'reorder must list exactly the current party members, each once',
    );
  }
  return save(store, party, [...payload.memberIds]);
}
