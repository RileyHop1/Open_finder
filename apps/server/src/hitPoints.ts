/**
 * Taking damage and being healed, with the dying chain applied in the same
 * operation (`docs/conditions.md`, "The dying chain"). The arithmetic is
 * `hitPointChanges.ts` and the transitions are `dyingChain.ts`, both pure; this
 * module reads the actor, runs them, and writes the hit points and conditions back
 * together, so a character is never at 0 hit points without being unconscious.
 *
 * - **A character** runs the chain: dropped to 0 is knocked out, damage at 0 raises
 *   dying, enough damage left over kills outright, healing above 0 revives. Death is a
 *   `dead` condition, which the GM can clear by hand like any other.
 * - **A monster** only loses or regains hit points. At 0 it is marked `defeated` in an
 *   active combat so the turn order skips it, and healing above 0 puts it back.
 *
 * Every change is told to the table in a chat line; it is kept from players when the
 * actor is not public (a hidden monster).
 */

import type {
  Actor,
  BaseDocument,
  ChatTextMessage,
  Combatant,
  Seat,
} from '@hearthtable/core';
import { actorSchema, combatantSchema, combatSchema } from '@hearthtable/core';
import type {
  AppliedCondition,
  ConditionDefinitions,
  DyingResult,
} from '@hearthtable/pf2e';
import {
  applyDamage,
  applyHealing,
  characterDataSchema,
  damageWhileDying,
  dyingStateOf,
  healFromDying,
  instantDeath,
  knockOut,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
  setCondition,
  withDyingState,
} from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

export interface HitPointChange {
  /** The actor, any combatants marked defeated or restored, and the chat line. */
  readonly documents: BaseDocument[];
}

const DEAD = 'dead';

function loadActor(store: WorldStore, seat: Seat, actorId: string): Actor {
  const { raw } = loadOwnedDocument(store, seat, actorId, 'actor', 'actor');
  return actorSchema.parse(raw);
}

/** A chat line from `seat`, readable by everyone only when the actor is. */
function say(store: WorldStore, seat: Seat, actor: Actor, text: string): ChatTextMessage {
  const visible =
    actor.permissions.default !== 'none' && actor.permissions.default !== 'limited';
  const now = new Date().toISOString();
  const message: ChatTextMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: visible ? 'observer' : 'none', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    kind: 'text',
    text,
  };
  store.putDocument(message);
  return message;
}

/** What the chain did, as one sentence about `name`. */
function describeChain(name: string, result: DyingResult): string[] {
  const lines: string[] = [];
  for (const event of result.events) {
    switch (event.kind) {
      case 'knockedOut':
        lines.push(`${name} is knocked out and dying ${event.dying}.`);
        break;
      case 'dyingChanged':
        lines.push(`${name}'s dying goes from ${event.from} to ${event.to}.`);
        break;
      case 'woundedRaised':
        lines.push(`${name} is now wounded ${event.to}.`);
        break;
      case 'stabilised':
        lines.push(`${name} is stable.`);
        break;
      case 'revived':
        lines.push(`${name} is back on their feet.`);
        break;
      case 'dead':
        lines.push(`${name} dies.`);
        break;
    }
  }
  return lines;
}

/** `conditions` after the chain's result, with the `dead` condition added when it killed. */
function conditionsAfter(
  conditions: readonly AppliedCondition[],
  result: DyingResult,
  definitions: ConditionDefinitions,
): AppliedCondition[] {
  const next = withDyingState(conditions, result.state, definitions);
  return result.dead ? setCondition(next, { slug: DEAD }, definitions) : next;
}

/** Marks the actor's combatants in an active combat defeated (or not), and returns the ones that changed. */
function setDefeated(store: WorldStore, actorId: string, defeated: boolean): Combatant[] {
  const active = new Set(
    store.listDocuments('combat').flatMap((raw) => {
      const parsed = combatSchema.safeParse(raw);
      return parsed.success && parsed.data.status === 'active' ? [parsed.data.id] : [];
    }),
  );
  const changed: Combatant[] = [];
  for (const raw of store.listDocuments('combatant')) {
    const combatant = combatantSchema.safeParse(raw);
    if (
      combatant.success &&
      combatant.data.actorId === actorId &&
      active.has(combatant.data.combatId) &&
      combatant.data.defeated !== defeated
    ) {
      const updated: Combatant = {
        ...combatant.data,
        defeated,
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(updated);
      changed.push(updated);
    }
  }
  return changed;
}

/** Writes a monster's new hit points. A monster has no sheet to edit, so this is the same ownership check and write as a character's. */
function setNpcHitPoints(
  store: WorldStore,
  actor: Actor,
  hp: { current: number; temp: number },
): Actor {
  const data = npcDataSchema.parse(actor.system);
  const updated: Actor = {
    ...actor,
    system: { ...data, hp },
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/**
 * Deals `amount` damage. Temporary hit points absorb first; a character that is
 * dropped to 0 runs the dying chain, damage that lands at 0 raises dying, and the
 * damage left after reaching 0 killing it outright is checked against its maximum.
 */
export function applyDamageToActor(
  store: WorldStore,
  seat: Seat,
  definitions: ConditionDefinitions,
  payload: { actorId: string; amount: number; critical?: boolean | undefined },
): HitPointChange {
  const actor = loadActor(store, seat, payload.actorId);
  const critical = payload.critical === true;

  if (actor.kind === 'npc') {
    const data = npcDataSchema.safeParse(actor.system);
    if (!data.success) {
      throw new OperationRejected(`${actor.name} has no creature stats`);
    }
    const after = applyDamage(data.data.hp, payload.amount);
    const updated = setNpcHitPoints(store, actor, after);
    const documents: BaseDocument[] = [updated];
    if (after.current === 0 && data.data.hp.current > 0) {
      documents.push(
        ...setDefeated(store, actor.id, true),
        say(store, seat, actor, `${actor.name} is defeated.`),
      );
    }
    return { documents };
  }

  if (actor.kind !== 'character') {
    throw new OperationRejected(`a ${actor.kind} does not have hit points`);
  }
  const data = characterDataSchema.parse(actor.system);
  const max = prepareCharacter(data).hp.max.total;
  const before = data.hp;
  const after = applyDamage(before, payload.amount);
  const through = Math.max(0, payload.amount - Math.min(before.temp, payload.amount));
  const dead = data.conditions.some((condition) => condition.slug === DEAD);

  let result: DyingResult | undefined;
  if (!dead && through > 0 && (before.current === 0 || after.current === 0)) {
    const state = dyingStateOf(data.conditions);
    result =
      before.current === 0
        ? damageWhileDying(state, { critical })
        : knockOut(state, { critical });
    // The damage left after reaching 0 kills outright when it is a full maximum's worth.
    if (
      !result.dead &&
      instantDeath({ remainingDamage: through - before.current, maxHp: max })
    ) {
      result = {
        ...result,
        dead: true,
        events: [...result.events, { kind: 'dead', reason: 'massiveDamage' }],
      };
    }
  }

  const changed = editCharacter(store, seat, actor.id, (sheet) => ({
    ...sheet,
    hp: after,
    conditions:
      result === undefined
        ? sheet.conditions
        : conditionsAfter(sheet.conditions, result, definitions),
  }));
  const lines = result === undefined ? [] : describeChain(actor.name, result);
  return {
    documents: [
      changed,
      ...(lines.length === 0 ? [] : [say(store, seat, actor, lines.join(' '))]),
    ],
  };
}

/**
 * Heals `amount`, up to the maximum. A character raised above 0 ends dying and
 * unconsciousness (wounded rises if it was dying); a dead one is refused, because
 * bringing someone back is the GM's call, made by clearing the `dead` condition.
 */
export function healActor(
  store: WorldStore,
  seat: Seat,
  definitions: ConditionDefinitions,
  payload: { actorId: string; amount: number },
): HitPointChange {
  const actor = loadActor(store, seat, payload.actorId);

  if (actor.kind === 'npc') {
    const data = npcDataSchema.safeParse(actor.system);
    if (!data.success) {
      throw new OperationRejected(`${actor.name} has no creature stats`);
    }
    const max = prepareNpc(data.data).hp.max.total;
    const after = applyHealing(data.data.hp, payload.amount, max);
    const documents: BaseDocument[] = [setNpcHitPoints(store, actor, after)];
    if (data.data.hp.current === 0 && after.current > 0) {
      documents.push(...setDefeated(store, actor.id, false));
    }
    return { documents };
  }

  if (actor.kind !== 'character') {
    throw new OperationRejected(`a ${actor.kind} does not have hit points`);
  }
  const data = characterDataSchema.parse(actor.system);
  if (data.conditions.some((condition) => condition.slug === DEAD)) {
    throw new OperationRejected(
      `${actor.name} is dead: clear the dead condition to bring them back`,
    );
  }
  const max = prepareCharacter(data).hp.max.total;
  const after = applyHealing(data.hp, payload.amount, max);
  const result =
    data.hp.current === 0 && after.current > 0
      ? healFromDying(dyingStateOf(data.conditions))
      : undefined;
  const changed = editCharacter(store, seat, actor.id, (sheet) => ({
    ...sheet,
    hp: after,
    conditions:
      result === undefined
        ? sheet.conditions
        : conditionsAfter(sheet.conditions, result, definitions),
  }));
  const lines = result === undefined ? [] : describeChain(actor.name, result);
  return {
    documents: [
      changed,
      ...(lines.length === 0 ? [] : [say(store, seat, actor, lines.join(' '))]),
    ],
  };
}
