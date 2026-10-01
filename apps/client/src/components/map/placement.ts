/**
 * Where a new token goes when the GM places one: the pure maths, and the name
 * of the drag the roster starts. Kept apart from `MapView.vue` so the choices
 * (the middle of what can actually be seen, never off the scene) are unit tests.
 */

import { type Camera, type Point, type Size, screenToScene } from './camera.js';

/** The drag data type the roster sets and the map accepts: the dragged actor's id. */
export const ACTOR_DRAG_TYPE = 'application/x-hearthtable-actor';

/**
 * Starts a roster drag carrying `actorId`, then calls `started` once the drag is
 * under way. It is deferred a beat because changing the page inside `dragstart`
 * can cancel the drag (and would change the drag image).
 */
export function startActorDrag(
  event: DragEvent,
  actorId: string,
  started: () => void,
): void {
  event.dataTransfer?.setData(ACTOR_DRAG_TYPE, actorId);
  if (event.dataTransfer !== null) {
    event.dataTransfer.effectAllowed = 'copy';
  }
  setTimeout(started, 0);
}

/** How much of the map's left and right edges something else (a drawer) covers, in screen pixels. */
export interface Covered {
  readonly left: number;
  readonly right: number;
}

/**
 * The middle of the part of the map that can be seen, in scene pixels, kept on
 * the scene. A drawer over one side hides part of the map, and a token placed
 * under it would be placed where nobody can see it, so `covered` shrinks the
 * area to what is left.
 */
export function viewCentre(
  camera: Camera,
  viewport: Size,
  scene: Size,
  covered: Covered = { left: 0, right: 0 },
): Point {
  // A drawer wider than the map would leave nothing: fall back to the whole box.
  const room = viewport.width - covered.left - covered.right;
  const left = room > 0 ? covered.left : 0;
  const right = room > 0 ? covered.right : 0;
  const point = screenToScene(camera, viewport, {
    x: (left + viewport.width - right) / 2,
    y: viewport.height / 2,
  });
  return {
    x: Math.min(Math.max(point.x, 0), scene.width),
    y: Math.min(Math.max(point.y, 0), scene.height),
  };
}
