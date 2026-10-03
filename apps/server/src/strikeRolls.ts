/**
 * Rolling a strike from a character sheet: the attack (with its Multiple
 * Attack Penalty step) and the damage (normal or critical). As with checks
 * (`checks.ts`), the server prepares the character itself and rolls the dice,
 * so neither the bonus nor the dice come from the client; the chat message
 * keeps the statistic that was rolled beside the roll.
 *
 * Both use the strike `prepareCharacter` built for the equipped weapon, so what
 * the sheet shows and what gets rolled are the same numbers
 * (`prepareStrikes.ts`). The weapon is named by its item id; one that is not
 * carried, not a weapon, or not equipped has no prepared strike and is refused.
 * A monster has no items, so its strike is named by the key `prepareNpc` gives
 * it (`strike:<name>`) and rolls the same way from the creature's own numbers.
 */

import type {
  Actor,
  ChatStrikeAttackMessage,
  ChatStrikeDamageMessage,
  Combatant,
  Seat,
  Statistic,
} from '@hearthtable/core';
import { actorSchema, canReadDocument, tokenSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { evaluateDamage } from '@hearthtable/dice/pure';
import type { EvaluateDamageResult } from '@hearthtable/dice/pure';
import {
  characterDataSchema,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
  rollCheck,
  rollStrikeDamage,
} from '@hearthtable/pf2e';
import type { PreparedStrike } from '@hearthtable/pf2e';

import { preparedStatistics } from './checks.js';
import { countAttack, trackedAttack } from './combat.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

/**
 * A strike ready to roll, whichever kind of actor it came from: what the chat
 * message names it by, its three attacks, its flat damage modifier, and how to
 * roll its damage.
 */
interface ResolvedStrike {
  readonly name: string;
  readonly id: { itemId: string } | { strikeKey: string };
  readonly attacks: readonly [Statistic, Statistic, Statistic];
  readonly damageModifiers: Statistic;
  readonly rollDamage: (critical: boolean, rng: RandomSource) => EvaluateDamageResult;
}

type StrikeTarget = { itemId?: string | undefined; strikeKey?: string | undefined };

function characterStrike(actor: Actor, itemId: string): ResolvedStrike {
  const data = characterDataSchema.parse(actor.system);
  if (!data.items.some((item) => item.id === itemId)) {
    throw new OperationRejected(`no item found with id ${itemId}`);
  }
  const strike: PreparedStrike | undefined = prepareCharacter(data).strikes.find(
    (s) => s.itemId === itemId,
  );
  if (strike === undefined) {
    throw new OperationRejected('only an equipped weapon can make a strike');
  }
  return {
    name: strike.name,
    id: { itemId },
    attacks: strike.attacks,
    damageModifiers: strike.damageModifiers,
    rollDamage: (critical, rng) =>
      rollStrikeDamage({ ...strike.damageInputs, critical, rng }),
  };
}

function monsterStrike(actor: Actor, strikeKey: string): ResolvedStrike {
  const data = npcDataSchema.safeParse(actor.system);
  if (!data.success) {
    throw new OperationRejected(`${actor.name} has no creature stats to roll`);
  }
  const strike = prepareNpc(data.data).strikes.find((s) => s.key === strikeKey);
  if (strike === undefined) {
    throw new OperationRejected(`${actor.name} has no strike ${strikeKey}`);
  }
  return {
    name: strike.name,
    id: { strikeKey },
    attacks: strike.attacks,
    damageModifiers: strike.damageModifiers,
    // `damage.critical` already carries fatal; the dice layer doubles the total.
    rollDamage: (critical, rng) =>
      evaluateDamage(critical ? strike.damage.critical : strike.damage.normal, critical, {
        rng,
      }),
  };
}

/** The actor and resolved strike named by `target`, or a rejection saying why there is none. */
function strikeFor(
  store: WorldStore,
  seat: Seat,
  actorId: string,
  target: StrikeTarget,
): { actor: Actor; strike: ResolvedStrike } {
  const { raw } = loadOwnedDocument(store, seat, actorId, 'actor', 'actor');
  const actor = actorSchema.parse(raw);
  if (actor.kind === 'character' && target.itemId !== undefined) {
    return { actor, strike: characterStrike(actor, target.itemId) };
  }
  if (actor.kind === 'npc' && target.strikeKey !== undefined) {
    return { actor, strike: monsterStrike(actor, target.strikeKey) };
  }
  if (actor.kind !== 'character' && actor.kind !== 'npc') {
    throw new OperationRejected(`a ${actor.kind} does not have a character sheet`);
  }
  throw new OperationRejected(
    actor.kind === 'character'
      ? 'a character strikes with a weapon: give itemId'
      : 'a monster strikes with one of its strikes: give strikeKey',
  );
}

function messageBase(
  store: WorldStore,
  seat: Seat,
  actor: Actor,
  strike: ResolvedStrike,
) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage' as const,
    schemaVersion: 1,
    permissions: { default: 'observer' as const, seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    actorId: actor.id,
    actorName: actor.name,
    ...strike.id,
    weaponName: strike.name,
  };
}

/** What striking a token needs: its Armor Class, and how much of it the table may be told. */
interface StrikeTargetInfo {
  readonly armorClass: number;
  /** The token is visible to everyone, so the card may name it. */
  readonly tokenPublic: boolean;
  /** The actor is readable by everyone, so the card may show its Armor Class. */
  readonly actorPublic: boolean;
  readonly tokenId: string;
  readonly name: string;
}

const isPublic = (document: { permissions: { default: string } }): boolean =>
  document.permissions.default === 'observer' || document.permissions.default === 'owner';

/**
 * The token struck: one `seat` can read (a hidden one is "not found", so a rejection
 * never confirms it exists), whose actor is a character or monster with an Armor Class.
 */
function strikeTargetOf(
  store: WorldStore,
  seat: Seat,
  tokenId: string,
): StrikeTargetInfo {
  const token = tokenSchema.safeParse(store.getDocument(tokenId));
  if (!token.success || !canReadDocument(seat, token.data)) {
    throw new OperationRejected(`no token found with id ${tokenId}`);
  }
  const actor = actorSchema.safeParse(store.getDocument(token.data.actorId));
  if (!actor.success || (actor.data.kind !== 'character' && actor.data.kind !== 'npc')) {
    throw new OperationRejected('that target has no armor class');
  }
  const armorClass = preparedStatistics(actor.data)['ac'];
  if (armorClass === undefined) {
    throw new OperationRejected('that target has no armor class');
  }
  return {
    armorClass: armorClass.total,
    tokenPublic: isPublic(token.data),
    actorPublic: isPublic(actor.data),
    tokenId: token.data.id,
    name: token.data.name ?? actor.data.name,
  };
}

/** Rolls the `attackNumber`th attack of a turn with the weapon `payload.itemId`, against `payload.dc` if given. */
export function rollActorStrike(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: StrikeTarget & {
    actorId: string;
    attackNumber: 1 | 2 | 3 | undefined;
    dc?: number | undefined;
    targetTokenId?: string | undefined;
  },
): ChatStrikeAttackMessage {
  const { actor, strike } = strikeFor(store, seat, payload.actorId, payload);
  if (payload.attackNumber === undefined) {
    throw new OperationRejected(
      'attackNumber is required when there is no active combat to count the turn',
    );
  }
  const breakdown = strike.attacks[payload.attackNumber - 1];
  if (breakdown === undefined) {
    throw new OperationRejected('attackNumber must be 1, 2, or 3');
  }
  const target =
    payload.targetTokenId === undefined
      ? undefined
      : strikeTargetOf(store, seat, payload.targetTokenId);
  const dc = payload.dc ?? target?.armorClass;
  const { roll } = rollCheck({
    statistic: breakdown,
    rng,
    ...(dc === undefined ? {} : { dc }),
  });
  // A DC the caller gave is theirs to show; one worked out from a target's Armor Class is shown
  // only when that actor is public, so a card never gives away a monster's AC.
  const shownDc =
    payload.dc ?? (target?.actorPublic === true ? target.armorClass : undefined);
  const message: ChatStrikeAttackMessage = {
    ...messageBase(store, seat, actor, strike),
    kind: 'strikeAttack',
    attackNumber: payload.attackNumber,
    ...(shownDc === undefined ? {} : { dc: shownDc }),
    ...(target?.tokenPublic === true
      ? { targetTokenId: target.tokenId, targetName: target.name }
      : {}),
    breakdown,
    roll,
  };
  store.putDocument(message);
  return message;
}

/**
 * `rollActorStrike` with the attack number taken from the combat tracker when the
 * caller does not give one: the attacker's attacks this turn plus one, in an active
 * combat the actor is in once. The attack is then counted, and the updated combatant
 * returned. A number the caller gives is an override and counts nothing. Outside an
 * active combat there is no tracker and the number is required.
 */
export function rollTrackedStrike(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: StrikeTarget & {
    actorId: string;
    attackNumber?: 1 | 2 | 3 | undefined;
    dc?: number | undefined;
    targetTokenId?: string | undefined;
  },
): { message: ChatStrikeAttackMessage; combatant?: Combatant } {
  const tracked =
    payload.attackNumber === undefined
      ? trackedAttack(store, payload.actorId)
      : undefined;
  const message = rollActorStrike(store, seat, rng, {
    ...payload,
    attackNumber: payload.attackNumber ?? tracked?.attackNumber,
  });
  return tracked === undefined
    ? { message }
    : { message, combatant: countAttack(store, tracked.combatant) };
}

/** Rolls the weapon `payload.itemId`'s damage: doubled and with `deadly`/`fatal` applied if `critical`. */
export function rollActorDamage(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: StrikeTarget & { actorId: string; critical: boolean },
): ChatStrikeDamageMessage {
  const { actor, strike } = strikeFor(store, seat, payload.actorId, payload);
  const rolled = strike.rollDamage(payload.critical, rng);
  if (!rolled.ok) {
    // The expressions are generated from validated data, not typed by a user.
    throw new Error(
      `internal error: strike damage failed to roll: ${rolled.error.message}`,
    );
  }
  const message: ChatStrikeDamageMessage = {
    ...messageBase(store, seat, actor, strike),
    kind: 'strikeDamage',
    critical: payload.critical,
    breakdown: strike.damageModifiers,
    roll: rolled.result,
  };
  store.putDocument(message);
  return message;
}
