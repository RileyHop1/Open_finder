import { sceneGridSchema, type Footprint, type Point } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { flanks, onOppositeSides } from './flanking.js';
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
const ally = (col: number, row: number, reachFeet = 5) => ({
  footprint: token(col, row),
  reachFeet,
});

describe('onOppositeSides', () => {
  const target = cell(5, 5);

  it('is true for two points straight across the target', () => {
    expect(onOppositeSides(target, cell(5, 4), cell(5, 6))).toBe(true);
    expect(onOppositeSides(target, cell(4, 5), cell(6, 5))).toBe(true);
    expect(onOppositeSides(target, cell(4, 4), cell(6, 6))).toBe(true);
    expect(onOppositeSides(target, cell(6, 4), cell(4, 6))).toBe(true);
  });

  it('is false for two points on the same side', () => {
    expect(onOppositeSides(target, cell(5, 4), cell(4, 4))).toBe(false);
    expect(onOppositeSides(target, cell(5, 4), cell(5, 3))).toBe(false);
  });

  it('is false at a right angle, and at 45 degrees off the straight line', () => {
    expect(onOppositeSides(target, cell(5, 4), cell(6, 5))).toBe(false);
    expect(onOppositeSides(target, cell(5, 4), cell(6, 6))).toBe(false);
  });

  it('allows a little slack off the straight line, from farther out', () => {
    // From the north, 3 squares south and 1 across: about 18 degrees off.
    expect(onOppositeSides(target, cell(5, 4), cell(6, 8))).toBe(true);
    // 2 south and 1 across: about 27 degrees off, past the tolerance.
    expect(onOppositeSides(target, cell(5, 4), cell(6, 7))).toBe(false);
  });

  it('is symmetric: swapping the two points gives the same answer', () => {
    for (const [a, b] of [
      [cell(5, 4), cell(5, 6)],
      [cell(5, 4), cell(6, 8)],
      [cell(5, 4), cell(6, 7)],
      [cell(5, 4), cell(4, 4)],
    ] as const) {
      expect(onOppositeSides(target, a, b)).toBe(onOppositeSides(target, b, a));
    }
  });

  it('has no side for a point on the target’s centre', () => {
    expect(onOppositeSides(target, target, cell(5, 6))).toBe(false);
    expect(onOppositeSides(target, cell(5, 4), target)).toBe(false);
  });
});

describe('flanks', () => {
  const target = token(5, 5);

  it('two adjacent allies on opposite sides flank, in every direction', () => {
    expect(flanks(grid, target, ally(5, 4), ally(5, 6))).toBe(true);
    expect(flanks(grid, target, ally(4, 5), ally(6, 5))).toBe(true);
    expect(flanks(grid, target, ally(4, 4), ally(6, 6))).toBe(true);
    expect(flanks(grid, target, ally(6, 4), ally(4, 6))).toBe(true);
  });

  it('two allies on the same side do not', () => {
    expect(flanks(grid, target, ally(5, 4), ally(4, 4))).toBe(false);
    expect(flanks(grid, target, ally(4, 4), ally(6, 4))).toBe(false);
  });

  it('an ally that is opposite but out of reach does not count', () => {
    expect(flanks(grid, target, ally(5, 4), ally(5, 7))).toBe(false);
  });

  it('a reach weapon lets a non-adjacent ally flank', () => {
    expect(flanks(grid, target, ally(5, 4), ally(5, 7, 10))).toBe(true);
  });

  it('an ally that does not threaten the target does not count, even if opposite', () => {
    expect(flanks(grid, target, ally(5, 3), ally(5, 6))).toBe(false);
  });

  it('is symmetric in the two allies', () => {
    const cases: [ReturnType<typeof ally>, ReturnType<typeof ally>][] = [
      [ally(5, 4), ally(5, 6)],
      [ally(5, 4), ally(4, 4)],
      [ally(5, 4), ally(5, 7, 10)],
      [ally(5, 3), ally(5, 6)],
    ];
    for (const [a, b] of cases) {
      expect(flanks(grid, target, a, b)).toBe(flanks(grid, target, b, a));
    }
  });

  it('a creature does not flank with itself', () => {
    expect(flanks(grid, target, ally(5, 4), ally(5, 4))).toBe(false);
  });

  it('flanks a Large target from opposite sides of its centre', () => {
    const large: Footprint = { center: { x: 600, y: 600 }, size: 2 }; // cols 5-6, rows 5-6
    expect(flanks(grid, large, ally(4, 5), ally(7, 6))).toBe(true);
  });
});
