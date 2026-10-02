/**
 * GridStrategy: the one place a scene's geometry is decided -- see
 * `docs/grid.md` and ADR 0017. Distance, snapping, and which cells a token
 * covers go through this interface so that nothing else in the codebase
 * assumes squares (no `Math.abs(dx)` scattered through movement code), and so
 * a hex grid later is one more implementation rather than a rewrite.
 *
 * Everything here is in **scene pixels** for positions and **feet** for
 * distances (a scene's `grid.size` pixels is `grid.distance` feet). Core owns
 * the interface and the gridless strategy; the PF2e square grid, whose
 * diagonal rule is a game rule, lives in `systems/pf2e`.
 */

import type { SceneGrid } from '../scene.js';

/** A position in scene pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One cell of a grid, counted from the grid's own origin. */
export interface Cell {
  readonly col: number;
  readonly row: number;
}

/** A token's place on the map: its centre, and its side length in grid squares. */
export interface Footprint {
  readonly center: Point;
  readonly size: number;
}

export interface GridStrategy {
  /** The scene settings this strategy measures with. */
  readonly grid: SceneGrid;

  /**
   * The nearest legal centre for a token of `size` squares per side. A
   * footprint with an odd side centres on a cell, an even one on a grid
   * intersection. Idempotent: snapping a snapped point changes nothing.
   */
  snap(center: Point, size: number): Point;

  /**
   * The cells a footprint covers. A strategy with no cells (gridless) returns
   * an empty array.
   */
  cellsUnder(footprint: Footprint): Cell[];

  /**
   * Feet moved along a path of centre points, in order. Path-dependent on
   * purpose: PF2e's diagonals are counted along the route, not between the
   * endpoints (`docs/grid.md`). Fewer than two points is 0.
   */
  pathDistance(path: readonly Point[]): number;

  /**
   * Feet between two footprints, measured to the **nearest occupied square**
   * of each, so two adjacent Medium creatures are one square apart, and a
   * Large creature is measured from the edge nearest the other.
   */
  distanceBetween(a: Footprint, b: Footprint): number;

  /**
   * Every cell within `radiusFeet` of `origin`, by the grid's own distance
   * rule (the same one `distanceBetween` uses) -- a burst area template. A
   * strategy with no cells (gridless) returns an empty array; the client draws
   * the circle directly from `radiusFeet` instead.
   */
  burst(origin: Point, radiusFeet: number): Cell[];

  /**
   * Every cell within `radiusFeet` of `footprint`'s **nearest edge** -- an
   * emanation area template, which always includes the footprint's own cells
   * (`radiusFeet` of 0 returns exactly `cellsUnder(footprint)`). A strategy
   * with no cells (gridless) returns an empty array.
   */
  emanation(footprint: Footprint, radiusFeet: number): Cell[];
}
