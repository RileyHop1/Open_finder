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

describe('burst', () => {
  const grid = new SquareGrid(sceneGridSchema.parse({}));

  function cellsOf(result: ReturnType<typeof grid.burst>): Set<string> {
    return new Set(result.map((c) => `${c.col},${c.row}`));
  }

  it('at 5 feet is the origin and its eight neighbours -- every adjacent square is one diagonal', () => {
    const result = cellsOf(grid.burst(cell(5, 5), 5));
    expect(result.size).toBe(9);
    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        expect(result.has(`${5 + dc},${5 + dr}`)).toBe(true);
      }
    }
    expect(result.has('7,5')).toBe(false);
  });

  it('at 10 feet reaches two squares straight, and the two-one diagonal, but not two-two', () => {
    const result = cellsOf(grid.burst(cell(5, 5), 10));
    expect(result.size).toBe(21);
    expect(result.has('7,5')).toBe(true); // two squares straight: 10ft
    expect(result.has('7,6')).toBe(true); // two straight, one diagonal: 10ft
    expect(result.has('7,7')).toBe(false); // two-square diagonal: 15ft
  });

  it('at 15 feet includes the two-square diagonal and three squares straight', () => {
    const result = cellsOf(grid.burst(cell(5, 5), 15));
    expect(result.has('7,7')).toBe(true); // two-square diagonal: 15ft
    expect(result.has('8,5')).toBe(true); // three squares straight: 15ft
    expect(result.has('8,8')).toBe(false); // three-square diagonal: 20ft
  });

  it('matches distanceBetween: every returned cell is that close or closer, every excluded cell is farther', () => {
    const origin = cell(5, 5);
    const originFootprint = { center: origin, size: 1 };
    const radius = 20;
    const result = cellsOf(grid.burst(origin, radius));
    for (let dc = -5; dc <= 5; dc += 1) {
      for (let dr = -5; dr <= 5; dr += 1) {
        const target = { center: cell(5 + dc, 5 + dr), size: 1 };
        const feet = grid.distanceBetween(originFootprint, target);
        const included = result.has(`${5 + dc},${5 + dr}`);
        expect(included).toBe(feet <= radius);
      }
    }
  });

  it('is empty for a negative radius (no cell can be at a negative distance)', () => {
    expect(grid.burst(cell(0, 0), -5)).toEqual([]);
  });
});

describe('emanation', () => {
  const grid = new SquareGrid(sceneGridSchema.parse({}));

  function cellsOf(result: ReturnType<typeof grid.emanation>): Set<string> {
    return new Set(result.map((c) => `${c.col},${c.row}`));
  }

  it('at radius 0 is exactly the footprint’s own cells', () => {
    const footprint = { center: cell(5, 5), size: 1 };
    expect(cellsOf(grid.emanation(footprint, 0))).toEqual(new Set(['5,5']));
  });

  it('from a Large (2x2) footprint reaches one square past each edge at 5 feet', () => {
    // A 2x2 footprint centred on the intersection at (5,5)/(6,6) covers cols/rows 5-6.
    const footprint = { center: { x: 600, y: 600 }, size: 2 };
    const own = grid.cellsUnder(footprint);
    expect(own.map((c) => `${c.col},${c.row}`).sort()).toEqual(
      ['5,5', '5,6', '6,5', '6,6'].sort(),
    );
    const result = cellsOf(grid.emanation(footprint, 5));
    expect(result.has('7,5')).toBe(true); // one square east of the footprint
    expect(result.has('4,6')).toBe(true); // one square west
    expect(result.has('7,7')).toBe(true); // the diagonal corner, one square out
    expect(result.has('8,5')).toBe(false); // two squares out: too far at 5ft
  });

  it('is a superset of the footprint’s own cells at any positive radius', () => {
    const footprint = { center: { x: 600, y: 600 }, size: 2 };
    const own = new Set(grid.cellsUnder(footprint).map((c) => `${c.col},${c.row}`));
    const result = cellsOf(grid.emanation(footprint, 10));
    for (const key of own) {
      expect(result.has(key)).toBe(true);
    }
  });

  it('matches distanceBetween against the footprint, the same way burst matches it against a point', () => {
    const footprint = { center: cell(5, 5), size: 1 };
    const radius = 15;
    const result = cellsOf(grid.emanation(footprint, radius));
    for (let dc = -4; dc <= 4; dc += 1) {
      for (let dr = -4; dr <= 4; dr += 1) {
        const target = { center: cell(5 + dc, 5 + dr), size: 1 };
        const feet = grid.distanceBetween(footprint, target);
        expect(result.has(`${5 + dc},${5 + dr}`)).toBe(feet <= radius);
      }
    }
  });
});
