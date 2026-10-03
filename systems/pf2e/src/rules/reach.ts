/**
 * Reach and threatened area -- see `docs/grid.md`, "Reach and threatened
 * area". Reach is a property of the **attack**, not only the creature: a
 * Large creature wielding a reach weapon is not simply "10 feet", it is its
 * own natural reach *plus* the weapon's bonus.
 */

import type { Cell, Footprint, GridStrategy } from '@hearthtable/core';

import { footprintForSize } from './squareGrid.js';
import type { Size } from '../content/common.js';

/** The reach trait's bonus, in feet. */
const REACH_TRAIT_BONUS = 5;

/** Feet per square of a creature's own natural reach -- matches the size table in `docs/grid.md`. */
const FEET_PER_REACH_SQUARE = 5;

/**
 * A creature's own natural reach, in feet, from its size: 5 for Medium or
 * smaller, 10/15/20 for Large/Huge/Gargantuan -- the same progression as
 * `footprintForSize`, five feet per square.
 */
export function naturalReach(size: Size): number {
  return footprintForSize(size) * FEET_PER_REACH_SQUARE;
}

/**
 * How far a melee attack reaches: the creature's natural reach, plus 5 feet if
 * the weapon (or the strike) has the `reach` trait. A Large creature with a
 * reach weapon is 15 feet (10 natural + 5), never a flat 10.
 */
export function meleeReach(size: Size, hasReachTrait: boolean): number {
  return naturalReach(size) + (hasReachTrait ? REACH_TRAIT_BONUS : 0);
}

/**
 * Every cell `attacker` threatens with `reachFeet` of reach: `GridStrategy.emanation`,
 * named for this use. Includes the attacker's own cells, as emanation always does.
 */
export function threatenedCells(
  grid: GridStrategy,
  attacker: Footprint,
  reachFeet: number,
): Cell[] {
  return grid.emanation(attacker, reachFeet);
}

/** Whether `attacker` (with `reachFeet` of reach) threatens `target` at all: do their cells overlap? */
export function threatens(
  grid: GridStrategy,
  attacker: Footprint,
  reachFeet: number,
  target: Footprint,
): boolean {
  const threatened = new Set(
    threatenedCells(grid, attacker, reachFeet).map((cell) => `${cell.col},${cell.row}`),
  );
  return grid
    .cellsUnder(target)
    .some((cell) => threatened.has(`${cell.col},${cell.row}`));
}
