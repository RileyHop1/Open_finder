/**
 * Persistent damage at the end of a turn, and the flat check that ends it --
 * see `docs/conditions.md` ("Persistent damage") and `docs/rulings.md`. Pure: it
 * decides what is due and what the results mean, and the server (milestone 5,
 * B.7) rolls the dice, applies the damage, and posts the chat cards.
 *
 * - At the **end of its bearer's turn** each persistent damage entry hurts them.
 * - Then a **flat check** against **DC 15** (**DC 10** if someone helps) can end it.
 *   A flat check is a plain d20: it succeeds when the natural roll is at least the
 *   DC, with no degrees and no shift on a natural 20 or 1.
 * - **One entry per damage type**: a second source of the same type keeps the
 *   worse (the higher average). Different types stack.
 *
 * **Every number here is marked (confirm)** in `docs/rulings.md`: written from
 * memory of Player Core, not checked against the Archives of Nethys.
 */

import type { PersistentDamage } from '../content/persistentDamage.js';
import { averageDamage } from '../content/persistentDamage.js';

/** The flat check DC to end persistent damage. */
export const FLAT_CHECK_DC = 15;

/** The DC when someone helps (an appropriate treatment, or help from an ally). */
export const ASSISTED_FLAT_CHECK_DC = 10;

/** The flat check DC, assisted or not. */
export function flatCheckDc(options: { readonly assisted: boolean }): number {
  return options.assisted ? ASSISTED_FLAT_CHECK_DC : FLAT_CHECK_DC;
}

/** Whether a flat check's natural roll ends the persistent damage. */
export function endsPersistentDamage(options: {
  readonly natural: number;
  readonly assisted: boolean;
}): boolean {
  return options.natural >= flatCheckDc(options);
}

/**
 * Adds `incoming`, keeping one entry per damage type: against an existing entry
 * of the same type, the higher average wins (a tie keeps the existing one), in
 * the existing entry's place. A different type is appended. Returns a new list.
 */
export function addPersistentDamage(
  current: readonly PersistentDamage[],
  incoming: PersistentDamage,
): PersistentDamage[] {
  const index = current.findIndex((entry) => entry.damageType === incoming.damageType);
  if (index === -1) {
    return [...current, incoming];
  }
  const existing = current[index];
  const better =
    (averageDamage(incoming.formula) ?? 0) >
    (averageDamage(existing?.formula ?? '') ?? 0);
  return current.map((entry, i) => (i === index && better ? incoming : entry));
}

/** The entries to roll at the end of the bearer's turn, in the list's order. */
export function persistentDamageDue(
  current: readonly PersistentDamage[],
): PersistentDamage[] {
  return [...current];
}

/** What the caller rolled for one due entry. */
export interface PersistentDamageResult {
  readonly id: string;
  /** The damage rolled, before resistances and immunities (the damage layer's). */
  readonly damage: number;
  /** The natural d20 of the flat check made after the damage. */
  readonly natural: number;
  /** Whether someone helped, which lowers the DC to 10. */
  readonly assisted?: boolean;
}

/** What happened to an entry, for the chat card and the GM's undo. */
export type PersistentDamageEvent =
  | {
      readonly kind: 'damaged';
      readonly id: string;
      readonly damageType: string;
      readonly damage: number;
    }
  | {
      readonly kind: 'ended';
      readonly id: string;
      readonly damageType: string;
      readonly natural: number;
      readonly dc: number;
    }
  | {
      readonly kind: 'stillBurning';
      readonly id: string;
      readonly damageType: string;
      readonly natural: number;
      readonly dc: number;
    };

/**
 * Applies the flat checks for the entries that were due: those that succeeded end
 * and are removed, the rest stay. An entry with no result is left alone and
 * produces no event. Returns the new list and the events, in the list's order.
 */
export function resolvePersistentDamage(
  current: readonly PersistentDamage[],
  results: readonly PersistentDamageResult[],
): { remaining: PersistentDamage[]; events: PersistentDamageEvent[] } {
  const remaining: PersistentDamage[] = [];
  const events: PersistentDamageEvent[] = [];
  for (const entry of current) {
    const result = results.find((r) => r.id === entry.id);
    if (result === undefined) {
      remaining.push(entry);
      continue;
    }
    const assisted = result.assisted ?? false;
    const dc = flatCheckDc({ assisted });
    events.push({
      kind: 'damaged',
      id: entry.id,
      damageType: entry.damageType,
      damage: result.damage,
    });
    if (endsPersistentDamage({ natural: result.natural, assisted })) {
      events.push({
        kind: 'ended',
        id: entry.id,
        damageType: entry.damageType,
        natural: result.natural,
        dc,
      });
    } else {
      remaining.push(entry);
      events.push({
        kind: 'stillBurning',
        id: entry.id,
        damageType: entry.damageType,
        natural: result.natural,
        dc,
      });
    }
  }
  return { remaining, events };
}
