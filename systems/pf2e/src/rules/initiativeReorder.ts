/**
 * The GM's reorder: "move this combatant before that one", turned into the
 * initiative numbers that make the derived order come out that way (ADR 0018,
 * decision 3 -- the order is never stored, so a move assigns numbers).
 *
 * - **Room between neighbours:** the mover takes the midpoint (14.5 between a 15
 *   and a 14).
 * - **At the top or the bottom:** one above the first, or one below the last
 *   rolled combatant.
 * - **A tie:** no number lies strictly between two equal ones, so the tied
 *   group, mover included, is spread evenly across the gap up to the next higher
 *   initiative, keeping its current order and leaving its last member's number
 *   alone. A few neighbours' numbers change; the order is preserved.
 *
 * Pure, and it returns only what changed. `undefined` means it cannot be done by
 * number (the place asked for is among the unrolled, which have no number to sit
 * between, or the gap is exhausted after about fifty moves into it): the server
 * tells the GM to roll, or to set the initiative directly, and never misorders
 * silently.
 */

import { MAX_INITIATIVE } from '@hearthtable/core';

import type { InitiativeEntry } from './initiativeOrder.js';

/** A new initiative for one combatant. */
export interface InitiativeChange {
  readonly id: string;
  readonly initiative: number;
}

function withinBounds(value: number): boolean {
  return Math.abs(value) <= MAX_INITIATIVE;
}

/**
 * Where `moverId` goes: immediately before `beforeId`, or last when `beforeId`
 * is undefined. `sorted` is `sortByInitiative`'s output.
 */
export function placeCombatant(
  sorted: readonly InitiativeEntry[],
  moverId: string,
  beforeId: string | undefined,
): InitiativeChange[] | undefined {
  const mover = sorted.find((entry) => entry.id === moverId);
  if (mover === undefined) {
    return undefined;
  }
  if (beforeId === moverId) {
    return [];
  }

  const rest = sorted.filter((entry) => entry.id !== moverId);
  const index =
    beforeId === undefined ? rest.length : rest.findIndex((e) => e.id === beforeId);
  if (index === -1) {
    return undefined;
  }
  // Already exactly there.
  if (sorted.indexOf(mover) === index) {
    return [];
  }

  const above = rest[index - 1];
  const below = rest[index];

  // Among the unrolled there is no number to sit between.
  if (above !== undefined && above.initiative === undefined) {
    return undefined;
  }
  const upper = above?.initiative;
  const lower = below?.initiative;

  if (upper === undefined) {
    const value = lower === undefined ? 0 : lower + 1;
    return withinBounds(value) ? [{ id: moverId, initiative: value }] : undefined;
  }
  if (lower === undefined) {
    const value = upper - 1;
    return withinBounds(value) ? [{ id: moverId, initiative: value }] : undefined;
  }
  if (upper > lower) {
    const value = (upper + lower) / 2;
    return value < upper && value > lower
      ? [{ id: moverId, initiative: value }]
      : undefined;
  }

  // A tie: spread the whole tied group, mover included.
  const start = rest.findIndex((entry) => entry.initiative === lower);
  const group = rest.filter((entry) => entry.initiative === lower);
  const offset = index - start;
  const ordered = [...group.slice(0, offset), mover, ...group.slice(offset)];
  const ceiling = rest[start - 1]?.initiative ?? lower + 1;
  const step = (ceiling - lower) / ordered.length;

  const changes: InitiativeChange[] = [];
  ordered.forEach((entry, position) => {
    const value =
      position === ordered.length - 1
        ? lower
        : lower + (ordered.length - 1 - position) * step;
    if (entry.initiative !== value) {
      changes.push({ id: entry.id, initiative: value });
    }
  });
  return changes.every((change) => withinBounds(change.initiative)) ? changes : undefined;
}
