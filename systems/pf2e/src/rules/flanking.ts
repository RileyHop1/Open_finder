/**
 * Flanking -- see `docs/grid.md` ("Flanking") and `docs/rulings.md`. Two allies
 * flank a target when **both threaten it** and they are on **opposite sides**
 * of it. Pure geometry plus the grid's own reach test; the server (milestone 5,
 * B.8) applies off-guard, naming flanking as its source.
 *
 * **The opposite-sides test is a judgment call, marked (confirm)** in
 * `docs/rulings.md`: a line from one ally through the target must continue,
 * within a tolerance, to the other. Centres are used for every footprint, a
 * simplification for the rare larger ally.
 */

import type { Footprint, GridStrategy, Point } from '@hearthtable/core';

import { threatens } from './reach.js';

/**
 * How far from a straight line through the target the second ally may sit, in
 * degrees. 22.5 is half of the 45 degrees between neighbouring squares around a
 * target, so an ally one square off the straight line still counts, and one on
 * the diagonal does not.
 */
export const OPPOSITE_SIDES_TOLERANCE_DEGREES = 22.5;

const COS_TOLERANCE = Math.cos((OPPOSITE_SIDES_TOLERANCE_DEGREES * Math.PI) / 180);

/**
 * Whether `a` and `b` are on opposite sides of `target`: the direction from `a`
 * to the target and from the target to `b` agree within the tolerance. A point
 * on top of the target's centre has no side, so never counts.
 */
export function onOppositeSides(target: Point, a: Point, b: Point): boolean {
  const ux = target.x - a.x;
  const uy = target.y - a.y;
  const vx = b.x - target.x;
  const vy = b.y - target.y;
  const lengthU = Math.hypot(ux, uy);
  const lengthV = Math.hypot(vx, vy);
  if (lengthU === 0 || lengthV === 0) {
    return false;
  }
  return (ux * vx + uy * vy) / (lengthU * lengthV) >= COS_TOLERANCE - 1e-9;
}

/**
 * Whether two allies flank `target`: both threaten it with their own reach, and
 * their centres are on opposite sides of it. Symmetric in the two allies.
 */
export function flanks(
  grid: GridStrategy,
  target: Footprint,
  allyA: { readonly footprint: Footprint; readonly reachFeet: number },
  allyB: { readonly footprint: Footprint; readonly reachFeet: number },
): boolean {
  return (
    threatens(grid, allyA.footprint, allyA.reachFeet, target) &&
    threatens(grid, allyB.footprint, allyB.reachFeet, target) &&
    onOppositeSides(target.center, allyA.footprint.center, allyB.footprint.center)
  );
}
