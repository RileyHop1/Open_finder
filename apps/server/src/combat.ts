/**
 * Combat operations: setting up a combat and choosing who is in it (ADR 0018).
 * Only the GM does any of it. Like the other handler modules these take the
 * already-resolved `Seat` and a `WorldStore` and return what changed, so they
 * are tested without a socket and `realtime.ts` only dispatches.
 *
 * **Visibility is derived here and nowhere else.** A combat is hidden from
 * players while it is `pending` (the GM is still setting it up) and readable once
 * it begins; a combatant is hidden while its combat is pending or its own
 * `hidden` flag is set. A client never sends permissions.
 */

import type {
  BaseDocument,
  Combat,
  Combatant,
  DocumentPermissions,
} from '@hearthtable/core';
import type { Seat, Token } from '@hearthtable/core';
import {
  baseDocumentSchema,
  combatantSchema,
  combatSchema,
  partySchema,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';

import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

/** The permissions a combat has: readable by every seat once it has begun, the GM's alone before. */
export function combatPermissions(status: Combat['status']): DocumentPermissions {
  return { default: status === 'pending' ? 'none' : 'observer', seats: {} };
}

/** The permissions a combatant has: readable unless it is hidden or its combat has not begun. */
export function combatantPermissions(
  status: Combat['status'],
  hidden: boolean,
): DocumentPermissions {
  return { default: status === 'pending' || hidden ? 'none' : 'observer', seats: {} };
}

function requireGM(seat: Seat): void {
  if (!seat.isGM) {
    throw new OperationRejected('only the GM can change a combat');
  }
}

function loadCombat(store: WorldStore, combatId: string): Combat {
  const combat = combatSchema.safeParse(store.getDocument(combatId));
  if (!combat.success) {
    throw new OperationRejected(`no combat found with id ${combatId}`);
  }
  return combat.data;
}

function loadCombatant(store: WorldStore, combatantId: string): Combatant {
  const combatant = combatantSchema.safeParse(store.getDocument(combatantId));
  if (!combatant.success) {
    throw new OperationRejected(`no combatant found with id ${combatantId}`);
  }
  return combatant.data;
}

/** Every combatant of `combatId`. */
function combatantsOf(store: WorldStore, combatId: string): Combatant[] {
  return store
    .listDocuments('combatant')
    .flatMap((raw) => {
      const parsed = combatantSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .filter((combatant) => combatant.combatId === combatId);
}

/** Builds and stores a combatant of `token` in `combat`, with no initiative yet. */
function makeCombatant(
  store: WorldStore,
  combat: Combat,
  token: Token,
  hidden: boolean,
): Combatant {
  const now = new Date().toISOString();
  const combatant = combatantSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'combatant',
    schemaVersion: 1,
    permissions: combatantPermissions(combat.status, hidden),
    createdAt: now,
    updatedAt: now,
    combatId: combat.id,
    tokenId: token.id,
    actorId: token.actorId,
    hidden,
  });
  store.putDocument(combatant);
  return combatant;
}

/**
 * Creates a pending combat on a scene and enrols its fighters: the party's
 * tokens and every token that is not hidden. A hidden token stays out (the GM
 * adds it by hand when it joins the fight). Only one unfinished combat may exist,
 * so two cannot compete for the table's turn order.
 */
export function createCombat(
  store: WorldStore,
  seat: Seat,
  payload: { sceneId: string },
): { combat: Combat; combatants: Combatant[] } {
  requireGM(seat);
  const scene = sceneSchema.safeParse(store.getDocument(payload.sceneId));
  if (!scene.success) {
    throw new OperationRejected(`no scene found with id ${payload.sceneId}`);
  }
  const unfinished = store
    .listDocuments('combat')
    .some((raw) => combatSchema.safeParse(raw).data?.status !== 'ended');
  if (unfinished) {
    throw new OperationRejected('a combat is already set up: end or delete it first');
  }

  const now = new Date().toISOString();
  const combat = combatSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'combat',
    schemaVersion: 1,
    permissions: combatPermissions('pending'),
    createdAt: now,
    updatedAt: now,
    sceneId: scene.data.id,
  });
  store.putDocument(combat);

  const [rawParty] = store.listDocuments('party');
  const party = partySchema.safeParse(rawParty);
  const members = new Set(party.success ? party.data.memberIds : []);
  const combatants: Combatant[] = [];
  for (const raw of store.listDocuments('token')) {
    const token = tokenSchema.safeParse(raw);
    if (
      token.success &&
      token.data.sceneId === scene.data.id &&
      (!token.data.hidden || members.has(token.data.actorId))
    ) {
      combatants.push(makeCombatant(store, combat, token.data, false));
    }
  }
  return { combat, combatants };
}

/** Adds a token that is on the combat's scene to a combat that has not ended. A token may be in a combat once. */
export function addCombatant(
  store: WorldStore,
  seat: Seat,
  payload: { combatId: string; tokenId: string; hidden?: boolean | undefined },
): Combatant {
  requireGM(seat);
  const combat = loadCombat(store, payload.combatId);
  if (combat.status === 'ended') {
    throw new OperationRejected('that combat has ended');
  }
  const token = tokenSchema.safeParse(store.getDocument(payload.tokenId));
  if (!token.success || token.data.sceneId !== combat.sceneId) {
    throw new OperationRejected("that token is not on the combat's scene");
  }
  if (combatantsOf(store, combat.id).some((entry) => entry.tokenId === token.data.id)) {
    throw new OperationRejected('that token is already in the combat');
  }
  return makeCombatant(store, combat, token.data, payload.hidden ?? false);
}

/**
 * Ends every condition anchored to `combatantId` ("until the end of its turn"),
 * on any actor, and returns the actors changed. Called when the combatant leaves,
 * since nothing would ever end them otherwise.
 */
function clearAnchoredConditions(store: WorldStore, combatantId: string): BaseDocument[] {
  const changed: BaseDocument[] = [];
  for (const raw of store.listDocuments('actor')) {
    const actor = baseDocumentSchema.loose().safeParse(raw);
    const system = actor.success
      ? (actor.data as { system?: { conditions?: unknown } }).system
      : undefined;
    if (!actor.success || !Array.isArray(system?.conditions)) {
      continue;
    }
    const kept = system.conditions.filter((condition: { duration?: unknown }) => {
      const duration = condition.duration as
        { type?: string; combatantId?: string } | undefined;
      return !(duration?.type === 'turn' && duration.combatantId === combatantId);
    });
    if (kept.length !== system.conditions.length) {
      const updated = {
        ...actor.data,
        system: { ...system, conditions: kept },
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(updated);
      changed.push(updated);
    }
  }
  return changed;
}

export interface CombatantRemoval {
  /** The bare envelope of the combatant removed. */
  readonly deleted: BaseDocument;
  /** Actors whose conditions were anchored to it. */
  readonly changed: BaseDocument[];
}

/** Takes a combatant out of its combat. The combatant whose turn it is cannot be removed yet: step the turn first. */
export function removeCombatant(
  store: WorldStore,
  seat: Seat,
  payload: { combatantId: string },
): CombatantRemoval {
  requireGM(seat);
  const combatant = loadCombatant(store, payload.combatantId);
  const combat = loadCombat(store, combatant.combatId);
  if (combat.activeCombatantId === combatant.id) {
    throw new OperationRejected("end this combatant's turn before removing it");
  }
  store.deleteDocument(combatant.id);
  return {
    deleted: baseDocumentSchema.parse(combatant),
    changed: clearAnchoredConditions(store, combatant.id),
  };
}

export interface CombatCascade {
  /** Bare envelopes of the combatants (and combats) that went with what was deleted. */
  readonly deleted: BaseDocument[];
  /** Documents changed along the way: actors whose anchored conditions ended, and a combat that lost its active combatant. */
  readonly changed: BaseDocument[];
}

/**
 * What else goes when tokens or scenes are deleted: a deleted token's combatants,
 * and a deleted scene's combats with all their combatants, so nothing is left
 * pointing at nothing. Conditions anchored to a combatant that goes end with it,
 * and a surviving combat whose active combatant went loses that pointer. Not
 * GM-checked: it follows a deletion that was (a token, a scene) or that the actor's
 * owner may do. `deleted` lists the envelopes already removed; only their ids are read.
 */
export function cascadeCombatDeletion(
  store: WorldStore,
  deleted: readonly BaseDocument[],
): CombatCascade {
  const gone = new Set(deleted.map((document) => document.id));
  const combats = store.listDocuments('combat').flatMap((raw) => {
    const parsed = combatSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
  const doomed = new Set(
    combats.filter((combat) => gone.has(combat.sceneId)).map((combat) => combat.id),
  );

  const removed = new Set<string>();
  const result: CombatCascade = { deleted: [], changed: [] };
  const changed = new Map<string, BaseDocument>();
  for (const raw of store.listDocuments('combatant')) {
    const combatant = combatantSchema.safeParse(raw);
    if (
      combatant.success &&
      (gone.has(combatant.data.tokenId) || doomed.has(combatant.data.combatId))
    ) {
      store.deleteDocument(combatant.data.id);
      removed.add(combatant.data.id);
      result.deleted.push(baseDocumentSchema.parse(combatant.data));
      for (const actor of clearAnchoredConditions(store, combatant.data.id)) {
        changed.set(actor.id, actor);
      }
    }
  }
  for (const combat of combats) {
    if (doomed.has(combat.id)) {
      store.deleteDocument(combat.id);
      result.deleted.push(baseDocumentSchema.parse(combat));
    } else if (
      combat.activeCombatantId !== undefined &&
      removed.has(combat.activeCombatantId)
    ) {
      const { activeCombatantId: _active, ...rest } = combat;
      const updated: Combat = { ...rest, updatedAt: new Date().toISOString() };
      store.putDocument(updated);
      changed.set(updated.id, updated);
    }
  }
  result.changed.push(...changed.values());
  return result;
}
