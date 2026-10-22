/**
 * `actor.makeAlchemy` and `actor.dailyPreparations` (`docs/class-resources.md`): making
 * an infused alchemical item in one click, and a character's daily preparations all at
 * once. Both follow CLAUDE.md's automation line: the server does the bookkeeping (copy
 * the item, spend the vial, clear yesterday's infused items) and checks nothing against
 * the formula book or the day's count (ADR 0023).
 */

import type { Actor, Seat } from '@hearthtable/core';
import { characterItemEntrySchema, restEntry } from '@hearthtable/pf2e';

import { editCharacter } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
import type { WorldStore } from './worldStore.js';

/** The pool Quick Alchemy spends from (`rules/classResources.ts` in the PF2e system). */
const VIALS = 'versatile-vials';

/**
 * Copies `packId`/`slug` from the compendium onto the character as an infused item:
 * `daily` (Advanced Alchemy) by default, `quick` (Quick Alchemy) with `quick`, which also
 * spends one versatile vial, past the last one too. Owner or GM only.
 */
export function makeAlchemy(
  store: WorldStore,
  seat: Seat,
  compendium: CompendiumIndex,
  payload: {
    actorId: string;
    packId: string;
    slug: string;
    quantity?: number | undefined;
    quick?: boolean | undefined;
  },
): Actor {
  const found = compendium.get(payload.packId, payload.slug);
  if (found === undefined) {
    throw new OperationRejected(`no compendium entry ${payload.packId}/${payload.slug}`);
  }
  const carriable = characterItemEntrySchema.safeParse(found);
  if (!carriable.success) {
    throw new OperationRejected(`${found.name} cannot be carried by a character`);
  }
  const quick = payload.quick === true;
  return editCharacter(store, seat, payload.actorId, (data) => {
    const vials = data.resources[VIALS];
    return {
      ...data,
      items: [
        ...data.items,
        {
          id: crypto.randomUUID(),
          source: { packId: payload.packId, slug: payload.slug },
          entry: carriable.data,
          equipped: false,
          quantity: payload.quantity ?? 1,
          infused: quick ? 'quick' : 'daily',
        },
      ],
      resources: quick
        ? { ...data.resources, [VIALS]: { ...vials, used: (vials?.used ?? 0) + 1 } }
        : data.resources,
    };
  });
}

/**
 * Daily preparations: every spell slot available again, the focus pool full, every class
 * resource pool refilled (a hand-set maximum kept), and every infused item gone. Owner or
 * GM only.
 */
export function dailyPreparations(
  store: WorldStore,
  seat: Seat,
  payload: { actorId: string },
): Actor {
  return editCharacter(store, seat, payload.actorId, (data) => ({
    ...data,
    spellcasting: data.spellcasting.map(restEntry),
    focusPoints: { ...data.focusPoints, current: data.focusPoints.max },
    resources: Object.fromEntries(
      Object.entries(data.resources).map(([key, pool]) => [key, { ...pool, used: 0 }]),
    ),
    items: data.items.filter((item) => item.infused === undefined),
  }));
}
