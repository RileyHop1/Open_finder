import { sceneGridSchema, type Point } from '@hearthtable/core';
import { describeGridStrategy } from '@hearthtable/core/grid-contract';
import { describe, expect, it } from 'vitest';

import { footprintForSize, SquareGrid } from './squareGrid.js';

describeGridStrategy('SquareGrid', (grid) => new SquareGrid(grid));

/** Cell centres on the default 100px grid: cell (col, row) is centred on (100c + 50, 100r + 50). */
function cell(col: number, row: number): Point {
  return { x: col * 100 + 50, y: row * 100 + 50 };
}

describe('SquareGrid', () => {
  const grid = new SquareGrid(sceneGridSchema.parse({}));

  describe('pathDistance: the alternating diagonal rule', () => {
    it('counts 1, 2, 3, and 4 diagonal steps as 5, 15, 20, and 30 feet', () => {
      const along = (steps: number) =>
        grid.pathDistance(Array.from({ length: steps + 1 }, (_, i) => cell(i, i)));
      expect([1, 2, 3, 4].map(along)).toEqual([5, 15, 20, 30]);
    });

    it('keeps alternating: 5 and 6 diagonal steps are 35 and 45 feet', () => {
      const along = (steps: number) =>
        grid.pathDistance(Array.from({ length: steps + 1 }, (_, i) => cell(i, i)));
      expect([5, 6].map(along)).toEqual([35, 45]);
    });

    it('counts every orthogonal step as 5 feet', () => {
      expect(grid.pathDistance([cell(0, 0), cell(4, 0)])).toBe(20);
      expect(grid.pathDistance([cell(0, 0), cell(0, 3)])).toBe(15);
    });

    it('mixes diagonals and straights: 3 across and 1 down is one diagonal and two straights', () => {
      expect(grid.pathDistance([cell(0, 0), cell(3, 1)])).toBe(15);
      // 3 across, 2 down: two diagonals (15) and a straight (5).
      expect(grid.pathDistance([cell(0, 0), cell(3, 2)])).toBe(20);
    });

    it('carries the diagonal count across segments of one path', () => {
      // Two separate diagonal steps are the 1st and 2nd diagonal: 5 + 10, not 5 + 5.
      expect(grid.pathDistance([cell(0, 0), cell(1, 1), cell(2, 2)])).toBe(15);
    });

    it('is path-dependent: two orthogonal steps are cheaper than the two-square diagonal', () => {
      expect(grid.pathDistance([cell(0, 0), cell(1, 0), cell(1, 1)])).toBe(10);
      expect(grid.pathDistance([cell(0, 0), cell(1, 1)])).toBe(5);
      expect(grid.pathDistance([cell(0, 0), cell(2, 2)])).toBe(15);
    });

    it('reads a point that has not snapped yet as its nearest square', () => {
      expect(
        grid.pathDistance([
          { x: 62, y: 41 },
          { x: 238, y: 53 },
        ]),
      ).toBe(10);
    });

    it('does not move when the path does not', () => {
      expect(grid.pathDistance([cell(2, 2), cell(2, 2)])).toBe(0);
    });

    it('scales by the scene: 70px = 10ft makes four diagonals 60 feet', () => {
      const other = new SquareGrid(sceneGridSchema.parse({ size: 70, distance: 10 }));
      const at = (i: number): Point => ({ x: i * 70 + 35, y: i * 70 + 35 });
      expect(other.pathDistance([at(0), at(1), at(2), at(3), at(4)])).toBe(60);
    });
  });

  describe('snap and cellsUnder', () => {
    it('centres a one-square token on a cell', () => {
      expect(grid.snap({ x: 130, y: 170 }, 1)).toEqual({ x: 150, y: 150 });
    });

    it('centres a two-square token on a grid intersection', () => {
      expect(grid.snap({ x: 130, y: 170 }, 2)).toEqual({ x: 100, y: 200 });
    });

    it('centres a three-square token on a cell and a four-square one on an intersection', () => {
      expect(grid.snap({ x: 130, y: 170 }, 3)).toEqual({ x: 150, y: 150 });
      expect(grid.snap({ x: 130, y: 170 }, 4)).toEqual({ x: 100, y: 200 });
    });

    it("lines the grid up with the scene's offset", () => {
      const shifted = new SquareGrid(sceneGridSchema.parse({ offsetX: 30, offsetY: 0 }));
      expect(shifted.snap({ x: 100, y: 120 }, 1)).toEqual({ x: 80, y: 150 });
    });

    it('lists the squares a token covers', () => {
      expect(grid.cellsUnder({ center: cell(3, 4), size: 1 })).toEqual([
        { col: 3, row: 4 },
      ]);
      expect(grid.cellsUnder({ center: { x: 200, y: 200 }, size: 2 })).toEqual([
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
      ]);
    });
  });

  describe('distanceBetween', () => {
    /** A token whose top-left square is (col, row), so no rounding is involved in placing it. */
    const at = (col: number, row: number, size = 1) => ({
      center: { x: (col + size / 2) * 100, y: (row + size / 2) * 100 },
      size,
    });

    it('puts neighbouring squares 5 feet apart, diagonals included', () => {
      expect(grid.distanceBetween(at(0, 0), at(1, 0))).toBe(5);
      expect(grid.distanceBetween(at(0, 0), at(0, 1))).toBe(5);
      expect(grid.distanceBetween(at(0, 0), at(1, 1))).toBe(5);
    });

    it('counts the alternating rule between two tokens', () => {
      expect(grid.distanceBetween(at(0, 0), at(2, 2))).toBe(15);
      expect(grid.distanceBetween(at(0, 0), at(4, 4))).toBe(30);
      expect(grid.distanceBetween(at(0, 0), at(3, 1))).toBe(15);
    });

    it('puts two tokens in the same square 0 apart, as Tiny creatures may be', () => {
      expect(grid.distanceBetween(at(5, 5), at(5, 5))).toBe(0);
    });

    it('measures a Large token to its nearest square, not its centre', () => {
      // A 2x2 token on squares (0,0)-(1,1): a Medium token at column 2 is adjacent, at column 3 two away.
      const large = at(0, 0, 2);
      expect(grid.cellsUnder(large).map((c) => `${c.col},${c.row}`)).toEqual([
        '0,0',
        '1,0',
        '0,1',
        '1,1',
      ]);
      expect(grid.distanceBetween(large, at(2, 0))).toBe(5);
      expect(grid.distanceBetween(large, at(2, 1))).toBe(5);
      expect(grid.distanceBetween(large, at(3, 0))).toBe(10);
      // Diagonally: from the corner square (1,1) to (3,3) is two diagonals.
      expect(grid.distanceBetween(large, at(3, 3))).toBe(15);
    });

    it('measures a Gargantuan token from its nearest edge, from several sides', () => {
      const huge = at(2, 2, 4);
      expect(grid.distanceBetween(huge, at(6, 3))).toBe(5);
      expect(grid.distanceBetween(huge, at(1, 3))).toBe(5);
      expect(grid.distanceBetween(huge, at(3, 7))).toBe(10);
      expect(grid.distanceBetween(huge, at(7, 7))).toBe(15);
    });

    it('is 0 when a Large token covers the same square as a smaller one', () => {
      expect(grid.distanceBetween(at(0, 0, 2), at(1, 1))).toBe(0);
    });

    it('measures two Large tokens edge to edge', () => {
      expect(grid.distanceBetween(at(0, 0, 2), at(2, 0, 2))).toBe(5);
      expect(grid.distanceBetween(at(0, 0, 2), at(4, 0, 2))).toBe(15);
    });
  });
});

describe('footprintForSize', () => {
  it('gives Tiny, Small, and Medium one square, and Large through Gargantuan 2, 3, and 4', () => {
    expect(
      (['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const).map(
        footprintForSize,
      ),
    ).toEqual([1, 1, 1, 2, 3, 4]);
  });
});
