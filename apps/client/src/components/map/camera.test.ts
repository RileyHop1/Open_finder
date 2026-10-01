import { describe, expect, it } from 'vitest';

import {
  type Camera,
  constrainCamera,
  fitCamera,
  fitZoom,
  MAX_ZOOM,
  minZoom,
  panBy,
  sceneToScreen,
  screenToScene,
  worldTransform,
  zoomAt,
} from './camera.js';

const scene = { width: 2000, height: 1000 };
const viewport = { width: 1048, height: 548 };

describe('fitting', () => {
  it('fits the whole scene with a 24px margin: the tighter side decides', () => {
    // Room is 1000 x 500; 1000 / 2000 and 500 / 1000 are both 0.5.
    expect(fitZoom(scene, viewport)).toBe(0.5);
    // A taller scene is limited by height: 500 / 2000 = 0.25.
    expect(fitZoom({ width: 1000, height: 2000 }, viewport)).toBe(0.25);
  });

  it('centres the camera on the scene', () => {
    expect(fitCamera(scene, viewport)).toEqual({ x: 1000, y: 500, zoom: 0.5 });
  });

  it('never zooms a small scene in past the maximum', () => {
    expect(fitCamera({ width: 100, height: 100 }, viewport).zoom).toBe(MAX_ZOOM);
  });

  it('survives a viewport with no room', () => {
    expect(fitZoom(scene, { width: 0, height: 0 })).toBeGreaterThan(0);
  });
});

describe('the world transform and the two coordinate systems', () => {
  const camera: Camera = { x: 1000, y: 500, zoom: 0.5 };

  it('puts the camera’s point at the middle of the viewport', () => {
    // Scene origin sits at 524 - 500 = 24 and 274 - 250 = 24: the fit margin.
    expect(worldTransform(camera, viewport)).toEqual({ x: 24, y: 24, scale: 0.5 });
    expect(sceneToScreen(camera, viewport, { x: 1000, y: 500 })).toEqual({
      x: 524,
      y: 274,
    });
  });

  it('converts both ways', () => {
    const screen = sceneToScreen(camera, viewport, { x: 300, y: 700 });
    expect(screen).toEqual({ x: 174, y: 374 });
    expect(screenToScene(camera, viewport, screen)).toEqual({ x: 300, y: 700 });
  });
});

describe('panBy', () => {
  it('moves the map with the pointer: dragging right shows what was to the left', () => {
    const camera: Camera = { x: 1000, y: 500, zoom: 0.5 };
    expect(panBy(camera, 100, -40, scene)).toEqual({ x: 800, y: 580, zoom: 0.5 });
  });

  it('moves by fewer scene pixels the further in you are', () => {
    expect(panBy({ x: 1000, y: 500, zoom: 2 }, 100, 0, scene).x).toBe(950);
  });

  it('stops with the centre at the scene’s edge, so the map is never lost', () => {
    const camera: Camera = { x: 100, y: 100, zoom: 1 };
    expect(panBy(camera, 5000, 5000, scene)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(panBy(camera, -9000, -9000, scene)).toEqual({ x: 2000, y: 1000, zoom: 1 });
  });
});

describe('zoomAt', () => {
  it('keeps the scene point under the pointer where it was', () => {
    const camera: Camera = { x: 1000, y: 500, zoom: 0.5 };
    const anchor = { x: 200, y: 100 };
    const under = screenToScene(camera, viewport, anchor);

    const zoomed = zoomAt(camera, 2, anchor, scene, viewport);
    expect(zoomed.zoom).toBe(1);
    const after = screenToScene(zoomed, viewport, anchor);
    expect(after.x).toBeCloseTo(under.x, 9);
    expect(after.y).toBeCloseTo(under.y, 9);
  });

  it('zooms about the middle when the anchor is the middle', () => {
    const camera: Camera = { x: 700, y: 300, zoom: 1 };
    expect(zoomAt(camera, 2, { x: 524, y: 274 }, scene, viewport)).toEqual({
      x: 700,
      y: 300,
      zoom: 2,
    });
  });

  it('stops at the maximum and at half of fit', () => {
    const camera: Camera = { x: 1000, y: 500, zoom: 1 };
    expect(zoomAt(camera, 100, { x: 524, y: 274 }, scene, viewport).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(camera, 0.0001, { x: 524, y: 274 }, scene, viewport).zoom).toBe(
      minZoom(scene, viewport),
    );
    expect(minZoom(scene, viewport)).toBe(0.25);
  });
});

describe('constrainCamera', () => {
  it('pulls a stranded camera back after the scene or viewport changes', () => {
    const stranded: Camera = { x: 5000, y: -300, zoom: 0.001 };
    expect(constrainCamera(stranded, scene, viewport)).toEqual({
      x: 2000,
      y: 0,
      zoom: 0.25,
    });
  });

  it('leaves a good camera alone', () => {
    const camera: Camera = { x: 1000, y: 500, zoom: 1 };
    expect(constrainCamera(camera, scene, viewport)).toEqual(camera);
  });
});
