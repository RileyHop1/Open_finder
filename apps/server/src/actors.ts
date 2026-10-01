/**
 * Actor operations: creating, updating, and deleting. Pure with respect to the
 * connection -- they take the already-resolved `Seat` and a `WorldStore` and
 * return what changed -- so they can be tested without a socket, and
 * `realtime.ts` only has to dispatch to them.
 *
 * Who may do what (the decision recorded in the milestone 3 plan):
 * - **Any seat may create** an actor, and becomes its `owner`. Everyone at the
 *   table can see it (`observer`), so a party can see each other's sheets. The
 *   GM can change either afterwards.
 * - **Only an owner may update or delete** one, and the GM always owns
 *   (`writeGuard.ts`).
 */

import type { Actor, BaseDocument, Seat } from '@hearthtable/core';
import { actorSchema, baseDocumentSchema } from '@hearthtable/core';
import type { CharacterData } from '@hearthtable/pf2e';
import { characterDataSchema, newCharacterData } from '@hearthtable/pf2e';
import type { ZodError } from 'zod';

import { applyChanges, parsePath } from './patch.js';
import { OperationRejected } from './rejection.js';
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
 * Whether a client may change the field at `path`. Only the actor's `name`,
 * `portrait`, and the inside of `system` -- and not `system.items` or
 * `system.conditions`, which have their own operations because adding an item
 * or a second source of a condition needs logic a plain overwrite does not
 * have. Everything else (id, kind, permissions, timestamps) is the server's.
 */
function isEditablePath(path: readonly string[]): boolean {
  const [head, second] = path;
  if (head === 'name' || head === 'portrait') {
    return path.length === 1;
  }
  return head === 'system' && second !== undefined && !NON_PATCHABLE.has(second);
}

const NON_PATCHABLE: ReadonlySet<string> = new Set(['items', 'conditions']);

/**
 * Applies `payload.changes` to actor `payload.actorId` if `seat` owns it, then
 * re-validates the *whole* actor -- and, for a character, its `system` against
 * `characterDataSchema` -- before storing anything. A change that would leave
 * the actor invalid is rejected with the first problem found, and nothing is
 * written, so a client can never persist a malformed sheet.
 *
 * Changes are per field and last write wins (ADR 0005). The stored system is
 * the *parsed* result, so defaults are filled in and unknown fields are
 * dropped rather than kept.
 */
export function updateActor(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string; changes: Readonly<Record<string, unknown>> },
): Actor {
  const { raw } = loadOwnedDocument(store, seat, payload.actorId, 'actor', 'actor');

  for (const path of Object.keys(payload.changes)) {
    if (!isEditablePath(parsePath(path))) {
      throw new OperationRejected(`${path} cannot be changed with actor.update`);
    }
  }

  const draft = structuredClone(raw) as Record<string, unknown>;
  applyChanges(draft, payload.changes);
  draft['updatedAt'] = new Date().toISOString();

  const parsed = actorSchema.safeParse(draft);
  if (!parsed.success) {
    throw new OperationRejected(describeIssue(parsed.error));
  }
  let actor = parsed.data;

  if (actor.kind === 'character') {
    const system = characterDataSchema.safeParse(actor.system);
    if (!system.success) {
      throw new OperationRejected(describeIssue(system.error, 'system'));
    }
    actor = { ...actor, system: system.data };
  }

  store.putDocument(actor);
  return actor;
}

/**
 * Loads character actor `actorId` for `seat` (who must own it), runs `edit`
 * on its parsed sheet, re-validates the result against
 * `characterDataSchema`, and stores it. The one path items and conditions
 * change a sheet by, so each of those operations is only its own edit
 * function and every one gets the same ownership check, validation, and
 * `updatedAt` bump. A non-character has no sheet and is rejected.
 */
export function editCharacter(
  store: WorldStore,
  seat: Seat,
  actorId: string,
  edit: (data: CharacterData) => CharacterData,
): Actor {
  const { raw } = loadOwnedDocument(store, seat, actorId, 'actor', 'actor');
  const actor = actorSchema.parse(raw);
  if (actor.kind !== 'character') {
    throw new OperationRejected(`a ${actor.kind} does not have a character sheet`);
  }
  const next = characterDataSchema.safeParse(
    edit(characterDataSchema.parse(actor.system)),
  );
  if (!next.success) {
    throw new OperationRejected(describeIssue(next.error, 'system'));
  }
  const updated: Actor = {
    ...actor,
    system: next.data,
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/** The first problem in `error` as a one-line message a person can act on. */
function describeIssue(error: ZodError, prefix?: string): string {
  const issue = error.issues[0];
  if (issue === undefined) {
    return 'invalid change';
  }
  const path = [...(prefix === undefined ? [] : [prefix]), ...issue.path.map(String)];
  return `invalid change: ${path.join('.')}: ${issue.message}`;
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
