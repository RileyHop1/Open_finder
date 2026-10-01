import { describe, expect, it } from 'vitest';

import { sceneGridSchema } from '../scene.js';
import { describeGridStrategy } from './contract.js';
import { GridlessGrid } from './gridless.js';

describeGridStrategy('GridlessGrid', (grid) => new GridlessGrid(grid));

const grid = sceneGridSchema.parse({ type: 'none', size: 100, distance: 5 });

describe('GridlessGrid', () => {
  const gridless = new GridlessGrid(grid);

  it('does not snap', () => {
    expect(gridless.snap({ x: 123.4, y: 567.8 })).toEqual({ x: 123.4, y: 567.8 });
  });

  it('has no cells', () => {
    expect(gridless.cellsUnder()).toEqual([]);
  });

  it('measures a straight line in feet, scaled by pixels per foot', () => {
    // 300px is three cells, 15 feet; 100 x 100 px is one cell across and down.
    expect(
      gridless.pathDistance([
        { x: 0, y: 0 },
        { x: 300, y: 0 },
      ]),
    ).toBeCloseTo(15, 9);
    expect(
      gridless.pathDistance([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]),
    ).toBeCloseTo(5 * Math.SQRT2, 9);
  });

  it('does not apply the 1-2-1 diagonal rule: a diagonal costs its straight length', () => {
    // Two diagonal squares would be 15 ft on the PF2e square grid; here it is 14.14.
    expect(
      gridless.pathDistance([
        { x: 0, y: 0 },
        { x: 200, y: 200 },
      ]),
    ).toBeCloseTo(10 * Math.SQRT2, 9);
  });

  it('adds up the segments of a path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ];
    expect(gridless.pathDistance(path)).toBeCloseTo(15, 9);
  });

  it('scales with the grid: 70px = 10ft makes 140px 20ft', () => {
    const other = new GridlessGrid(sceneGridSchema.parse({ size: 70, distance: 10 }));
    expect(
      other.pathDistance([
        { x: 0, y: 0 },
        { x: 140, y: 0 },
      ]),
    ).toBeCloseTo(20, 9);
  });

  describe('distanceBetween', () => {
    it('is centre to centre for two one-square tokens', () => {
      const a = { center: { x: 50, y: 50 }, size: 1 };
      const b = { center: { x: 350, y: 50 }, size: 1 };
      expect(gridless.distanceBetween(a, b)).toBeCloseTo(15, 9);
    });

    it('measures a diagonal gap by straight line', () => {
      const a = { center: { x: 50, y: 50 }, size: 1 };
      const b = { center: { x: 250, y: 250 }, size: 1 };
      expect(gridless.distanceBetween(a, b)).toBeCloseTo(10 * Math.SQRT2, 9);
    });

    it('measures a Large token from its nearest occupied square', () => {
      // A 2x2 token centred on (200, 200) occupies square centres 150 and 250.
      const large = { center: { x: 200, y: 200 }, size: 2 };
      // The squares along its east edge are at x = 250; a token at x = 450 is two cells away.
      const east = { center: { x: 450, y: 250 }, size: 1 };
      expect(gridless.distanceBetween(large, east)).toBeCloseTo(10, 9);
      // Directly beside it is one cell.
      const beside = { center: { x: 350, y: 250 }, size: 1 };
      expect(gridless.distanceBetween(large, beside)).toBeCloseTo(5, 9);
    });

    it('is zero when two tokens share a square, as Tiny creatures may', () => {
      const a = { center: { x: 250, y: 250 }, size: 1 };
      expect(gridless.distanceBetween(a, { ...a })).toBe(0);
    });

    it('is zero when a Large token overlaps a one-square token', () => {
      const large = { center: { x: 200, y: 200 }, size: 2 };
      const inside = { center: { x: 150, y: 250 }, size: 1 };
      expect(gridless.distanceBetween(large, inside)).toBe(0);
    });
  });
});
