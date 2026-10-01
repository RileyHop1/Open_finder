/**
 * Item operations on a character: add, equip or restack, remove. Each is just
 * an edit function handed to `editCharacter` (`actors.ts`), so ownership,
 * validation, and storage are the same one path `actor.update` and the
 * condition operations use.
 *
 * **The server makes the copy.** `addItem` takes only a pack and a slug and
 * copies the entry from the server's own compendium (ADR 0014, ADR 0015). A
 * client cannot supply an item's stats or rule elements; `updateItem` can
 * change only whether it is equipped and how many there are.
 */

import type { Actor, Seat } from '@hearthtable/core';
import { characterItemEntrySchema } from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

/**
 * Adds a new, unequipped item copied from compendium entry `packId/slug`.
 * Each add is its own item with its own id, even for an entry the character
 * already has: two longswords are two items (`characterItemSchema`), and
 * `updateItem` can raise a stack's `quantity` instead.
 */
export function addItem(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: { actorId: string; packId: string; slug: string },
): Actor {
  const found = compendium.get(payload.packId, payload.slug);
  if (found === undefined) {
    throw new OperationRejected(
      `no compendium entry ${payload.packId}/${payload.slug}` +
        (compendium.status().available ? '' : ' (no content has been imported)'),
    );
  }
  const carriable = characterItemEntrySchema.safeParse(found);
  if (!carriable.success) {
    throw new OperationRejected(`${found.name} cannot be carried by a character`);
  }
  const entry = carriable.data;

  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    items: [
      ...data.items,
      {
        id: crypto.randomUUID(),
        source: { packId: payload.packId, slug: payload.slug },
        entry,
        equipped: false,
        quantity: 1,
      },
    ],
  }));
}

/**
 * Sets `equipped` and/or `quantity` on one item. Equipping a suit of armor
 * takes off any other: a character wears one at a time, and
 * `prepareCharacter` reads the first equipped armor, so leaving two equipped
 * would make the result depend on list order (`docs/rulings.md`).
 */
export function updateItem(
  store: WorldStore,
  seat: Seat,
  payload: {
    actorId: string;
    itemId: string;
    equipped?: boolean | undefined;
    quantity?: number | undefined;
  },
): Actor {
  return editCharacter(store, seat, payload.actorId, (data) => {
    const target = data.items.find((item) => item.id === payload.itemId);
    if (target === undefined) {
      throw new OperationRejected(`no item found with id ${payload.itemId}`);
    }
    const takingOffOtherArmor =
      payload.equipped === true && target.entry.kind === 'armor';
    return {
      ...data,
      items: data.items.map((item) => {
        if (item.id === target.id) {
          return {
            ...item,
            ...(payload.equipped === undefined ? {} : { equipped: payload.equipped }),
            ...(payload.quantity === undefined ? {} : { quantity: payload.quantity }),
          };
        }
        return takingOffOtherArmor && item.entry.kind === 'armor'
          ? { ...item, equipped: false }
          : item;
      }),
    };
  });
}

/** Removes one item. */
export function removeItem(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string; itemId: string },
): Actor {
  return editCharacter(store, seat, payload.actorId, (data) => {
    if (!data.items.some((item) => item.id === payload.itemId)) {
      throw new OperationRejected(`no item found with id ${payload.itemId}`);
    }
    return { ...data, items: data.items.filter((item) => item.id !== payload.itemId) };
  });
}
