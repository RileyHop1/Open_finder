/**
 * The contract every GridStrategy must satisfy -- `docs/grid.md`, Testing:
 * "every test runs against the interface, not `SquareGrid` directly, so a hex
 * implementation inherits the suite." Call `describeGridStrategy` from a
 * strategy's own test file; it checks only what must hold for *any* grid
 * (symmetry, idempotent snapping, one cell apart is one cell of feet), and
 * leaves a strategy's own rules (the 1-2-1 diagonal) to its own tests. It
 * deliberately does not assert the triangle inequality: PF2e's diagonals make
 * two orthogonal steps (10 ft) cheaper than a two-square diagonal (15 ft), so a
 * waypoint can shorten a path.
 *
 * Not exported from the package entry point, because it imports Vitest; use
 * `@hearthtable/core/grid-contract`.
 */

import { describe, expect, it } from 'vitest';

import { sceneGridSchema, type SceneGrid } from '../scene.js';
import type { Footprint, GridStrategy, Point } from './gridStrategy.js';

/** Two scales, so a strategy that quietly assumes 100px and 5ft fails. */
const GRIDS: readonly SceneGrid[] = [
  sceneGridSchema.parse({}),
  sceneGridSchema.parse({ size: 70, distance: 10 }),
];

/** Fixed pseudo-random points, so a failure is reproducible. */
function points(grid: SceneGrid): Point[] {
  const list: Point[] = [];
  let seed = 7;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < 25; i++) {
    list.push({ x: next() * 20 * grid.size, y: next() * 20 * grid.size });
  }
  return list;
}

/** Runs the shared suite against the strategy `make` builds for a grid. */
export function describeGridStrategy(
  name: string,
  make: (grid: SceneGrid) => GridStrategy,
): void {
  describe(`${name} satisfies the GridStrategy contract`, () => {
    for (const grid of GRIDS) {
      const label = `${grid.size}px = ${grid.distance}ft`;
      const strategy = make(grid);
      const sample = points(grid);

      describe(label, () => {
        it('reports the grid it measures with', () => {
          expect(strategy.grid).toEqual(grid);
        });

        it('has no distance for no path or a single point', () => {
          expect(strategy.pathDistance([])).toBe(0);
          expect(strategy.pathDistance([{ x: 150, y: 250 }])).toBe(0);
        });

        it('measures a path the same forwards and backwards, and never negative', () => {
          const path = sample.slice(0, 6);
          const forward = strategy.pathDistance(path);
          expect(forward).toBeGreaterThanOrEqual(0);
          expect(strategy.pathDistance([...path].reverse())).toBeCloseTo(forward, 6);
        });

        it('snaps idempotently, and never by more than a cell', () => {
          for (const size of [1, 2, 3, 4]) {
            for (const point of sample) {
              const once = strategy.snap(point, size);
              const twice = strategy.snap(once, size);
              expect(twice.x).toBeCloseTo(once.x, 6);
              expect(twice.y).toBeCloseTo(once.y, 6);
              expect(Math.abs(once.x - point.x)).toBeLessThanOrEqual(grid.size);
              expect(Math.abs(once.y - point.y)).toBeLessThanOrEqual(grid.size);
            }
          }
        });

        it('covers either no cells or exactly size x size of them', () => {
          for (const size of [1, 2, 3, 4]) {
            const cells = strategy.cellsUnder({
              center: strategy.snap({ x: 500, y: 500 }, size),
              size,
            });
            expect([0, size * size]).toContain(cells.length);
            expect(new Set(cells.map((c) => `${c.col},${c.row}`)).size).toBe(
              cells.length,
            );
          }
        });

        it('puts a footprint zero feet from itself and measures symmetrically', () => {
          const a: Footprint = {
            center: strategy.snap(sample[0] ?? { x: 0, y: 0 }, 2),
            size: 2,
          };
          const b: Footprint = {
            center: strategy.snap(sample[1] ?? { x: 0, y: 0 }, 1),
            size: 1,
          };
          expect(strategy.distanceBetween(a, a)).toBe(0);
          expect(strategy.distanceBetween(a, b)).toBeCloseTo(
            strategy.distanceBetween(b, a),
            6,
          );
          expect(strategy.distanceBetween(a, b)).toBeGreaterThanOrEqual(0);
        });

        it('puts two neighbouring one-square tokens one cell of feet apart', () => {
          const a: Footprint = { center: strategy.snap({ x: 500, y: 500 }, 1), size: 1 };
          const east: Footprint = {
            center: { x: a.center.x + grid.size, y: a.center.y },
            size: 1,
          };
          const south: Footprint = {
            center: { x: a.center.x, y: a.center.y + grid.size },
            size: 1,
          };
          expect(strategy.distanceBetween(a, east)).toBeCloseTo(grid.distance, 6);
          expect(strategy.distanceBetween(a, south)).toBeCloseTo(grid.distance, 6);
        });

        it('measures a large token from its nearest edge, not its centre', () => {
          const large: Footprint = {
            center: strategy.snap({ x: 500, y: 500 }, 2),
            size: 2,
          };
          const near: Footprint = {
            center: {
              x: large.center.x + 1.5 * grid.size,
              y: large.center.y - 0.5 * grid.size,
            },
            size: 1,
          };
          // Adjacent to the large token's east edge: one cell, not two.
          expect(strategy.distanceBetween(large, near)).toBeCloseTo(grid.distance, 6);
        });

        it("has an emanation at radius 0 that is exactly the footprint's own cells", () => {
          for (const size of [1, 2]) {
            const footprint: Footprint = {
              center: strategy.snap({ x: 500, y: 500 }, size),
              size,
            };
            const own = strategy.cellsUnder(footprint);
            const emanation = strategy.emanation(footprint, 0);
            expect(new Set(emanation.map((c) => `${c.col},${c.row}`))).toEqual(
              new Set(own.map((c) => `${c.col},${c.row}`)),
            );
          }
        });

        it("has a burst at radius 0 that is exactly the origin's own cell", () => {
          const origin = strategy.snap({ x: 500, y: 500 }, 1);
          const burst = strategy.burst(origin, 0);
          const own = strategy.cellsUnder({ center: origin, size: 1 });
          expect(new Set(burst.map((c) => `${c.col},${c.row}`))).toEqual(
            new Set(own.map((c) => `${c.col},${c.row}`)),
          );
        });

        it('never loses a cell when the radius grows: burst and emanation are monotonic', () => {
          const origin = strategy.snap({ x: 500, y: 500 }, 1);
          const footprint: Footprint = { center: origin, size: 1 };
          const smallerBurst = new Set(
            strategy.burst(origin, grid.distance).map((c) => `${c.col},${c.row}`),
          );
          const largerBurst = new Set(
            strategy.burst(origin, grid.distance * 3).map((c) => `${c.col},${c.row}`),
          );
          for (const key of smallerBurst) {
            expect(largerBurst.has(key)).toBe(true);
          }

          const smallerEmanation = new Set(
            strategy.emanation(footprint, grid.distance).map((c) => `${c.col},${c.row}`),
          );
          const largerEmanation = new Set(
            strategy
              .emanation(footprint, grid.distance * 3)
              .map((c) => `${c.col},${c.row}`),
          );
          for (const key of smallerEmanation) {
            expect(largerEmanation.has(key)).toBe(true);
          }
        });

        it('returns real, addressable cells: each is covered by cellsUnder of a footprint centred the same way', () => {
          const origin = strategy.snap({ x: 500, y: 500 }, 1);
          for (const cell of strategy.burst(origin, grid.distance * 2)) {
            const centred = strategy.snap(
              {
                x: grid.offsetX + (cell.col + 0.5) * grid.size,
                y: grid.offsetY + (cell.row + 0.5) * grid.size,
              },
              1,
            );
            expect(strategy.cellsUnder({ center: centred, size: 1 })).toEqual([cell]);
          }
        });

        it('never loses a cell when a line grows longer or wider', () => {
          const from = { x: 500, y: 500 };
          const shortNarrow = new Set(
            strategy
              .line(from, { x: from.x + grid.size * 2, y: from.y }, grid.distance)
              .map((c) => `${c.col},${c.row}`),
          );
          const longWide = new Set(
            strategy
              .line(from, { x: from.x + grid.size * 6, y: from.y }, grid.distance * 3)
              .map((c) => `${c.col},${c.row}`),
          );
          for (const key of shortNarrow) {
            expect(longWide.has(key)).toBe(true);
          }
        });

        it('never loses a cell when a cone grows longer, and stays inside a burst of the same length', () => {
          const origin = strategy.snap({ x: 500, y: 500 }, 1);
          const towards = { x: origin.x + grid.size, y: origin.y };
          const shorter = new Set(
            strategy
              .cone(origin, towards, grid.distance * 2)
              .map((c) => `${c.col},${c.row}`),
          );
          const longer = new Set(
            strategy
              .cone(origin, towards, grid.distance * 5)
              .map((c) => `${c.col},${c.row}`),
          );
          for (const key of shorter) {
            expect(longer.has(key)).toBe(true);
          }

          const burst = new Set(
            strategy.burst(origin, grid.distance * 5).map((c) => `${c.col},${c.row}`),
          );
          for (const key of longer) {
            expect(burst.has(key)).toBe(true);
          }
        });
      });
    }
  });
}
