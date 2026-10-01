/**
 * The map camera, as pure maths so it can be tested without a canvas.
 *
 * A camera is the **scene point at the middle of the viewport** and a zoom
 * (screen pixels per scene pixel). Scene coordinates are the ones documents
 * use (`docs/scene.md`: a scene's pixels, origin at its top-left); screen
 * coordinates are CSS pixels inside the viewport, origin at its top-left.
 *
 * The map is never lost: the centre may not leave the scene, and the zoom is
 * kept between half of "the whole map fits" and `MAX_ZOOM`, so there is always
 * a way back that does not need a "reset" button.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Camera {
  /** Scene x at the middle of the viewport. */
  readonly x: number;
  /** Scene y at the middle of the viewport. */
  readonly y: number;
  /** Screen pixels per scene pixel: 1 is the map at its own size. */
  readonly zoom: number;
}

/** How far in the camera may go: four screen pixels per scene pixel. */
export const MAX_ZOOM = 4;

/** Space left round the map when it is fitted to the viewport, in screen pixels. */
export const FIT_MARGIN = 24;

/** The zoom at which the whole scene is visible with `FIT_MARGIN` to spare. */
export function fitZoom(scene: Size, viewport: Size): number {
  const room = {
    width: Math.max(viewport.width - 2 * FIT_MARGIN, 1),
    height: Math.max(viewport.height - 2 * FIT_MARGIN, 1),
  };
  return Math.min(room.width / scene.width, room.height / scene.height);
}

/** The furthest the camera may zoom out: half of what fits the whole map. */
export function minZoom(scene: Size, viewport: Size): number {
  return Math.min(fitZoom(scene, viewport) / 2, MAX_ZOOM);
}

function clampZoom(zoom: number, scene: Size, viewport: Size): number {
  return Math.min(Math.max(zoom, minZoom(scene, viewport)), MAX_ZOOM);
}

/** Keeps the centre inside the scene, so the map cannot be panned out of sight. */
function clampCentre(centre: Point, scene: Size): Point {
  return {
    x: Math.min(Math.max(centre.x, 0), scene.width),
    y: Math.min(Math.max(centre.y, 0), scene.height),
  };
}

/** The whole scene, centred, as large as fits (never past `MAX_ZOOM`). */
export function fitCamera(scene: Size, viewport: Size): Camera {
  return {
    x: scene.width / 2,
    y: scene.height / 2,
    zoom: Math.min(fitZoom(scene, viewport), MAX_ZOOM),
  };
}

/** Where the scene's own origin sits on screen, and its scale: what to give the world container. */
export function worldTransform(
  camera: Camera,
  viewport: Size,
): { x: number; y: number; scale: number } {
  return {
    x: viewport.width / 2 - camera.x * camera.zoom,
    y: viewport.height / 2 - camera.y * camera.zoom,
    scale: camera.zoom,
  };
}

export function screenToScene(camera: Camera, viewport: Size, screen: Point): Point {
  return {
    x: camera.x + (screen.x - viewport.width / 2) / camera.zoom,
    y: camera.y + (screen.y - viewport.height / 2) / camera.zoom,
  };
}

export function sceneToScreen(camera: Camera, viewport: Size, scene: Point): Point {
  return {
    x: viewport.width / 2 + (scene.x - camera.x) * camera.zoom,
    y: viewport.height / 2 + (scene.y - camera.y) * camera.zoom,
  };
}

/** Drags the map by `dx`, `dy` screen pixels (the map follows the pointer, so the centre moves the other way). */
export function panBy(camera: Camera, dx: number, dy: number, scene: Size): Camera {
  const centre = clampCentre(
    { x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom },
    scene,
  );
  return { ...camera, ...centre };
}

/**
 * Multiplies the zoom by `factor` while the scene point under `anchor` (a
 * screen point: the pointer, or the middle of a pinch) stays under it.
 */
export function zoomAt(
  camera: Camera,
  factor: number,
  anchor: Point,
  scene: Size,
  viewport: Size,
): Camera {
  const zoom = clampZoom(camera.zoom * factor, scene, viewport);
  const before = screenToScene(camera, viewport, anchor);
  // Solve screenToScene(next, anchor) === before for the new centre.
  const centre = clampCentre(
    {
      x: before.x - (anchor.x - viewport.width / 2) / zoom,
      y: before.y - (anchor.y - viewport.height / 2) / zoom,
    },
    scene,
  );
  return { ...centre, zoom };
}

/** Re-applies the limits after the viewport or the scene changed size, so a resize cannot strand the camera. */
export function constrainCamera(camera: Camera, scene: Size, viewport: Size): Camera {
  return {
    ...clampCentre(camera, scene),
    zoom: clampZoom(camera.zoom, scene, viewport),
  };
}
