/**
 * Persistent damage at the end of a turn (`docs/conditions.md`, "Persistent
 * damage"): each entry the bearer carries hurts them once, then a flat check can end
 * it. `rules/persistentDamage.ts` decides what is due and what a flat check means;
 * this module rolls the dice, applies the damage through the same chain as any other
 * damage (`applyDamageToActor`, so a character at 0 hit points goes dying), writes the
 * surviving entries back, and posts what happened.
 *
 * Every die rolled is a structured chat message (the damage as a `roll`, the flat check
 * as a `check` with its DC); a line says in words what ended and what is still burning.
 * All of it is kept from players when the actor is not public.
 */

import type {
  Actor,
  BaseDocument,
  ChatCheckMessage,
  ChatRollMessage,
  ChatTextMessage,
  Seat,
} from '@hearthtable/core';
import { actorSchema, combatantSchema } from '@hearthtable/core';
import { evaluate, parse } from '@hearthtable/dice';
import type { RandomSource } from '@hearthtable/dice';
import type { ConditionDefinitions, PersistentDamage } from '@hearthtable/pf2e';
import {
  characterDataSchema,
  FLAT_CHECK_DC,
  npcDataSchema,
  resolvePersistentDamage,
  rollCheck,
} from '@hearthtable/pf2e';

import type { CombatChange } from './combat.js';
import { applyDamageToActor, chatPermissions } from './hitPoints.js';
import type { WorldStore } from './worldStore.js';

/** The persistent damage `actor` carries, or none for anything with no sheet. */
function persistentOf(actor: Actor): PersistentDamage[] {
  const data =
    actor.kind === 'character'
      ? characterDataSchema.safeParse(actor.system).data
      : actor.kind === 'npc'
        ? npcDataSchema.safeParse(actor.system).data
        : undefined;
  return data?.persistentDamage ?? [];
}

/**
 * Rolls and applies the persistent damage `combatantId`'s actor owes at the end of
 * its turn, then its flat checks. Returns what changed, or nothing when it carries
 * none. The GM's `seat` is the sender, since the turn ending is the GM's operation.
 */
export function settlePersistentDamage(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  definitions: ConditionDefinitions,
  payload: { combatantId: string },
): CombatChange {
  const combatant = combatantSchema.safeParse(store.getDocument(payload.combatantId));
  const first = combatant.success
    ? actorSchema.safeParse(store.getDocument(combatant.data.actorId))
    : undefined;
  if (first === undefined || !first.success) {
    return { documents: [] };
  }
  const entries = persistentOf(first.data);
  if (entries.length === 0) {
    return { documents: [] };
  }

  const name = first.data.name;
  const permissions = chatPermissions(first.data);
  const now = new Date().toISOString();
  const base = (): Pick<
    ChatRollMessage,
    | 'id'
    | 'worldId'
    | 'type'
    | 'schemaVersion'
    | 'permissions'
    | 'createdAt'
    | 'updatedAt'
    | 'seatId'
  > => ({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions,
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
  });

  const documents = new Map<string, BaseDocument>();
  const keep = (document: BaseDocument): void => {
    documents.set(document.id, document);
  };
  const results: { id: string; damage: number; natural: number }[] = [];

  for (const entry of entries) {
    const parsed = parse(entry.formula);
    const evaluated = parsed.ok
      ? evaluate(entry.formula, parsed.expression, { rng })
      : undefined;
    if (evaluated === undefined || !evaluated.ok) {
      continue;
    }
    const damage = Math.max(0, evaluated.result.total);
    const damageRoll: ChatRollMessage = {
      ...base(),
      kind: 'roll',
      roll: evaluated.result,
    };
    store.putDocument(damageRoll);
    keep(damageRoll);

    for (const changed of applyDamageToActor(store, seat, definitions, {
      actorId: first.data.id,
      amount: damage,
    }).documents) {
      keep(changed);
    }

    const flat = { total: 0, modifiers: [] };
    const { roll } = rollCheck({ statistic: flat, rng, dc: FLAT_CHECK_DC });
    const check: ChatCheckMessage = {
      ...base(),
      kind: 'check',
      actorId: first.data.id,
      actorName: name,
      statistic: 'persistent-damage',
      label: `Persistent ${entry.damageType} flat check`,
      dc: FLAT_CHECK_DC,
      breakdown: flat,
      roll,
    };
    store.putDocument(check);
    keep(check);
    results.push({ id: entry.id, damage, natural: roll.natural ?? roll.total });
  }

  // `applyDamageToActor` rewrote the actor, so read it again before changing what it carries.
  const fresh = actorSchema.parse(store.getDocument(first.data.id));
  const { remaining, events } = resolvePersistentDamage(persistentOf(fresh), results);
  const system = {
    ...fresh.system,
    persistentDamage: remaining,
  };
  const updated: Actor = { ...fresh, system, updatedAt: new Date().toISOString() };
  store.putDocument(updated);
  keep(updated);

  const lines = events.map((event) => {
    switch (event.kind) {
      case 'damaged':
        return `${name} takes ${event.damage} persistent ${event.damageType} damage.`;
      case 'ended':
        return `The persistent ${event.damageType} damage on ${name} ends (flat check ${event.natural} against DC ${event.dc}).`;
      case 'stillBurning':
        return `${name} is still taking persistent ${event.damageType} damage (flat check ${event.natural} against DC ${event.dc}).`;
    }
  });
  if (lines.length > 0) {
    const text: ChatTextMessage = { ...base(), kind: 'text', text: lines.join(' ') };
    store.putDocument(text);
    keep(text);
  }
  return { documents: [...documents.values()] };
}
