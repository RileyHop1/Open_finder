import { sceneGridSchema } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { gridForScene } from './mapGrid.js';
import { ARROW_DIRECTIONS, dragTarget, stepToken } from './tokenStep.js';

const scene = { width: 1000, height: 600 };
const square = gridForScene({ grid: sceneGridSchema.parse({}) });
const gridless = gridForScene({ grid: sceneGridSchema.parse({ type: 'none' }) });

describe('stepToken on the square grid', () => {
  const at = { x: 250, y: 250, size: 1 };

  it('moves one cell in each direction and measures it in feet', () => {
    expect(stepToken(square, scene, at, 'right')).toEqual({
      to: { x: 350, y: 250 },
      feet: 5,
    });
    expect(stepToken(square, scene, at, 'left')).toEqual({
      to: { x: 150, y: 250 },
      feet: 5,
    });
    expect(stepToken(square, scene, at, 'up')).toEqual({
      to: { x: 250, y: 150 },
      feet: 5,
    });
    expect(stepToken(square, scene, at, 'down')).toEqual({
      to: { x: 250, y: 350 },
      feet: 5,
    });
  });

  it('snaps a token that is off the grid before stepping', () => {
    expect(stepToken(square, scene, { x: 262, y: 238, size: 1 }, 'right')?.to).toEqual({
      x: 350,
      y: 250,
    });
  });

  it('keeps a two-square token on grid intersections', () => {
    expect(stepToken(square, scene, { x: 200, y: 200, size: 2 }, 'right')?.to).toEqual({
      x: 300,
      y: 200,
    });
  });

  it('refuses a step off the scene instead of clamping to somewhere off the grid', () => {
    expect(stepToken(square, scene, { x: 50, y: 250, size: 1 }, 'left')).toBeUndefined();
    expect(
      stepToken(square, scene, { x: 950, y: 250, size: 1 }, 'right'),
    ).toBeUndefined();
    expect(stepToken(square, scene, { x: 250, y: 50, size: 1 }, 'up')).toBeUndefined();
    expect(stepToken(square, scene, { x: 250, y: 550, size: 1 }, 'down')).toBeUndefined();
  });

  it('still steps to the last cell before the edge', () => {
    expect(stepToken(square, scene, { x: 150, y: 250, size: 1 }, 'left')?.to.x).toBe(50);
  });
});

describe('stepToken on a gridless scene', () => {
  it('steps by the nominal cell, with no snapping', () => {
    const step = stepToken(gridless, scene, { x: 262, y: 238, size: 1 }, 'right');
    expect(step?.to).toEqual({ x: 362, y: 238 });
    expect(step?.feet).toBeCloseTo(5, 9);
  });
});

describe('ARROW_DIRECTIONS', () => {
  it('maps exactly the four arrow keys', () => {
    expect(ARROW_DIRECTIONS).toEqual({
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    });
  });
});

describe('dragTarget', () => {
  const from = { x: 250, y: 250 };
  const drag = (pointer: { x: number; y: number }, grab = { x: 0, y: 0 }, size = 1) => ({
    pointer,
    grab,
    from,
    size,
  });

  it('snaps to the cell under the pointer and measures the move', () => {
    expect(dragTarget(square, scene, drag({ x: 462, y: 238 }))).toEqual({
      to: { x: 450, y: 250 },
      feet: 10,
    });
  });

  it('does not count a wobble inside the starting cell as a move', () => {
    expect(dragTarget(square, scene, drag({ x: 280, y: 215 }))).toEqual({
      to: { x: 250, y: 250 },
      feet: 0,
    });
  });

  it('keeps the grab point: holding a token by its edge does not move it', () => {
    // Grabbed 40 px right of centre; the pointer is 40 px right of the cell centre.
    expect(
      dragTarget(square, scene, drag({ x: 290, y: 250 }, { x: 40, y: 0 })).to,
    ).toEqual({
      x: 250,
      y: 250,
    });
  });

  it('counts diagonals the PF2e way', () => {
    // Two diagonal squares are 5 + 10 = 15 ft.
    expect(dragTarget(square, scene, drag({ x: 450, y: 450 })).feet).toBe(15);
  });

  it('keeps the token on the scene, as the server will', () => {
    expect(dragTarget(square, scene, drag({ x: -500, y: -500 })).to).toEqual({
      x: 0,
      y: 0,
    });
    expect(dragTarget(square, scene, drag({ x: 9000, y: 9000 })).to).toEqual({
      x: scene.width,
      y: scene.height,
    });
  });

  it('is freeform on a gridless scene', () => {
    const step = dragTarget(gridless, scene, drag({ x: 462, y: 238 }));
    expect(step.to).toEqual({ x: 462, y: 238 });
    expect(step.feet).toBeGreaterThan(10);
  });
});
