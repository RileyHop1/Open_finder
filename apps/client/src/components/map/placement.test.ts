import { describe, expect, it } from 'vitest';

import { viewCentre } from './placement.js';

const scene = { width: 2000, height: 1000 };
const viewport = { width: 1000, height: 500 };

describe('viewCentre', () => {
  it('is where the camera looks when nothing covers the map', () => {
    expect(viewCentre({ x: 700, y: 300, zoom: 1 }, viewport, scene)).toEqual({
      x: 700,
      y: 300,
    });
  });

  it('accounts for zoom', () => {
    // At 2x the viewport shows 500 scene pixels across, still centred on the camera.
    expect(viewCentre({ x: 700, y: 300, zoom: 2 }, viewport, scene)).toEqual({
      x: 700,
      y: 300,
    });
  });

  it('moves into the part a left drawer leaves visible', () => {
    // 400 px covered on the left: the visible part is x 400..1000, middle 700 -> 200 right of centre.
    expect(
      viewCentre({ x: 1000, y: 500, zoom: 1 }, viewport, scene, { left: 400, right: 0 }),
    ).toEqual({ x: 1200, y: 500 });
  });

  it('moves into the part both drawers leave visible', () => {
    expect(
      viewCentre({ x: 1000, y: 500, zoom: 1 }, viewport, scene, {
        left: 400,
        right: 200,
      }),
    ).toEqual({ x: 1100, y: 500 });
  });

  it('ignores drawers that cover the whole map', () => {
    expect(
      viewCentre({ x: 1000, y: 500, zoom: 1 }, viewport, scene, {
        left: 700,
        right: 700,
      }),
    ).toEqual({ x: 1000, y: 500 });
  });

  it('stays on the scene when the camera looks past its edge', () => {
    expect(viewCentre({ x: 1990, y: 995, zoom: 0.25 }, viewport, scene)).toEqual({
      x: 1990,
      y: 995,
    });
    expect(
      viewCentre({ x: 1990, y: 995, zoom: 1 }, viewport, scene, { left: 0, right: 0 }),
    ).toEqual({ x: 1990, y: 995 });
    expect(
      viewCentre({ x: 1990, y: 995, zoom: 1 }, viewport, scene, { left: 900, right: 0 }),
    ).toEqual({ x: 2000, y: 995 });
  });
});
