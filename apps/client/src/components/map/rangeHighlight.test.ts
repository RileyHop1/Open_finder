import { sceneGridSchema } from '@hearthtable/core';
import { SquareGrid } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { cellsInRange } from './rangeHighlight.js';

/** 100px cells, 5ft each, no offset: a token centred on cell (2, 2) sits at (250, 250). */
const grid = new SquareGrid(sceneGridSchema.parse({}));
const origin = { x: 250, y: 250 };

describe('cellsInRange', () => {
  it('highlights nothing for an unknown range (a ranged NPC strike)', () => {
    expect(cellsInRange(grid, origin, 1, { ranged: true, feet: undefined })).toEqual([]);
  });

  it('threatens like reach for a melee strike, including the token’s own cell', () => {
    const cells = cellsInRange(grid, origin, 1, { ranged: false, feet: 5 });
    expect(cells).toContainEqual({ col: 2, row: 2 });
    // One square of reach around a Medium token: 3x3, corners included (square distance).
    expect(cells).toHaveLength(9);
  });

  it('bursts around the token’s centre for a ranged strike', () => {
    const cells = cellsInRange(grid, origin, 1, { ranged: true, feet: 10 });
    expect(cells.length).toBeGreaterThan(9);
    expect(cells).toContainEqual({ col: 2, row: 2 });
  });

  it('a reach weapon’s extra 5 feet reaches one more ring out', () => {
    const natural = cellsInRange(grid, origin, 1, { ranged: false, feet: 5 });
    const reach = cellsInRange(grid, origin, 1, { ranged: false, feet: 10 });
    expect(reach.length).toBeGreaterThan(natural.length);
  });
});
