/**
 * Combat operations: setting up a combat and choosing who is in it (ADR 0018).
 * Almost all of it is the GM's; the one exception is `nextTurn`, which the
 * owner of the currently active combatant may also call, to end their own
 * turn (`requireCanEndTurn`). Like the other handler modules these take the
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
  ChatCheckMessage,
  ChatTextMessage,
  Combat,
  Combatant,
  DocumentPermissions,
  Seat,
  Token,
} from '@hearthtable/core';
import {
  actorSchema,
  baseDocumentSchema,
  combatantSchema,
  combatSchema,
  MAX_COUNTER,
  partySchema,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import type {
  AppliedCondition,
  ConditionDefinitions,
  TurnEvent,
  TurnParticipant,
  TurnResult,
} from '@hearthtable/pf2e';
import {
  characterDataSchema,
  actionCapacity,
  endOfTurn,
  nextCombatant,
  npcDataSchema,
  placeCombatant,
  previousCombatant,
  sortByInitiative,
  startOfTurn,
} from '@hearthtable/pf2e';

import { rollActorCheck } from './checks.js';
import { rollRecovery } from './hitPoints.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
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

/**
 * The GM may always end a turn; otherwise only the owner of the combatant
 * whose turn it currently is may end their own (the player's "End turn",
 * CLAUDE.md's "the GM is never blocked" plus letting a player act without
 * waiting on the GM to click Next turn for them). A combat with nobody yet
 * active (just started, before `nextTurn` has run once) is GM-only.
 */
function requireCanEndTurn(store: WorldStore, seat: Seat, combat: Combat): void {
  if (seat.isGM) {
    return;
  }
  if (combat.activeCombatantId === undefined) {
    throw new OperationRejected('only the GM can change a combat');
  }
  const active = loadCombatant(store, combat.activeCombatantId);
  loadOwnedDocument(store, seat, active.actorId, 'actor', 'combatant');
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

/** A combat that exists and has not ended: the only kind whose initiative may change. */
function loadOpenCombat(store: WorldStore, combatId: string): Combat {
  const combat = loadCombat(store, combatId);
  if (combat.status === 'ended') {
    throw new OperationRejected('that combat has ended');
  }
  return combat;
}

/** `combatant` with `initiative` written (absent when `undefined`), stored and returned. */
function withInitiative(
  store: WorldStore,
  combatant: Combatant,
  initiative: number | undefined,
): Combatant {
  const { initiative: _old, ...rest } = combatant;
  const updated: Combatant = {
    ...rest,
    ...(initiative === undefined ? {} : { initiative }),
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/**
 * Rolls a combatant's initiative with its actor's Perception (or the `statistic`
 * asked for) and stores the total. The roll is a chat check, kept from players when
 * the combatant is hidden. Rolling again replaces the number, so the GM can re-roll.
 */
export function rollInitiative(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: { combatantId: string; statistic?: string | undefined },
): { combatant: Combatant; message: ChatCheckMessage } {
  requireGM(seat);
  const combatant = loadCombatant(store, payload.combatantId);
  loadOpenCombat(store, combatant.combatId);
  const message = rollActorCheck(
    store,
    seat,
    rng,
    { actorId: combatant.actorId, statistic: payload.statistic ?? 'perception' },
    { gmOnly: combatant.hidden },
  );
  return {
    combatant: withInitiative(store, combatant, message.roll.total),
    message,
  };
}

/** Sets a combatant's initiative to exactly `initiative`, or clears it (`null`): the GM's override. */
export function setInitiative(
  store: WorldStore,
  seat: Seat,
  payload: { combatantId: string; initiative: number | null },
): Combatant {
  requireGM(seat);
  const combatant = loadCombatant(store, payload.combatantId);
  loadOpenCombat(store, combatant.combatId);
  return withInitiative(store, combatant, payload.initiative ?? undefined);
}

/**
 * Moves a combatant immediately before `beforeId` (last when absent) by choosing
 * initiative numbers (`placeCombatant`), and returns the combatants whose number
 * changed. A place that cannot be reached by number (among the unrolled, or the
 * gap is used up) is refused with what to do instead; nothing is misordered quietly.
 */
export function moveCombatant(
  store: WorldStore,
  seat: Seat,
  payload: { combatantId: string; beforeId?: string | undefined },
): Combatant[] {
  requireGM(seat);
  const mover = loadCombatant(store, payload.combatantId);
  loadOpenCombat(store, mover.combatId);
  const all = combatantsOf(store, mover.combatId);
  if (payload.beforeId !== undefined && !all.some((c) => c.id === payload.beforeId)) {
    throw new OperationRejected('that combatant is not in this combat');
  }

  const sorted = sortByInitiative(entriesOf(store, all));
  const changes = placeCombatant(sorted, mover.id, payload.beforeId);
  if (changes === undefined) {
    throw new OperationRejected(
      'cannot place it there by number: roll its initiative, or set it directly',
    );
  }
  const byId = new Map(all.map((combatant) => [combatant.id, combatant]));
  return changes.flatMap((change) => {
    const target = byId.get(change.id);
    return target === undefined ? [] : [withInitiative(store, target, change.initiative)];
  });
}

/** The combatants as the initiative order sees them: a player character wins a tie, then who joined first. */
function entriesOf(store: WorldStore, combatants: readonly Combatant[]) {
  return combatants.map((combatant) => ({
    id: combatant.id,
    initiative: combatant.initiative,
    defeated: combatant.defeated,
    isCharacter:
      actorSchema.safeParse(store.getDocument(combatant.actorId)).data?.kind ===
      'character',
    createdAt: combatant.createdAt,
  }));
}

/** The combatants as the turn rules see them: what each bears and has used. Actors with no creature or character data bear nothing. */
function participantsOf(
  store: WorldStore,
  combatants: readonly Combatant[],
): TurnParticipant[] {
  return combatants.map((combatant) => {
    const actor = actorSchema.safeParse(store.getDocument(combatant.actorId));
    const data = !actor.success
      ? undefined
      : actor.data.kind === 'npc'
        ? npcDataSchema.safeParse(actor.data.system).data
        : actor.data.kind === 'character'
          ? characterDataSchema.safeParse(actor.data.system).data
          : undefined;
    return {
      combatantId: combatant.id,
      conditions: data?.conditions ?? [],
      turn: combatant.turn,
      persistentDamage: data?.persistentDamage ?? [],
    };
  });
}

/** Writes a turn rule's changes back, and returns the combatants and actors it touched. */
function applyTurnResult(store: WorldStore, result: TurnResult): BaseDocument[] {
  const changed = new Map<string, BaseDocument>();
  for (const change of result.changes) {
    const combatant = loadCombatant(store, change.combatantId);
    const updated: Combatant = {
      ...combatant,
      turn: change.turn,
      updatedAt: new Date().toISOString(),
    };
    store.putDocument(updated);
    changed.set(updated.id, updated);
    const actor = baseDocumentSchema
      .loose()
      .safeParse(store.getDocument(combatant.actorId));
    const system = actor.success
      ? (actor.data as { system?: { conditions?: AppliedCondition[] } }).system
      : undefined;
    if (
      actor.success &&
      system !== undefined &&
      JSON.stringify(system.conditions) !== JSON.stringify(change.conditions)
    ) {
      const edited = {
        ...actor.data,
        system: { ...system, conditions: change.conditions },
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(edited);
      changed.set(edited.id, edited);
    }
  }
  return [...changed.values()];
}

/** A plain chat line saying what a turn boundary did, or `undefined` when it did nothing. */
export function turnEventMessage(
  store: WorldStore,
  seat: Seat,
  combatants: readonly Combatant[],
  events: readonly TurnEvent[],
): ChatTextMessage | undefined {
  const nameOf = (combatantId: string): string => {
    const combatant = combatants.find((c) => c.id === combatantId);
    const actor = actorSchema.safeParse(
      combatant === undefined ? undefined : store.getDocument(combatant.actorId),
    );
    return actor.success ? actor.data.name : 'Someone';
  };
  const lines = events.map((event) => {
    const who = nameOf(event.combatantId);
    switch (event.kind) {
      case 'expired':
        return `${event.slug} ends on ${who}.`;
      case 'ticked':
        return `${event.slug} on ${who}: ${event.remaining} round(s) left.`;
      case 'actionsLost':
        return `${who} loses ${event.count} action(s) to ${event.slug}.`;
      case 'reduced':
        return event.to === 0
          ? `${event.slug} ends on ${who}.`
          : `${event.slug} on ${who} drops from ${event.from} to ${event.to}.`;
    }
  });
  if (lines.length === 0) {
    return undefined;
  }
  const now = new Date().toISOString();
  const message: ChatTextMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    kind: 'text',
    text: lines.join(' '),
  };
  store.putDocument(message);
  return message;
}

export interface CombatChange {
  /** Every document the operation changed or made: the combat, its combatants, actors whose conditions changed, and chat. */
  readonly documents: BaseDocument[];
  /** `combat.nextTurn` only: the combatant whose turn just ended, who owes end-of-turn persistent damage. */
  readonly endedTurnOf?: string | undefined;
}

/**
 * Begins a pending combat, all in one transaction. Everyone with no initiative
 * rolls Perception (a number the GM already set is kept; one that cannot roll, a
 * hazard, stays unrolled for the GM to set). The combat and every combatant not
 * marked hidden become readable. The top of the order takes round 1's first turn,
 * and `startOfTurn` runs for it. A combat nobody can take a turn in is refused.
 */
export function startCombat(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: { combatId: string },
): CombatChange {
  requireGM(seat);
  const combat = loadCombat(store, payload.combatId);
  if (combat.status !== 'pending') {
    throw new OperationRejected(
      combat.status === 'active'
        ? 'that combat has already started'
        : 'that combat has ended',
    );
  }
  const documents = new Map<string, BaseDocument>();
  const keep = (document: BaseDocument): void => {
    documents.set(document.id, document);
  };

  for (const combatant of combatantsOf(store, combat.id)) {
    if (combatant.initiative === undefined) {
      try {
        const rolled = rollInitiative(store, seat, rng, { combatantId: combatant.id });
        keep(rolled.message);
      } catch (error) {
        if (!(error instanceof OperationRejected)) {
          throw error;
        }
      }
    }
  }

  const combatants = combatantsOf(store, combat.id);
  const first = nextCombatant(
    sortByInitiative(entriesOf(store, combatants)),
    undefined,
  ).combatant;
  if (first === undefined) {
    throw new OperationRejected(
      'nobody can take a turn: add a combatant or set an initiative',
    );
  }
  for (const combatant of combatants) {
    const readable: Combatant = {
      ...combatant,
      permissions: combatantPermissions('active', combatant.hidden),
      updatedAt: new Date().toISOString(),
    };
    store.putDocument(readable);
    keep(readable);
  }
  const started: Combat = {
    ...combat,
    status: 'active',
    round: 1,
    activeCombatantId: first.id,
    permissions: combatPermissions('active'),
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(started);
  keep(started);

  const turn = startOfTurn(
    participantsOf(store, combatantsOf(store, combat.id)),
    first.id,
  );
  for (const document of applyTurnResult(store, turn)) {
    keep(document);
  }
  const message = turnEventMessage(store, seat, combatants, turn.events);
  if (message !== undefined) {
    keep(message);
  }
  return { documents: [...documents.values()] };
}

/**
 * Ends a combat: the turn pointer and every out-of-turn grant clear, and every
 * condition anchored to one of its combatants' turns ends with it. A combat that
 * had begun stays readable as a record; one that never began stays hidden, so
 * players never learn of a fight that was called off. Frees the one-combat rule.
 */
export function endCombat(
  store: WorldStore,
  seat: Seat,
  payload: { combatId: string },
): CombatChange {
  requireGM(seat);
  const combat = loadOpenCombat(store, payload.combatId);
  const documents = new Map<string, BaseDocument>();
  for (const combatant of combatantsOf(store, combat.id)) {
    if (combatant.movementGrant) {
      const cleared: Combatant = {
        ...combatant,
        movementGrant: false,
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(cleared);
      documents.set(cleared.id, cleared);
    }
    for (const actor of clearAnchoredConditions(store, combatant.id)) {
      documents.set(actor.id, actor);
    }
  }
  const { activeCombatantId: _active, ...rest } = combat;
  const ended: Combat = {
    ...rest,
    status: 'ended',
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(ended);
  documents.set(ended.id, ended);
  return { documents: [...documents.values()] };
}

/**
 * `addCombatant`, and when the combat is already running, rolls the newcomer's
 * initiative at once so it takes its place in the order.
 */
export function joinCombat(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: { combatId: string; tokenId: string; hidden?: boolean | undefined },
): CombatChange {
  const combatant = addCombatant(store, seat, payload);
  if (loadCombat(store, payload.combatId).status !== 'active') {
    return { documents: [combatant] };
  }
  const rolled = rollInitiative(store, seat, rng, { combatantId: combatant.id });
  return { documents: [rolled.combatant, rolled.message] };
}

/** An active combat, or a rejection saying why the turn cannot move. */
function loadActiveCombat(store: WorldStore, combatId: string): Combat {
  const combat = loadCombat(store, combatId);
  if (combat.status !== 'active') {
    throw new OperationRejected(
      combat.status === 'pending'
        ? 'that combat has not started'
        : 'that combat has ended',
    );
  }
  return combat;
}

/**
 * Passes the turn on, all in one transaction: the end-of-turn rules for the
 * combatant leaving (frightened drops, "until the end of its turn" conditions
 * end), its one-off movement grant is spent, then the start-of-turn rules for the
 * one arriving. The round counts up when the order wraps. Defeated combatants and
 * those with no initiative are skipped. If the active combatant is gone (its token
 * was deleted) the turn simply goes to the top of the order without a new round.
 * Persistent damage that falls due is not rolled yet (B.7).
 *
 * The GM may always call this; so may the owner of the combatant whose turn
 * it currently is, ending their own turn (`requireCanEndTurn`) -- a player
 * is never stuck waiting on the GM to click "Next turn" for them.
 */
export function nextTurn(
  store: WorldStore,
  seat: Seat,
  payload: { combatId: string },
): CombatChange {
  const combat = loadActiveCombat(store, payload.combatId);
  requireCanEndTurn(store, seat, combat);
  const leaving = combat.activeCombatantId;
  const sorted = sortByInitiative(entriesOf(store, combatantsOf(store, combat.id)));
  const step = nextCombatant(sorted, leaving);
  if (step.combatant === undefined) {
    throw new OperationRejected(
      'nobody can take a turn: set an initiative or add a combatant',
    );
  }

  const documents = new Map<string, BaseDocument>();
  const keep = (document: BaseDocument): void => {
    documents.set(document.id, document);
  };
  const events: TurnEvent[] = [];
  const known = combatantsOf(store, combat.id);
  const endedTurn = leaving !== undefined && known.some((c) => c.id === leaving);
  if (leaving !== undefined && endedTurn) {
    const ending = endOfTurn(participantsOf(store, known), leaving);
    applyTurnResult(store, ending).forEach(keep);
    events.push(...ending.events);
    const spent = loadCombatant(store, leaving);
    if (spent.movementGrant) {
      const cleared: Combatant = {
        ...spent,
        movementGrant: false,
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(cleared);
      keep(cleared);
    }
  }

  const arriving = step.combatant.id;
  const starting = startOfTurn(
    participantsOf(store, combatantsOf(store, combat.id)),
    arriving,
  );
  applyTurnResult(store, starting).forEach(keep);
  events.push(...starting.events);

  const moved: Combat = {
    ...combat,
    round: combat.round + (step.wrapped && leaving !== undefined ? 1 : 0),
    activeCombatantId: arriving,
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(moved);
  keep(moved);
  const message = turnEventMessage(store, seat, known, events);
  if (message !== undefined) {
    keep(message);
  }
  return {
    documents: [...documents.values()],
    ...(endedTurn && leaving !== undefined ? { endedTurnOf: leaving } : {}),
  };
}

/**
 * Steps the turn back one place and the round back when the order wraps, for a
 * mis-clicked "next turn". It moves the pointer and the round only: what the
 * boundary rules changed (a condition that ended, actions spent) is not undone,
 * so the GM sets those by hand. Refused at the very start of round 1.
 */
export function previousTurn(
  store: WorldStore,
  seat: Seat,
  payload: { combatId: string },
): CombatChange {
  requireGM(seat);
  const combat = loadActiveCombat(store, payload.combatId);
  const sorted = sortByInitiative(entriesOf(store, combatantsOf(store, combat.id)));
  const step = previousCombatant(sorted, combat.activeCombatantId);
  const round = combat.round - (step.wrapped ? 1 : 0);
  if (step.combatant === undefined || round < 1) {
    throw new OperationRejected('this is already the first turn of the first round');
  }
  const moved: Combat = {
    ...combat,
    round,
    activeCombatantId: step.combatant.id,
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(moved);
  return { documents: [moved] };
}

/**
 * Turn-based movement (docs/combat.md, "Turn-based mode is the GM's switch"): while
 * a combat is `active`, a player's token moves only on its combatant's turn. It is
 * allowed anyway for the GM (never blocked), for a token that is not in the combat
 * or whose scene has no active combat, while the GM's `freeMovement` is on, and for a
 * combatant holding a `movementGrant`. Anything else is refused. The refusal never
 * names whose turn it is, since that may be a hidden creature.
 */
export function requireTurnToMove(store: WorldStore, seat: Seat, token: Token): void {
  if (seat.isGM) {
    return;
  }
  const combat = store
    .listDocuments('combat')
    .flatMap((raw) => {
      const parsed = combatSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .find((entry) => entry.status === 'active' && entry.sceneId === token.sceneId);
  if (combat === undefined || combat.freeMovement) {
    return;
  }
  const combatant = combatantsOf(store, combat.id).find(
    (entry) => entry.tokenId === token.id,
  );
  if (
    combatant === undefined ||
    combatant.movementGrant ||
    combat.activeCombatantId === combatant.id
  ) {
    return;
  }
  throw new OperationRejected("it is not this token's turn: ask the GM to let it move");
}

/**
 * Sets the GM's movement rulings: the combat-wide `freeMovement` switch and/or one
 * combatant's out-of-turn `movementGrant`. A grant lasts until that combatant's turn
 * next ends (`nextTurn` spends it), or until the GM takes it back.
 */
export function setMovementRuling(
  store: WorldStore,
  seat: Seat,
  payload: {
    combatId: string;
    freeMovement?: boolean | undefined;
    grant?: { combatantId: string; allowed: boolean } | undefined;
  },
): CombatChange {
  requireGM(seat);
  const combat = loadOpenCombat(store, payload.combatId);
  const documents: BaseDocument[] = [];
  if (payload.grant !== undefined) {
    const combatant = loadCombatant(store, payload.grant.combatantId);
    if (combatant.combatId !== combat.id) {
      throw new OperationRejected('that combatant is not in this combat');
    }
    const granted: Combatant = {
      ...combatant,
      movementGrant: payload.grant.allowed,
      updatedAt: new Date().toISOString(),
    };
    store.putDocument(granted);
    documents.push(granted);
  }
  if (payload.freeMovement !== undefined) {
    const ruled: Combat = {
      ...combat,
      freeMovement: payload.freeMovement,
      updatedAt: new Date().toISOString(),
    };
    store.putDocument(ruled);
    documents.push(ruled);
  }
  return { documents };
}

/** The one combatant of `actorId` in an active combat, if there is exactly one: whose turn the tracker counts for it. */
function trackedCombatant(store: WorldStore, actorId: string): Combatant | undefined {
  const active = new Set(
    store.listDocuments('combat').flatMap((raw) => {
      const parsed = combatSchema.safeParse(raw);
      return parsed.success && parsed.data.status === 'active' ? [parsed.data.id] : [];
    }),
  );
  const matches = store.listDocuments('combatant').flatMap((raw) => {
    const parsed = combatantSchema.safeParse(raw);
    return parsed.success &&
      parsed.data.actorId === actorId &&
      active.has(parsed.data.combatId)
      ? [parsed.data]
      : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * The attack number the tracker supplies for `actorId`'s next strike: this turn's
 * attacks so far plus one, capped at 3 (the third and later share a penalty). Only
 * while the actor is in an active combat, and in it exactly once; otherwise
 * `undefined`, and the caller must say which attack it is.
 */
export function trackedAttack(
  store: WorldStore,
  actorId: string,
): { combatant: Combatant; attackNumber: 1 | 2 | 3 } | undefined {
  const combatant = trackedCombatant(store, actorId);
  if (combatant === undefined) {
    return undefined;
  }
  const next = Math.min(combatant.turn.attacksMade + 1, 3);
  return { combatant, attackNumber: next === 1 ? 1 : next === 2 ? 2 : 3 };
}

/** Counts one attack against the combatant's turn, after the strike was rolled. */
export function countAttack(store: WorldStore, combatant: Combatant): Combatant {
  const fresh = loadCombatant(store, combatant.id);
  const counted: Combatant = {
    ...fresh,
    turn: {
      ...fresh.turn,
      attacksMade: Math.min(fresh.turn.attacksMade + 1, MAX_COUNTER),
    },
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(counted);
  return counted;
}

/**
 * Spends or gives back actions and the reaction on a combatant's turn. The
 * combatant's actor's owner or the GM may; it does not have to be that
 * combatant's turn (reactions are not).
 *
 * **A player cannot spend past the turn's capacity**: a spend (never a
 * give-back) that would put `actionsSpent` over `actionCapacity` is refused
 * outright, before anything is written, naming how many actions are left.
 * **The GM is never blocked** (CLAUDE.md, "the GM is never blocked"): an
 * overspend from the GM goes through and is only announced in chat ("Ada has
 * spent 4 of 3 actions"), kept from players when the combatant is hidden. The
 * count is clamped to the schema's sanity bound, not to the capacity.
 */
export function spendAction(
  store: WorldStore,
  seat: Seat,
  payload: {
    combatantId: string;
    actions?: number | undefined;
    reaction?: boolean | undefined;
  },
): CombatChange {
  const combatant = loadCombatant(store, payload.combatantId);
  loadActiveCombat(store, combatant.combatId);
  const { raw } = loadOwnedDocument(store, seat, combatant.actorId, 'actor', 'combatant');
  const before = combatant.turn;
  const delta = payload.actions ?? 0;
  const actionsSpent = Math.min(Math.max(before.actionsSpent + delta, 0), MAX_COUNTER);
  const name = actorSchema.safeParse(raw).data?.name ?? 'Someone';

  const [participant] = participantsOf(store, [combatant]);
  const capacity = actionCapacity(participant?.conditions ?? []).total;

  if (!seat.isGM && delta > 0 && actionsSpent > capacity) {
    const left = Math.max(capacity - before.actionsSpent, 0);
    throw new OperationRejected(
      left > 0
        ? `${name} has only ${left} action${left === 1 ? '' : 's'} left this turn.`
        : `${name} has no actions left this turn.`,
    );
  }

  const reactionUsed = payload.reaction ?? before.reactionUsed;
  const updated: Combatant = {
    ...combatant,
    turn: { ...before, actionsSpent, reactionUsed },
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);

  const documents: BaseDocument[] = [updated];
  const warnings: string[] = [];
  if (actionsSpent > capacity && actionsSpent > before.actionsSpent) {
    warnings.push(`${name} has spent ${actionsSpent} of ${capacity} actions.`);
  }
  if (payload.reaction === true && before.reactionUsed) {
    warnings.push(`${name} has already used a reaction.`);
  }
  if (warnings.length > 0) {
    const now = new Date().toISOString();
    const message: ChatTextMessage = {
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'chatMessage',
      schemaVersion: 1,
      permissions: { default: combatant.hidden ? 'none' : 'observer', seats: {} },
      createdAt: now,
      updatedAt: now,
      seatId: seat.id,
      kind: 'text',
      text: warnings.join(' '),
    };
    store.putDocument(message);
    documents.push(message);
  }
  return { documents };
}

/**
 * The recovery check owed at the start of a turn: if the combat's active combatant
 * is a dying character, rolls it (`rollRecovery`) and returns what changed. Nothing
 * happens for anyone else. Called right after `combat.start` and `combat.nextTurn`,
 * in the same operation, so the check lands with the turn that triggers it.
 */
export function recoverActive(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  definitions: ConditionDefinitions,
  payload: { combatId: string },
): CombatChange {
  const combat = loadCombat(store, payload.combatId);
  const active =
    combat.activeCombatantId === undefined
      ? undefined
      : combatantSchema.safeParse(store.getDocument(combat.activeCombatantId)).data;
  const actor = actorSchema.safeParse(
    active === undefined ? undefined : store.getDocument(active.actorId),
  ).data;
  const data =
    actor?.kind === 'character'
      ? characterDataSchema.safeParse(actor.system).data
      : undefined;
  if (actor === undefined || data === undefined) {
    return { documents: [] };
  }
  const dying =
    data.conditions.some((c) => c.slug === 'dying') &&
    !data.conditions.some((c) => c.slug === 'dead');
  return dying
    ? rollRecovery(store, seat, rng, definitions, { actorId: actor.id })
    : { documents: [] };
}
