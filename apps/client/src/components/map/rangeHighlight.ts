/**
 * The action bar's range highlight: every cell a hovered strike could reach
 * from the selected token, by the grid's own distance rule -- a melee strike
 * threatens like `threatenedCells` (A.10), a ranged one is a burst around the
 * token's centre. Kept apart from the component so the geometry is testable
 * without mounting anything or touching PixiJS.
 */

import type { Cell, GridStrategy, Point } from '@hearthtable/core';
import { threatenedCells } from '@hearthtable/pf2e';

export interface RangeTarget {
  readonly ranged: boolean;
  /** Feet to highlight: melee reach, or a ranged weapon's range. Undefined (an unknown ranged weapon, e.g. an NPC's) highlights nothing. */
  readonly feet: number | undefined;
}

/** `origin`/`size` are the selected token's centre and footprint size in squares. */
export function cellsInRange(
  grid: GridStrategy,
  origin: Point,
  size: number,
  target: RangeTarget,
): Cell[] {
  if (target.feet === undefined) {
    return [];
  }
  return target.ranged
    ? grid.burst(origin, target.feet)
    : threatenedCells(grid, { center: origin, size }, target.feet);
}
