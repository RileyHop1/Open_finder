import { sceneGridSchema } from '@hearthtable/core';
import { SquareGrid } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { cellsFor } from './templateCells.js';

/** 100px cells, 5ft each, no offset: a token centred on cell (2, 2) sits at (250, 250). */
const grid = new SquareGrid(sceneGridSchema.parse({}));

describe('cellsFor', () => {
  it('a burst covers a 3x3 around its origin at 5 feet', () => {
    const cells = cellsFor(
      grid,
      { shape: 'burst', x: 250, y: 250, feet: 5, widthFeet: 5 },
      [],
    );
    expect(cells).toContainEqual({ col: 2, row: 2 });
    expect(cells).toHaveLength(9);
  });

  it('a cone points from its origin toward the aim point', () => {
    const cells = cellsFor(
      grid,
      { shape: 'cone', x: 250, y: 250, toX: 450, toY: 250, feet: 15, widthFeet: 5 },
      [],
    );
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((c) => c.col >= 2)).toBe(true);
  });

  it('a line runs from its origin to its aim point at the given width', () => {
    const cells = cellsFor(
      grid,
      { shape: 'line', x: 250, y: 250, toX: 550, toY: 250, feet: 15, widthFeet: 5 },
      [],
    );
    expect(cells).toContainEqual({ col: 4, row: 2 });
  });

  it('an emanation covers its source token plus a ring at 0 feet', () => {
    const tokens = [{ id: 'tok-1', x: 250, y: 250, size: 1 }];
    const cells = cellsFor(
      grid,
      { shape: 'emanation', x: 250, y: 250, feet: 0, widthFeet: 5, tokenId: 'tok-1' },
      tokens,
    );
    expect(cells).toEqual([{ col: 2, row: 2 }]);
  });

  it('an emanation with no findable source token highlights nothing', () => {
    const cells = cellsFor(
      grid,
      { shape: 'emanation', x: 250, y: 250, feet: 10, widthFeet: 5, tokenId: 'missing' },
      [],
    );
    expect(cells).toEqual([]);
  });
});
