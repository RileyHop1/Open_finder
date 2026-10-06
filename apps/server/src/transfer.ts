/**
 * `inventory.transfer` (ADR 0021, `docs/inventory.md`): moving an item or
 * an amount of coins between a character's inventory and the party stash,
 * in either direction. Reads both sides, computes both new states, and
 * writes both -- the whole dispatch this runs inside is already wrapped in
 * one DB transaction (`realtime.ts`), so there is no moment where the item
 * or coins exist on neither side or on both.
 */

import type {
  Actor,
  BaseDocument,
  Party,
  Seat,
  TransferHolder,
  TransferPayload,
} from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type {
  CharacterData,
  CharacterItem,
  Coins,
  PartyStash,
  StashItem,
} from '@hearthtable/pf2e';
import {
  adjustCoins,
  characterDataSchema,
  coinsToCopper,
  partyStashSchema,
} from '@hearthtable/pf2e';

import { findParty, newParty } from './party.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

export interface TransferChange {
  readonly documents: readonly BaseDocument[];
}

type HeldItem = CharacterItem | StashItem;

/** Either loaded holder, with its items and coins read out uniformly so the move logic below never branches on `kind`. */
interface LoadedHolder {
  readonly items: readonly HeldItem[];
  readonly coins: Coins;
}

/** Builds the saved-back document for `holder`, given its new items and coins. An actor holder keeps every other field of its `CharacterData` untouched; re-validated on the way out, the same as `editCharacter`. */
function saveHolder(
  store: WorldStore,
  holder: TransferHolder,
  loaded: { actor?: Actor; party?: Party; data?: CharacterData; stash?: PartyStash },
  items: readonly HeldItem[],
  coins: Coins,
): BaseDocument {
  if (holder.kind === 'party') {
    const party = loaded.party as Party;
    const stash = partyStashSchema.parse({
      ...(loaded.stash as PartyStash),
      items,
      coins,
    });
    const updated: Party = { ...party, stash, updatedAt: new Date().toISOString() };
    store.putDocument(updated);
    return updated;
  }
  const actor = loaded.actor as Actor;
  const data = characterDataSchema.parse({
    ...(loaded.data as CharacterData),
    items,
    coins,
  });
  const updated: Actor = { ...actor, system: data, updatedAt: new Date().toISOString() };
  store.putDocument(updated);
  return updated;
}

function loadHolder(
  store: WorldStore,
  holder: TransferHolder,
): {
  loaded: { actor?: Actor; party?: Party; data?: CharacterData; stash?: PartyStash };
} & LoadedHolder {
  if (holder.kind === 'party') {
    const party = findParty(store) ?? newParty(store);
    const stash = partyStashSchema.parse(party.stash ?? {});
    return { loaded: { party, stash }, items: stash.items, coins: stash.coins };
  }
  const raw = store.getDocument(holder.actorId);
  const actor = actorSchema.safeParse(raw);
  if (!actor.success) {
    throw new OperationRejected(`no actor found with id ${holder.actorId}`);
  }
  if (actor.data.kind !== 'character') {
    throw new OperationRejected(`a ${actor.data.kind} does not have a character sheet`);
  }
  const data = characterDataSchema.parse(actor.data.system);
  return { loaded: { actor: actor.data, data }, items: data.items, coins: data.coins };
}

/** Owner or GM for an actor holder; GM only for the party stash, like every other stash change (`party.ts`). */
function requireSourcePermission(
  store: WorldStore,
  seat: Seat,
  from: TransferHolder,
): void {
  if (from.kind === 'party') {
    if (!seat.isGM) {
      throw new OperationRejected(
        'only the GM can move items or coins out of the party stash',
      );
    }
    return;
  }
  loadOwnedDocument(store, seat, from.actorId, 'actor', 'actor');
}

function removeItem(
  items: readonly HeldItem[],
  itemId: string,
  quantity: number | undefined,
): { remaining: HeldItem[]; moved: Pick<HeldItem, 'source' | 'entry' | 'quantity'> } {
  const found = items.find((item) => item.id === itemId);
  if (found === undefined) {
    throw new OperationRejected(`no item found with id ${itemId}`);
  }
  const moveQuantity = quantity ?? found.quantity;
  if (moveQuantity > found.quantity) {
    throw new OperationRejected('cannot move more of an item than is held');
  }
  const remaining =
    moveQuantity === found.quantity
      ? items.filter((item) => item.id !== itemId)
      : items.map((item) =>
          item.id === itemId ? { ...item, quantity: item.quantity - moveQuantity } : item,
        );
  return {
    remaining,
    moved: { source: found.source, entry: found.entry, quantity: moveQuantity },
  };
}

/** A fresh item at the destination -- never merged into an existing stack there, and never equipped, regardless of whether it was equipped at the source. */
function addItem(
  items: readonly HeldItem[],
  moved: Pick<HeldItem, 'source' | 'entry' | 'quantity'>,
): HeldItem[] {
  return [
    ...items,
    {
      id: crypto.randomUUID(),
      source: moved.source,
      entry: moved.entry,
      quantity: moved.quantity,
    },
  ];
}

export function transferInventory(
  store: WorldStore,
  seat: Seat,
  payload: TransferPayload,
): TransferChange {
  requireSourcePermission(store, seat, payload.from);

  const from = loadHolder(store, payload.from);
  const to = loadHolder(store, payload.to);

  if (payload.item !== undefined) {
    const { remaining, moved } = removeItem(
      from.items,
      payload.item.itemId,
      payload.item.quantity,
    );
    const fromDoc = saveHolder(store, payload.from, from.loaded, remaining, from.coins);
    const toDoc = saveHolder(
      store,
      payload.to,
      to.loaded,
      addItem(to.items, moved),
      to.coins,
    );
    return { documents: [fromDoc, toDoc] };
  }

  const amountCopper = coinsToCopper(payload.coins ?? {});
  const fromCoins = adjustCoins(from.coins, -amountCopper);
  if (fromCoins === undefined) {
    throw new OperationRejected('the source does not have enough coins for that');
  }
  const toCoins = adjustCoins(to.coins, amountCopper) as Coins;
  const fromDoc = saveHolder(store, payload.from, from.loaded, from.items, fromCoins);
  const toDoc = saveHolder(store, payload.to, to.loaded, to.items, toCoins);
  return { documents: [fromDoc, toDoc] };
}
