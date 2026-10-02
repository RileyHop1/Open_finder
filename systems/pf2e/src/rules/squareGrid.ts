/**
 * SquareGrid: PF2e's square grid -- the `GridStrategy` for scenes whose grid
 * type is `square` (`docs/grid.md`, ADR 0017). It is here rather than in core
 * because the diagonal rule is a game rule: the first diagonal costs one
 * square, the second two, and the count alternates (Player Core, Playing the
 * Game, Grid Movement; checked on Archives of Nethys 2026-10-01).
 *
 * Cell (col, row) covers the scene pixels
 * `[offset + col * size, offset + (col + 1) * size)`, so the grid's offset
 * lines it up with a map's printed grid. A token's position is its centre.
 */

import type { Cell, Footprint, GridStrategy, Point, SceneGrid } from '@hearthtable/core';

/** Floating-point slack for a radius comparison (feet). */
const EPSILON_FEET = 1e-9;

import type { Size } from '../content/common.js';

/**
 * Squares per side for each creature size. Tiny shares a square, so it is 1
 * here and the token layer must allow several tokens in one square; a Large
 * creature is 2x2 (a 10-foot space), Huge 3x3, Gargantuan 4x4. A Gargantuan
 * creature can be larger than 4x4 (its space is "20 feet or more"), which is
 * why the GM can change a token's size by hand.
 */
const FOOTPRINT: Record<Size, number> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

/** A token's side length in grid squares for a creature of this size. */
export function footprintForSize(size: Size): number {
  return FOOTPRINT[size];
}

/**
 * Squares of movement for a route that is `straight` orthogonal steps and
 * `diagonals` diagonal ones: every diagonal costs one square, and every second
 * diagonal costs one more (1, 2, 1, 2 ... so 1, 3, 4, 6 squares for 1, 2, 3, 4
 * diagonals, which is 5, 15, 20, 30 feet).
 */
function squaresMoved(straight: number, diagonals: number): number {
  return straight + diagonals + Math.floor(diagonals / 2);
}

/** Squares of movement to cross `dx` columns and `dy` rows: as many diagonals as fit, the rest straight. */
function squaresAcross(dx: number, dy: number): number {
  const diagonals = Math.min(dx, dy);
  return squaresMoved(Math.abs(dx - dy), diagonals);
}

export class SquareGrid implements GridStrategy {
  readonly grid: SceneGrid;

  constructor(grid: SceneGrid) {
    this.grid = grid;
  }

  snap(center: Point, size: number): Point {
    const col = this.firstCell(center.x, this.grid.offsetX, size);
    const row = this.firstCell(center.y, this.grid.offsetY, size);
    return {
      x: this.grid.offsetX + (col + size / 2) * this.grid.size,
      y: this.grid.offsetY + (row + size / 2) * this.grid.size,
    };
  }

  cellsUnder(footprint: Footprint): Cell[] {
    const { col, row } = this.topLeft(footprint);
    const cells: Cell[] = [];
    for (let r = 0; r < footprint.size; r++) {
      for (let c = 0; c < footprint.size; c++) {
        cells.push({ col: col + c, row: row + r });
      }
    }
    return cells;
  }

  /**
   * Counts the squares crossed by each segment (a point is read as the nearest
   * square, so a drag that has not snapped yet still measures sensibly) and
   * the diagonals among them, then applies the alternating rule to the **whole
   * path**, since the count carries over between segments.
   *
   * The count is per path, not per turn: Player Core carries it across all of
   * a turn's movement and resets it at the end of the turn, which is the
   * combat tracker's to track (milestone 5).
   */
  pathDistance(path: readonly Point[]): number {
    let straight = 0;
    let diagonals = 0;
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1];
      const to = path[i];
      if (from === undefined || to === undefined) {
        continue;
      }
      const dx = Math.round(Math.abs(to.x - from.x) / this.grid.size);
      const dy = Math.round(Math.abs(to.y - from.y) / this.grid.size);
      diagonals += Math.min(dx, dy);
      straight += Math.abs(dx - dy);
    }
    return squaresMoved(straight, diagonals) * this.grid.distance;
  }

  /**
   * Squares between the nearest occupied squares of the two footprints,
   * counted with the same alternating rule as movement. Footprints that share
   * or overlap a square (Tiny creatures may) are 0 apart, and neighbouring
   * squares are one apart.
   */
  distanceBetween(a: Footprint, b: Footprint): number {
    const ta = this.topLeft(a);
    const tb = this.topLeft(b);
    const dx = Math.max(
      0,
      tb.col - (ta.col + a.size - 1),
      ta.col - (tb.col + b.size - 1),
    );
    const dy = Math.max(
      0,
      tb.row - (ta.row + a.size - 1),
      ta.row - (tb.row + b.size - 1),
    );
    return squaresAcross(dx, dy) * this.grid.distance;
  }

  /**
   * Every cell within `radiusFeet` of `origin`, snapped to the nearest
   * 1-square cell -- see `docs/rulings.md`, "Burst and emanation origin
   * points" for why a cell centre rather than an intersection. Scanned over a
   * bounding box and kept by the same alternating-diagonal rule
   * `distanceBetween` uses, in row-major order.
   */
  burst(origin: Point, radiusFeet: number): Cell[] {
    const centre = this.topLeft({ center: origin, size: 1 });
    const reach = this.squaresFor(radiusFeet);
    const cells: Cell[] = [];
    for (let row = centre.row - reach; row <= centre.row + reach; row += 1) {
      for (let col = centre.col - reach; col <= centre.col + reach; col += 1) {
        const feet =
          squaresAcross(Math.abs(col - centre.col), Math.abs(row - centre.row)) *
          this.grid.distance;
        if (feet <= radiusFeet + EPSILON_FEET) {
          cells.push({ col, row });
        }
      }
    }
    return cells;
  }

  /**
   * Every cell within `radiusFeet` of `footprint`'s nearest edge: the same gap
   * measurement `distanceBetween` makes against another footprint, applied to
   * every cell in a bounding box, in row-major order. At `radiusFeet` 0 this is
   * exactly `cellsUnder(footprint)`, since a cell under the footprint has a gap
   * of 0 on both axes.
   */
  emanation(footprint: Footprint, radiusFeet: number): Cell[] {
    const top = this.topLeft(footprint);
    const reach = this.squaresFor(radiusFeet);
    const cells: Cell[] = [];
    const rowStart = top.row - reach;
    const rowEnd = top.row + footprint.size - 1 + reach;
    const colStart = top.col - reach;
    const colEnd = top.col + footprint.size - 1 + reach;
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        const dx = Math.max(0, col - (top.col + footprint.size - 1), top.col - col);
        const dy = Math.max(0, row - (top.row + footprint.size - 1), top.row - row);
        const feet = squaresAcross(dx, dy) * this.grid.distance;
        if (feet <= radiusFeet + EPSILON_FEET) {
          cells.push({ col, row });
        }
      }
    }
    return cells;
  }

  /** Squares `radiusFeet` could possibly reach, rounded up: the scan's bounding box. */
  private squaresFor(radiusFeet: number): number {
    return Math.ceil(radiusFeet / this.grid.distance);
  }

  /** The column or row of a footprint's first square, given its centre along one axis. */
  private firstCell(centre: number, offset: number, size: number): number {
    return Math.round((centre - offset) / this.grid.size - size / 2);
  }

  private topLeft(footprint: Footprint): Cell {
    return {
      col: this.firstCell(footprint.center.x, this.grid.offsetX, footprint.size),
      row: this.firstCell(footprint.center.y, this.grid.offsetY, footprint.size),
    };
  }
}
