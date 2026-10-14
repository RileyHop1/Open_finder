/**
 * `actor.castSpell`, `actor.refocus` and `actor.restSpells` (ADR 0025,
 * `docs/spellcasting.md`). Casting spends what the spell costs and posts a
 * `spellCast` chat card with the spell's text and the DC or attack bonus; it
 * never refuses for having nothing to spend (ADR 0023). When it did, the card
 * says `overspent` and the player reads "-1 slot".
 *
 * The state changes are `@hearthtable/pf2e`'s pure `castSpell` rules, so the
 * rules are tested without a server; this module loads the character, applies
 * them through `editCharacter` (the same path every sheet edit takes, so
 * ownership and validation are not repeated here) and writes the card.
 */

import type { Actor, BaseDocument, ChatSpellCastMessage, Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { CharacterData, SpellEntry } from '@hearthtable/pf2e';
import {
  cantripRank,
  characterDataSchema,
  prepareCharacter,
  refocus as refocusPool,
  restEntry,
  spendFocus,
  spendSlot,
} from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import { chatPermissions } from './hitPoints.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

export interface CastChange {
  readonly documents: readonly BaseDocument[];
}

/** The character `actorId` as sheet data, or a rejection if it is not one `seat` may edit. */
function loadCharacter(store: WorldStore, seat: Seat, actorId: string): CharacterData {
  const { raw } = loadOwnedDocument(store, seat, actorId, 'actor', 'actor');
  const actor = actorSchema.parse(raw);
  if (actor.kind !== 'character') {
    throw new OperationRejected(`a ${actor.kind} does not have a character sheet`);
  }
  return characterDataSchema.parse(actor.system);
}

/** Casts the spell item `payload.itemId`: spends its cost and posts the card. Owner or GM only. */
export function castSpell(
  store: WorldStore,
  seat: Seat,
  payload: {
    actorId: string;
    itemId: string;
    entryId?: string | undefined;
    rank?: number | undefined;
    focus?: boolean | undefined;
  },
): CastChange {
  const before = loadCharacter(store, seat, payload.actorId);
  const item = before.items.find((i) => i.id === payload.itemId);
  if (item === undefined) {
    throw new OperationRejected(`no item found with id ${payload.itemId}`);
  }
  if (item.entry.kind !== 'spell') {
    throw new OperationRejected(`${item.entry.name} is not a spell`);
  }
  const spell: SpellEntry = item.entry;

  const isCantrip = spell.traits.includes('cantrip');
  const cost = isCantrip ? 'cantrip' : payload.focus === true ? 'focus' : 'slot';
  // Cantrips and focus spells heighten themselves to half the caster's level, rounded up.
  const castRank =
    cost === 'slot'
      ? (payload.rank ?? spell.rank)
      : (payload.rank ?? cantripRank(before.level));

  const entryFor = (): CharacterData['spellcasting'][number] | undefined => {
    if (payload.entryId !== undefined) {
      const found = before.spellcasting.find((e) => e.id === payload.entryId);
      if (found === undefined) {
        throw new OperationRejected(
          `no spellcasting entry found with id ${payload.entryId}`,
        );
      }
      return found;
    }
    if (cost === 'slot') {
      throw new OperationRejected(
        `name the spellcasting entry whose slot ${spell.name} is cast from`,
      );
    }
    // A cantrip or focus spell with no entry named: the first entry of the spell's tradition.
    return (
      before.spellcasting.find((e) => spell.traditions.includes(e.tradition)) ??
      before.spellcasting[0]
    );
  };
  const entry = entryFor();

  let overspent = false;
  const actor: Actor = editCharacter(store, seat, payload.actorId, (data) => {
    if (cost === 'focus') {
      const spent = spendFocus(data.focusPoints);
      overspent = spent.overspent;
      return { ...data, focusPoints: spent.value };
    }
    if (cost === 'slot' && entry !== undefined) {
      const spent = spendSlot(entry, item.id, castRank);
      overspent = spent.overspent;
      return {
        ...data,
        spellcasting: data.spellcasting.map((e) => (e.id === entry.id ? spent.value : e)),
      };
    }
    return data;
  });

  const statistics = prepareCharacter(characterDataSchema.parse(actor.system)).statistics;
  const dc = entry === undefined ? undefined : statistics[`spellDc:${entry.id}`]?.total;
  const attackBonus =
    entry === undefined ? undefined : statistics[`spellAttack:${entry.id}`]?.total;

  const now = new Date().toISOString();
  const message: ChatSpellCastMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: chatPermissions(actor),
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    kind: 'spellCast',
    actorId: actor.id,
    actorName: actor.name,
    spellName: spell.name,
    castRank,
    cost,
    overspent,
    ...(entry === undefined ? {} : { tradition: entry.tradition }),
    ...(spell.defense !== undefined && dc !== undefined
      ? { dc, save: spell.defense.save, basic: spell.defense.basic }
      : {}),
    ...(spell.traits.includes('attack') && attackBonus !== undefined
      ? { attackBonus }
      : {}),
    text: spell.description,
  };
  store.putDocument(message);
  return { documents: [actor, message] };
}

/** Refocus: one focus point back, up to the maximum. Owner or GM only. */
export function refocus(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string },
): Actor {
  loadCharacter(store, seat, payload.actorId);
  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    focusPoints: refocusPool(data.focusPoints),
  }));
}

/** Daily preparation: every spell slot available again. Focus points are not touched. Owner or GM only. */
export function restSpells(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string },
): Actor {
  loadCharacter(store, seat, payload.actorId);
  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    spellcasting: data.spellcasting.map(restEntry),
  }));
}
