import { describe, expect, it, vi } from 'vitest';

import { type Camera, screenToScene } from './camera.js';
import {
  afterResize,
  createMapInput,
  KEY_PAN_STEP,
  KEY_PAN_STEP_BIG,
  KEY_ZOOM_STEP,
  type MapInputHost,
} from './mapInput.js';

const scene = { width: 2000, height: 1000 };
const viewport = { width: 1048, height: 548 };

/** A host holding one camera, starting from the fitted view (centre 1000,500 at 0.5). */
function setup(start: Camera = { x: 1000, y: 500, zoom: 0.5 }, hasScene = true) {
  let camera = start;
  const apply = vi.fn((next: Camera, _fitted: boolean) => {
    camera = next;
  });
  const host: MapInputHost = {
    camera: () => camera,
    scene: () => (hasScene ? scene : undefined),
    viewport: () => viewport,
    apply,
  };
  return { input: createMapInput(host), apply, now: () => camera };
}

describe('dragging with one pointer', () => {
  it('moves the map with the pointer', () => {
    const { input, now, apply } = setup();
    input.pointerDown({ pointerId: 1, x: 300, y: 200 });
    input.pointerMove({ pointerId: 1, x: 400, y: 160 });
    // 100 right and 40 up on screen is 200 and 80 scene pixels at half zoom.
    expect(now()).toEqual({ x: 800, y: 580, zoom: 0.5 });
    expect(apply).toHaveBeenLastCalledWith(expect.anything(), false);
  });

  it('follows each step from where the pointer last was', () => {
    const { input, now } = setup();
    input.pointerDown({ pointerId: 1, x: 0, y: 0 });
    input.pointerMove({ pointerId: 1, x: 10, y: 0 });
    input.pointerMove({ pointerId: 1, x: 30, y: 0 });
    expect(now().x).toBe(1000 - 60);
  });

  it('does nothing for a pointer that is not held, and stops when it is released', () => {
    const { input, apply } = setup();
    input.pointerMove({ pointerId: 1, x: 50, y: 50 });
    expect(apply).not.toHaveBeenCalled();

    input.pointerDown({ pointerId: 1, x: 0, y: 0 });
    expect(input.dragging).toBe(true);
    input.pointerUp({ pointerId: 1, x: 0, y: 0 });
    expect(input.dragging).toBe(false);
    input.pointerMove({ pointerId: 1, x: 50, y: 50 });
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('pinching with two pointers', () => {
  it('zooms by how the gap changed, keeping the point between the fingers still', () => {
    const { input, now } = setup();
    input.pointerDown({ pointerId: 1, x: 400, y: 274 });
    input.pointerDown({ pointerId: 2, x: 600, y: 274 });
    const before = screenToScene(now(), viewport, { x: 500, y: 274 });

    // The gap goes from 200 to 400 with the midpoint unchanged: twice the zoom.
    input.pointerMove({ pointerId: 1, x: 300, y: 274 });
    input.pointerMove({ pointerId: 2, x: 700, y: 274 });

    // Each finger moved on its own, so the zoom is the product of two steps.
    expect(now().zoom).toBeCloseTo(0.5 * (500 / 200) * (400 / 500), 9);
    const after = screenToScene(now(), viewport, { x: 500, y: 274 });
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('pans when both fingers slide together', () => {
    const { input, now } = setup({ x: 1000, y: 500, zoom: 1 });
    input.pointerDown({ pointerId: 1, x: 400, y: 274 });
    input.pointerDown({ pointerId: 2, x: 600, y: 274 });
    input.pointerMove({ pointerId: 1, x: 450, y: 274 });
    input.pointerMove({ pointerId: 2, x: 650, y: 274 });
    expect(now().zoom).toBeCloseTo(1, 1);
    expect(now().x).toBeLessThan(1000);
  });

  it('ignores a third finger instead of fighting over it', () => {
    const { input, apply } = setup();
    for (const id of [1, 2, 3]) {
      input.pointerDown({ pointerId: id, x: id * 100, y: 100 });
    }
    input.pointerMove({ pointerId: 1, x: 150, y: 150 });
    expect(apply).not.toHaveBeenCalled();
  });

  it('goes back to panning when one finger lifts', () => {
    const { input, now } = setup();
    input.pointerDown({ pointerId: 1, x: 100, y: 100 });
    input.pointerDown({ pointerId: 2, x: 200, y: 100 });
    input.pointerUp({ pointerId: 2, x: 200, y: 100 });
    input.pointerMove({ pointerId: 1, x: 120, y: 100 });
    expect(now()).toEqual({ x: 960, y: 500, zoom: 0.5 });
  });
});

describe('the wheel', () => {
  const wheel = (
    deltaY: number,
    extra: Partial<{ deltaMode: number; ctrlKey: boolean }> = {},
  ) => ({
    x: 524,
    y: 274,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    ...extra,
  });

  it('zooms in when rolled away from you and out when rolled toward you', () => {
    const a = setup();
    a.input.wheel(wheel(-100));
    expect(a.now().zoom).toBeGreaterThan(0.5);
    const b = setup();
    b.input.wheel(wheel(100));
    expect(b.now().zoom).toBeLessThan(0.5);
  });

  it('keeps the point under the pointer still', () => {
    const { input, now } = setup();
    const at = { x: 200, y: 100 };
    const before = screenToScene(now(), viewport, at);
    input.wheel({ ...at, deltaY: -240, deltaMode: 0, ctrlKey: false });
    const after = screenToScene(now(), viewport, at);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('treats a line-mode notch as bigger than a pixel-mode one, and a trackpad pinch as more sensitive', () => {
    const pixels = setup();
    pixels.input.wheel(wheel(-3));
    const lines = setup();
    lines.input.wheel(wheel(-3, { deltaMode: 1 }));
    const pinch = setup();
    pinch.input.wheel(wheel(-3, { ctrlKey: true }));
    expect(lines.now().zoom).toBeGreaterThan(pixels.now().zoom);
    expect(pinch.now().zoom).toBeGreaterThan(pixels.now().zoom);
  });
});

describe('the keyboard', () => {
  it('pans the view with the arrows: the map moves the other way', () => {
    const { input, now } = setup({ x: 1000, y: 500, zoom: 1 });
    expect(input.keyDown('ArrowLeft', false)).toBe(true);
    expect(now().x).toBe(1000 - KEY_PAN_STEP);
    input.keyDown('ArrowRight', false);
    input.keyDown('ArrowRight', false);
    expect(now().x).toBe(1000 + KEY_PAN_STEP);
    input.keyDown('ArrowUp', false);
    expect(now().y).toBe(500 - KEY_PAN_STEP);
    input.keyDown('ArrowDown', false);
    expect(now().y).toBe(500);
  });

  it('pans further with Shift', () => {
    const { input, now } = setup({ x: 1000, y: 500, zoom: 1 });
    input.keyDown('ArrowRight', true);
    expect(now().x).toBe(1000 + KEY_PAN_STEP_BIG);
  });

  it('zooms about the middle with + and -, and = and _ as their unshifted twins', () => {
    const { input, now } = setup({ x: 700, y: 300, zoom: 1 });
    input.keyDown('+', false);
    expect(now()).toEqual({ x: 700, y: 300, zoom: KEY_ZOOM_STEP });
    input.keyDown('-', false);
    expect(now().zoom).toBeCloseTo(1, 12);
    input.keyDown('=', false);
    input.keyDown('_', false);
    expect(now().zoom).toBeCloseTo(1, 12);
  });

  it('fits the whole map with 0, and says it is fitted', () => {
    const { input, now, apply } = setup({ x: 100, y: 100, zoom: 2 });
    expect(input.keyDown('0', false)).toBe(true);
    expect(now()).toEqual({ x: 1000, y: 500, zoom: 0.5 });
    expect(apply).toHaveBeenLastCalledWith(expect.anything(), true);
  });

  it('leaves every other key alone', () => {
    const { input, apply } = setup();
    expect(input.keyDown('a', false)).toBe(false);
    expect(input.keyDown('Tab', false)).toBe(false);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('the buttons', () => {
  it('zoomBy zooms about the middle and fit goes back to the whole map', () => {
    const { input, now } = setup({ x: 700, y: 300, zoom: 1 });
    input.zoomBy(2);
    expect(now()).toEqual({ x: 700, y: 300, zoom: 2 });
    input.fit();
    expect(now()).toEqual({ x: 1000, y: 500, zoom: 0.5 });
  });
});

describe('with no scene', () => {
  it('does nothing at all', () => {
    const { input, apply } = setup(undefined, false);
    input.pointerDown({ pointerId: 1, x: 0, y: 0 });
    input.pointerMove({ pointerId: 1, x: 50, y: 50 });
    input.wheel({ x: 0, y: 0, deltaY: -100, deltaMode: 0, ctrlKey: false });
    input.zoomBy(2);
    input.fit();
    input.keyDown('0', false);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('afterResize', () => {
  it('refits a camera that was never moved, so the whole map follows the box', () => {
    expect(
      afterResize({ x: 1000, y: 500, zoom: 0.5 }, true, scene, {
        width: 548,
        height: 348,
      }),
    ).toEqual({
      x: 1000,
      y: 500,
      zoom: 0.25,
    });
  });

  it('keeps where the user looked, within the limits, once they have moved it', () => {
    expect(afterResize({ x: 300, y: 200, zoom: 1 }, false, scene, viewport)).toEqual({
      x: 300,
      y: 200,
      zoom: 1,
    });
    expect(afterResize({ x: 5000, y: 200, zoom: 0.001 }, false, scene, viewport)).toEqual(
      {
        x: 2000,
        y: 200,
        zoom: 0.25,
      },
    );
  });
});
