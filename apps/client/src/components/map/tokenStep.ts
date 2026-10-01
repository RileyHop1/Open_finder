/**
 * One step of a token by the keyboard, and what it measured, as pure maths: the
 * keyboard equivalent of dragging (the accessibility rule that dragging is never
 * the only way). A step is one grid cell in a compass direction, snapped the way
 * the server will snap it (`GridStrategy.snap`), so what the screen shows
 * before the server answers is what the server then stores.
 */

import type { GridStrategy, Point } from '@hearthtable/core';

export type Direction = 'left' | 'right' | 'up' | 'down';

const STEP: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** The arrow keys, by `KeyboardEvent.key`. */
export const ARROW_DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export interface Step {
  /** Where the token's centre goes, snapped. */
  readonly to: Point;
  /** Feet moved, by the grid's own rule. */
  readonly feet: number;
}

/**
 * One cell from `from` toward `direction`, or undefined at the edge of the
 * scene (a step that would leave it is refused rather than quietly clamped to
 * a place that is not on the grid). A gridless scene steps by its nominal cell
 * size.
 */
export function stepToken(
  grid: GridStrategy,
  scene: { readonly width: number; readonly height: number },
  token: { readonly x: number; readonly y: number; readonly size: number },
  direction: Direction,
): Step | undefined {
  const cell = grid.grid.size;
  const from = grid.snap(token, token.size);
  const unit = STEP[direction];
  const to = grid.snap(
    { x: from.x + unit.x * cell, y: from.y + unit.y * cell },
    token.size,
  );
  if (to.x < 0 || to.y < 0 || to.x > scene.width || to.y > scene.height) {
    return undefined;
  }
  return { to, feet: grid.pathDistance([from, to]) };
}
