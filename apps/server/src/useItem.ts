/**
 * `actor.useItem` (ADR 0021, `docs/inventory.md`): spending a consumable.
 * Decrements its `uses.current` (or, when it has no `uses`, its `quantity`
 * -- and removes it from the sheet once that reaches zero), and posts a
 * `ChatMessage` with its name and rules text. If that text contains a dice
 * expression, the card carries the same structured roll data any other roll
 * does (`chat.sendRoll`'s own pattern) -- using a consumable is not a new
 * kind of roll, just a new trigger for one. Anything the roll should *do*
 * still goes through the operation for that (`actor.heal`,
 * `actor.removeCondition`); this module only spends the item and posts the
 * card.
 */

import type { Actor, BaseDocument, ChatItemUseMessage, Seat } from '@hearthtable/core';
import { actorSchema } from '@hearthtable/core';
import type { RandomSource } from '@hearthtable/dice';
import { evaluate, parse } from '@hearthtable/dice';
import type { CharacterItem, GearEntry } from '@hearthtable/pf2e';
import { characterDataSchema } from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import { chatPermissions } from './hitPoints.js';
import { OperationRejected } from './rejection.js';
import { loadOwnedDocument } from './writeGuard.js';
import type { WorldStore } from './worldStore.js';

export interface UseItemChange {
  readonly documents: readonly BaseDocument[];
}

/**
 * The first dice expression in `text`, if any -- a single die term (e.g.
 * `1d8`) with an optional keep/drop modifier and a trailing `+`/`-`
 * constant (e.g. `1d8+5`). Consumable flavor text only ever carries one
 * formula, so this does not chase the full grammar's multi-term chaining
 * (`docs/dice.md`).
 */
function findDiceExpression(text: string): string | undefined {
  const match = /\d{1,2}d\d{1,3}(?:(?:kh|kl|dh|dl)\d{0,2})?(?:\s*[+-]\s*\d{1,3})?/i.exec(
    text,
  );
  return match?.[0].replace(/\s+/g, '');
}

/** The rolled result of the first dice expression in `text`, or `undefined` if it has none or the expression does not actually parse/evaluate. Never throws -- a malformed-looking formula just means no roll on the card. */
function rollFromText(text: string, rng: RandomSource) {
  const expression = findDiceExpression(text);
  if (expression === undefined) {
    return undefined;
  }
  const parsed = parse(expression);
  if (!parsed.ok) {
    return undefined;
  }
  const evaluated = evaluate(expression, parsed.expression, { rng });
  return evaluated.ok ? evaluated.result : undefined;
}

function consumableEntry(item: CharacterItem, itemId: string): GearEntry {
  if (item.entry.kind !== 'gear' || item.entry.consumable === undefined) {
    throw new OperationRejected(`item ${itemId} is not a consumable`);
  }
  return item.entry;
}

/** `items` with `itemId` spent once: its uses decremented, or its quantity decremented (removing it entirely at zero). */
function spend(items: readonly CharacterItem[], itemId: string): CharacterItem[] {
  const item = items.find((i) => i.id === itemId);
  if (item === undefined) {
    throw new OperationRejected(`no item found with id ${itemId}`);
  }
  const entry = consumableEntry(item, itemId);
  const consumable = entry.consumable;
  if (consumable !== undefined && consumable.uses !== undefined) {
    const uses = consumable.uses;
    if (uses.current <= 0) {
      throw new OperationRejected(`${entry.name} has no uses left`);
    }
    const updated: CharacterItem = {
      ...item,
      entry: {
        ...entry,
        consumable: { ...consumable, uses: { ...uses, current: uses.current - 1 } },
      },
    };
    return items.map((i) => (i.id === itemId ? updated : i));
  }
  if (item.quantity <= 1) {
    return items.filter((i) => i.id !== itemId);
  }
  return items.map((i) => (i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i));
}

/** Uses item `payload.itemId` on character `payload.actorId`: spends it and posts the chat card. Owner or GM only. */
export function useItem(
  store: WorldStore,
  seat: Seat,
  rng: RandomSource,
  payload: { actorId: string; itemId: string },
): UseItemChange {
  const { raw } = loadOwnedDocument(store, seat, payload.actorId, 'actor', 'actor');
  const loaded = actorSchema.parse(raw);
  if (loaded.kind !== 'character') {
    throw new OperationRejected(`a ${loaded.kind} does not have a character sheet`);
  }
  const before = characterDataSchema.parse(loaded.system);
  const item = before.items.find((i) => i.id === payload.itemId);
  if (item === undefined) {
    throw new OperationRejected(`no item found with id ${payload.itemId}`);
  }
  const entry = consumableEntry(item, payload.itemId);

  const actor: Actor = editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    items: spend(data.items, payload.itemId),
  }));

  const roll = rollFromText(entry.description, rng);
  const now = new Date().toISOString();
  const message: ChatItemUseMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: chatPermissions(actor),
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    kind: 'itemUse',
    actorId: actor.id,
    actorName: actor.name,
    itemName: entry.name,
    text: entry.description,
    ...(roll === undefined ? {} : { roll }),
  };
  store.putDocument(message);
  return { documents: [actor, message] };
}
