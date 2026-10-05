/**
 * The party's shared stash: items anyone can take, plus a shared purse
 * (ADR 0021, `docs/inventory.md`). `Party` (`@hearthtable/core`) stores this
 * opaque to core, the same way an `Actor`'s `system` is -- it is the first
 * system-specific thing a `Party` carries, so it follows that existing
 * pattern (ADR 0014) rather than inventing a second one.
 */

import { z } from 'zod';

import { idSchema } from '@hearthtable/core';

import { characterItemEntrySchema, itemSourceSchema } from './character.js';
import { ZERO_COINS, coinsSchema } from './coins.js';

/**
 * An embedded item sitting in the stash rather than on a character --
 * `characterItemSchema`'s shape minus `equipped`, which means nothing for
 * an item nobody is carrying yet.
 */
export const stashItemSchema = z.object({
  id: idSchema,
  source: itemSourceSchema.optional(),
  entry: characterItemEntrySchema,
  quantity: z.number().int().positive().default(1),
});

export type StashItem = z.infer<typeof stashItemSchema>;

export const partyStashSchema = z
  .object({
    coins: coinsSchema.default(ZERO_COINS),
    items: z.array(stashItemSchema).default([]),
  })
  .refine(
    (stash) => new Set(stash.items.map((item) => item.id)).size === stash.items.length,
    {
      message: 'two stash items cannot share an id',
      path: ['items'],
    },
  );

export type PartyStash = z.infer<typeof partyStashSchema>;

/** A blank stash: no items, an empty purse. What `party.create` stores for a new party. */
export function newPartyStash(): PartyStash {
  return partyStashSchema.parse({});
}
