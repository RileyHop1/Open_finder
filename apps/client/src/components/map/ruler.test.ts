import { GridlessGrid, sceneGridSchema } from '@hearthtable/core';
import { SquareGrid } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { rulerFeet, rulerPoint, tokenDistances } from './ruler.js';

const squares = new SquareGrid(sceneGridSchema.parse({ size: 100, distance: 5 }));
const free = new GridlessGrid(
  sceneGridSchema.parse({ type: 'none', size: 100, distance: 5 }),
);
const scene = { width: 2000, height: 1000 };

describe('rulerPoint', () => {
  it('lands on the centre of the cell clicked', () => {
    expect(rulerPoint(squares, scene, { x: 130, y: 260 })).toEqual({ x: 150, y: 250 });
  });

  it('stays on the scene', () => {
    expect(rulerPoint(squares, scene, { x: -40, y: 5000 })).toEqual({ x: 50, y: 950 });
    expect(rulerPoint(free, scene, { x: -40, y: 5000 })).toEqual({ x: 0, y: 1000 });
  });

  it('is exactly where you click on a gridless scene', () => {
    expect(rulerPoint(free, scene, { x: 133, y: 261 })).toEqual({ x: 133, y: 261 });
  });
});

describe('rulerFeet', () => {
  it('counts squares, with PF2e diagonals along the route', () => {
    const start = { x: 50, y: 50 };
    expect(rulerFeet(squares, [start], { x: 350, y: 50 })).toBe(15);
    // Two diagonal steps are 5 + 10 feet; three are 20.
    expect(rulerFeet(squares, [start], { x: 250, y: 250 })).toBe(15);
    expect(rulerFeet(squares, [start], { x: 350, y: 350 })).toBe(20);
  });

  it('adds up the legs of a route through waypoints', () => {
    const route = [
      { x: 50, y: 50 },
      { x: 350, y: 50 },
    ];
    expect(rulerFeet(squares, route)).toBe(15);
    expect(rulerFeet(squares, route, { x: 350, y: 250 })).toBe(25);
  });

  it('is nothing for a single point', () => {
    expect(rulerFeet(squares, [{ x: 50, y: 50 }])).toBe(0);
    expect(rulerFeet(squares, [])).toBe(0);
  });

  it('is a straight line in feet on a gridless scene', () => {
    expect(rulerFeet(free, [{ x: 0, y: 0 }], { x: 300, y: 400 })).toBe(25);
  });
});

describe('tokenDistances', () => {
  const token = (id: string, x: number, y: number, size = 1) => ({ id, x, y, size });

  it('measures from the selected token to every other, in feet', () => {
    const tokens = [token('a', 50, 50), token('b', 350, 50), token('c', 150, 150)];
    expect(tokenDistances(squares, tokens, 'a')).toEqual({ b: 15, c: 5 });
  });

  it('measures a big creature from its nearest edge', () => {
    // A Large (2 x 2) token centred on (200, 200) covers squares 0-1; a Medium at (350, 50) is one square off its edge.
    const tokens = [token('big', 200, 200, 2), token('small', 350, 50)];
    expect(tokenDistances(squares, tokens, 'big').small).toBe(5);
    expect(tokenDistances(squares, tokens, 'small').big).toBe(5);
  });

  it('is empty when the token is not there', () => {
    expect(tokenDistances(squares, [token('a', 50, 50)], 'missing')).toEqual({});
  });

  it('is empty for a lone token', () => {
    expect(tokenDistances(squares, [token('a', 50, 50)], 'a')).toEqual({});
  });
});
