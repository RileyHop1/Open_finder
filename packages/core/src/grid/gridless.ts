/**
 * GridlessGrid: freeform measurement with no snapping, for area and overworld
 * maps where exact positioning does not matter (`docs/grid.md`). Distance is
 * the straight line, scaled by the scene's pixels-per-foot, so a gridless
 * scene still reads in feet. It deliberately does not apply PF2e's diagonal
 * rule: there is no grid to count diagonals on.
 */

import type { SceneGrid } from '../scene.js';
import type { Cell, Footprint, GridStrategy, Point } from './gridStrategy.js';

export class GridlessGrid implements GridStrategy {
  readonly grid: SceneGrid;

  constructor(grid: SceneGrid) {
    this.grid = grid;
  }

  /** No grid to snap to: the point is already legal. */
  snap(center: Point): Point {
    return { x: center.x, y: center.y };
  }

  /** A gridless scene has no cells. */
  cellsUnder(): Cell[] {
    return [];
  }

  pathDistance(path: readonly Point[]): number {
    let pixels = 0;
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      if (from !== undefined && to !== undefined) {
        pixels += Math.hypot(to.x - from.x, to.y - from.y);
      }
    }
    return this.toFeet(pixels);
  }

  /**
   * Treats each footprint as the rectangle spanned by the **centres** of the
   * squares it would occupy, and measures the gap between the two rectangles.
   * For two one-square tokens that is exactly centre to centre, and for a
   * larger token it is measured from the nearest occupied square, which is
   * what the square grid does.
   */
  distanceBetween(a: Footprint, b: Footprint): number {
    const reach = ((a.size - 1) / 2 + (b.size - 1) / 2) * this.grid.size;
    const dx = Math.max(0, Math.abs(a.center.x - b.center.x) - reach);
    const dy = Math.max(0, Math.abs(a.center.y - b.center.y) - reach);
    return this.toFeet(Math.hypot(dx, dy));
  }

  /** No cells on a gridless scene: the client draws the circle itself. */
  burst(): Cell[] {
    return [];
  }

  /** No cells on a gridless scene: the client draws the circle itself. */
  emanation(): Cell[] {
    return [];
  }

  /** No cells on a gridless scene: the client draws the shape itself. */
  line(): Cell[] {
    return [];
  }

  /** No cells on a gridless scene: the client draws the shape itself. */
  cone(): Cell[] {
    return [];
  }

  private toFeet(pixels: number): number {
    return (pixels * this.grid.distance) / this.grid.size;
  }
}
