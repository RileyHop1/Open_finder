import { sceneGridSchema } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { compassAim, placePayload } from './templatePlacement.js';

/** 100px cells, 5ft each: 1 foot is 20 scene pixels. */
const grid = sceneGridSchema.parse({});
const origin = { x: 500, y: 500 };

describe('compassAim', () => {
  it('aims east, at the right distance in pixels', () => {
    expect(compassAim(grid, origin, 25, 'E')).toEqual({ x: 1000, y: 500 });
  });

  it('aims west, south, and north from the origin', () => {
    const west = compassAim(grid, origin, 25, 'W');
    expect(west.x).toBeCloseTo(0);
    expect(west.y).toBeCloseTo(500);
    expect(compassAim(grid, origin, 25, 'S').y).toBeCloseTo(1000);
    expect(compassAim(grid, origin, 25, 'N').y).toBeCloseTo(0);
  });

  it('aims diagonally for the intercardinal directions', () => {
    const ne = compassAim(grid, origin, 25, 'NE');
    expect(ne.x).toBeGreaterThan(origin.x);
    expect(ne.y).toBeLessThan(origin.y);
  });
});

describe('placePayload', () => {
  const base = {
    feet: 20,
    widthFeet: 5,
    tokenId: undefined,
    label: undefined,
  };

  it('is undefined for a burst with no origin yet', () => {
    expect(
      placePayload('scene-1', {
        ...base,
        shape: 'burst',
        origin: undefined,
        aim: undefined,
      }),
    ).toBeUndefined();
  });

  it('builds a burst’s payload from just the origin', () => {
    expect(
      placePayload('scene-1', { ...base, shape: 'burst', origin, aim: undefined }),
    ).toEqual({ sceneId: 'scene-1', shape: 'burst', at: origin, feet: 20 });
  });

  it('is undefined for a cone or line with an origin but no aim yet', () => {
    expect(
      placePayload('scene-1', { ...base, shape: 'cone', origin, aim: undefined }),
    ).toBeUndefined();
  });

  it('builds a line’s payload with its aim and width', () => {
    const aim = { x: 700, y: 500 };
    expect(placePayload('scene-1', { ...base, shape: 'line', origin, aim })).toEqual({
      sceneId: 'scene-1',
      shape: 'line',
      at: origin,
      to: aim,
      feet: 20,
      widthFeet: 5,
    });
  });

  it('includes the label when given', () => {
    expect(
      placePayload('scene-1', {
        ...base,
        shape: 'burst',
        origin,
        aim: undefined,
        label: 'Fireball',
      }),
    ).toMatchObject({ label: 'Fireball' });
  });

  it('is undefined for an emanation with no source token', () => {
    expect(
      placePayload('scene-1', {
        ...base,
        shape: 'emanation',
        origin: undefined,
        aim: undefined,
      }),
    ).toBeUndefined();
  });

  it('builds an emanation’s payload from its token, needing no clicked origin', () => {
    expect(
      placePayload('scene-1', {
        ...base,
        shape: 'emanation',
        origin: undefined,
        aim: undefined,
        tokenId: 'tok-1',
      }),
    ).toEqual({
      sceneId: 'scene-1',
      shape: 'emanation',
      at: { x: 0, y: 0 },
      feet: 20,
      tokenId: 'tok-1',
    });
  });
});
