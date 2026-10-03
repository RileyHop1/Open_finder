import { sceneGridSchema, type Footprint, type Point } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { meleeReach, naturalReach, threatenedCells, threatens } from './reach.js';
import { SquareGrid } from './squareGrid.js';

const grid = new SquareGrid(sceneGridSchema.parse({}));
const cell = (col: number, row: number): Point => ({
  x: col * 100 + 50,
  y: row * 100 + 50,
});
const token = (col: number, row: number): Footprint => ({
  center: cell(col, row),
  size: 1,
});

describe('naturalReach', () => {
  it('is 5 feet for Medium or smaller, then 10, 15, and 20', () => {
    expect(
      (['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const).map(
        naturalReach,
      ),
    ).toEqual([5, 5, 5, 10, 15, 20]);
  });
});

describe('meleeReach', () => {
  it('adds 5 feet for the reach trait to the creature’s own reach', () => {
    expect(meleeReach('medium', false)).toBe(5);
    expect(meleeReach('medium', true)).toBe(10);
  });

  it('is 15 for a Large creature with a reach weapon, never a flat 10', () => {
    expect(meleeReach('large', false)).toBe(10);
    expect(meleeReach('large', true)).toBe(15);
    expect(meleeReach('huge', true)).toBe(20);
  });
});

describe('threatenedCells', () => {
  it('is a 5-foot reach: the cell and its eight neighbours', () => {
    expect(threatenedCells(grid, token(5, 5), 5)).toHaveLength(9);
  });
});

describe('threatens', () => {
  it('threatens an adjacent target at 5 feet, and not one two squares away', () => {
    expect(threatens(grid, token(5, 5), 5, token(6, 5))).toBe(true);
    expect(threatens(grid, token(5, 5), 5, token(7, 5))).toBe(false);
  });

  it('reaches two squares with a 10-foot reach, but not three', () => {
    expect(threatens(grid, token(5, 5), 10, token(7, 5))).toBe(true);
    expect(threatens(grid, token(5, 5), 10, token(8, 5))).toBe(false);
  });

  it('threatens a Large target that is only partly in reach', () => {
    const large: Footprint = { center: { x: 700, y: 550 }, size: 2 }; // cols 6-7, rows 4-5
    expect(threatens(grid, token(5, 5), 5, large)).toBe(true);
  });

  it('threatens nothing on a gridless scene, which has no cells', () => {
    const none = { cellsUnder: () => [], emanation: () => [] } as never;
    expect(threatens(none, token(5, 5), 5, token(6, 5))).toBe(false);
  });
});
