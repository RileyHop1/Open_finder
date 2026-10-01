/**
 * What the map does with a mouse, a wheel, two fingers, and a keyboard. It
 * knows nothing about the DOM or PixiJS: the caller turns events into plain
 * numbers (positions relative to the map's box) and gives it a `host` to read
 * the camera from and write it back to, so every behaviour here is a unit
 * test and none of it needs a browser.
 *
 * - **Drag** with one pointer pans; the map follows the pointer.
 * - **Two pointers** (a pinch) zoom about the midpoint between them and pan with
 *   it, so the thing under your fingers stays under your fingers.
 * - **Wheel** zooms about the pointer.
 * - **Keyboard** does everything the pointer does (the accessibility rule that
 *   dragging is never the only way): arrows pan, `+` and `-` zoom, `0` fits the
 *   whole map.
 */

import {
  type Camera,
  constrainCamera,
  fitCamera,
  panBy,
  type Point,
  type Size,
  zoomAt,
} from './camera.js';

/** How far an arrow key pans, in screen pixels; Shift pans further. */
export const KEY_PAN_STEP = 100;
export const KEY_PAN_STEP_BIG = 400;

/** What one press of `+` or `-` multiplies the zoom by. */
export const KEY_ZOOM_STEP = 1.25;

/** Wheel sensitivity: a typical 100px notch zooms by about 14%; a trackpad pinch (which arrives as a wheel with Ctrl held) sends small deltas, so it gets more. */
const WHEEL_ZOOM_RATE = 0.0015;
const WHEEL_PINCH_ZOOM_RATE = 0.01;

export interface MapInputHost {
  camera(): Camera;
  /** The scene's size, or undefined when no scene is drawn (then input does nothing). */
  scene(): Size | undefined;
  viewport(): Size;
  /** Takes the new camera. `fitted` is true when it is the whole-map view, false once the user has moved it. */
  apply(camera: Camera, fitted: boolean): void;
}

/** A pointer, with its position relative to the top-left of the map's box. */
export interface PointerSample extends Point {
  readonly pointerId: number;
}

export interface WheelSample extends Point {
  readonly deltaY: number;
  /** 0 pixels, 1 lines, 2 pages (`WheelEvent.deltaMode`). */
  readonly deltaMode: number;
  readonly ctrlKey: boolean;
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

export interface MapInput {
  pointerDown(pointer: PointerSample): void;
  pointerMove(pointer: PointerSample): void;
  pointerUp(pointer: PointerSample): void;
  wheel(wheel: WheelSample): void;
  /** Handles a key and returns whether it was one the map uses (so the caller can stop the page scrolling). */
  keyDown(key: string, shiftKey: boolean): boolean;
  /** Zooms about the middle of the box: what the on-screen buttons do. */
  zoomBy(factor: number): void;
  /** Back to the whole-map view. */
  fit(): void;
  /** Whether a pointer is currently held down on the map. */
  readonly dragging: boolean;
}

export function createMapInput(host: MapInputHost): MapInput {
  /** Where each held pointer last was. */
  const held = new Map<number, Point>();

  function move(next: (camera: Camera, scene: Size, viewport: Size) => Camera): void {
    const scene = host.scene();
    if (scene === undefined) {
      return;
    }
    host.apply(next(host.camera(), scene, host.viewport()), false);
  }

  function zoomAbout(factor: number, anchor: Point): void {
    move((camera, scene, viewport) => zoomAt(camera, factor, anchor, scene, viewport));
  }

  function zoomAboutCentre(factor: number): void {
    const viewport = host.viewport();
    zoomAbout(factor, { x: viewport.width / 2, y: viewport.height / 2 });
  }

  function fit(): void {
    const scene = host.scene();
    if (scene !== undefined) {
      host.apply(fitCamera(scene, host.viewport()), true);
    }
  }

  return {
    pointerDown(pointer) {
      held.set(pointer.pointerId, { x: pointer.x, y: pointer.y });
    },

    pointerMove(pointer) {
      const before = held.get(pointer.pointerId);
      if (before === undefined) {
        return;
      }
      const after = { x: pointer.x, y: pointer.y };
      const others = [...held.entries()].filter(([id]) => id !== pointer.pointerId);
      held.set(pointer.pointerId, after);

      const [other] = others;
      if (other === undefined || others.length > 1) {
        // One pointer pans. A third finger is ignored rather than fought over.
        if (others.length === 0) {
          move((camera, scene) =>
            panBy(camera, after.x - before.x, after.y - before.y, scene),
          );
        }
        return;
      }

      // Two pointers: zoom by how the gap changed, about where the midpoint was, then follow the midpoint.
      const fixed = other[1];
      const oldMid = midpoint(before, fixed);
      const newMid = midpoint(after, fixed);
      const oldGap = distance(before, fixed);
      const factor = oldGap === 0 ? 1 : distance(after, fixed) / oldGap;
      move((camera, scene, viewport) =>
        panBy(
          zoomAt(camera, factor, oldMid, scene, viewport),
          newMid.x - oldMid.x,
          newMid.y - oldMid.y,
          scene,
        ),
      );
    },

    pointerUp(pointer) {
      held.delete(pointer.pointerId);
    },

    wheel(wheel) {
      const lines = wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? 100 : 1;
      const rate = wheel.ctrlKey ? WHEEL_PINCH_ZOOM_RATE : WHEEL_ZOOM_RATE;
      zoomAbout(Math.exp(-wheel.deltaY * lines * rate), wheel);
    },

    keyDown(key, shiftKey) {
      const step = shiftKey ? KEY_PAN_STEP_BIG : KEY_PAN_STEP;
      // An arrow pans the *view*, so the map moves the other way.
      const pan = (dx: number, dy: number) =>
        move((camera, scene) => panBy(camera, dx, dy, scene));
      switch (key) {
        case 'ArrowLeft':
          pan(step, 0);
          return true;
        case 'ArrowRight':
          pan(-step, 0);
          return true;
        case 'ArrowUp':
          pan(0, step);
          return true;
        case 'ArrowDown':
          pan(0, -step);
          return true;
        case '+':
        case '=':
          zoomAboutCentre(KEY_ZOOM_STEP);
          return true;
        case '-':
        case '_':
          zoomAboutCentre(1 / KEY_ZOOM_STEP);
          return true;
        case '0':
          fit();
          return true;
        default:
          return false;
      }
    },

    zoomBy: zoomAboutCentre,
    fit,

    get dragging() {
      return held.size > 0;
    },
  };
}

/** Re-applies the camera's limits after the box or scene changed size. Kept here so the view's resize rule is tested with the rest of the input. */
export function afterResize(
  camera: Camera,
  fitted: boolean,
  scene: Size,
  viewport: Size,
): Camera {
  return fitted ? fitCamera(scene, viewport) : constrainCamera(camera, scene, viewport);
}
