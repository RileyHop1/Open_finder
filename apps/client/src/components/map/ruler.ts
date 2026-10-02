/**
 * The measuring ruler and the token distances, as pure maths on the scene's
 * `GridStrategy` (the PF2e square grid counts diagonals 5, 10, 5... along the
 * route; a gridless scene is straight lines), so a measurement on screen is the
 * same number a token's move shows and the rules give.
 *
 * Two ways to the same kind of answer, because measuring is never pointer-only:
 * the ruler (points along a path, for someone with a pointer) and the distance
 * from the selected token to every other token (for the keyboard and a screen
 * reader, shown in the token list).
 */

import type { GridStrategy, Point } from '@hearthtable/core';

/**
 * Where a ruler click lands: the centre of the cell it is in (so a measurement
 * runs between squares, as movement does), kept on the scene. Gridless scenes
 * measure from exactly where you click.
 */
export function rulerPoint(
  grid: GridStrategy,
  scene: { readonly width: number; readonly height: number },
  pointer: Point,
): Point {
  if (grid.grid.type === 'none') {
    return {
      x: Math.min(Math.max(pointer.x, 0), scene.width),
      y: Math.min(Math.max(pointer.y, 0), scene.height),
    };
  }
  // Kept inside first, so the cell snapped to is a real one on the scene (not one past its edge).
  return grid.snap(
    {
      x: Math.min(Math.max(pointer.x, 0), scene.width - 1),
      y: Math.min(Math.max(pointer.y, 0), scene.height - 1),
    },
    1,
  );
}

/** Feet along `waypoints` and then on to `cursor`, if there is one. Fewer than two points is 0. */
export function rulerFeet(
  grid: GridStrategy,
  waypoints: readonly Point[],
  cursor?: Point,
): number {
  return grid.pathDistance(cursor === undefined ? waypoints : [...waypoints, cursor]);
}

/** Feet from the token `fromId` to each other token, to its nearest occupied square (a Large creature is measured from the edge, not the middle). Empty if `fromId` is not among `tokens`. */
export function tokenDistances(
  grid: GridStrategy,
  tokens: readonly { id: string; x: number; y: number; size: number }[],
  fromId: string,
): Record<string, number> {
  const from = tokens.find((token) => token.id === fromId);
  if (from === undefined) {
    return {};
  }
  const distances: Record<string, number> = {};
  for (const token of tokens) {
    if (token.id !== fromId) {
      distances[token.id] = grid.distanceBetween(
        { center: { x: from.x, y: from.y }, size: from.size },
        { center: { x: token.x, y: token.y }, size: token.size },
      );
    }
  }
  return distances;
}
