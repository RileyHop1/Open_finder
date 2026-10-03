/**
 * The maths behind placing an area template (M5 C.9b): where a cone or line
 * aims when rotated to a compass direction (the keyboard route to dragging),
 * and the `template.place` payload for a pending placement. Kept apart from
 * the component so it is testable without mounting anything or touching
 * PixiJS.
 */
import type { Point, SceneGrid, TemplateShape } from '@hearthtable/core';

export const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassDirection = (typeof COMPASS_DIRECTIONS)[number];

/** Degrees clockwise from east (scene pixels: +x east, +y south), matching screen compass directions. */
const COMPASS_DEGREES: Readonly<Record<CompassDirection, number>> = {
  E: 0,
  SE: 45,
  S: 90,
  SW: 135,
  W: 180,
  NW: 225,
  N: 270,
  NE: 315,
};

/** Where a cone or line aims, `feet` from `origin`, rotated to a compass direction -- the keyboard route to dragging to rotate. */
export function compassAim(
  grid: SceneGrid,
  origin: Point,
  feet: number,
  direction: CompassDirection,
): Point {
  const radians = (COMPASS_DEGREES[direction] * Math.PI) / 180;
  const pixels = (feet / grid.distance) * grid.size;
  return {
    x: origin.x + pixels * Math.cos(radians),
    y: origin.y + pixels * Math.sin(radians),
  };
}

export interface PendingTemplate {
  readonly shape: TemplateShape;
  readonly origin: Point | undefined;
  readonly aim: Point | undefined;
  readonly feet: number;
  readonly widthFeet: number;
  readonly tokenId: string | undefined;
  readonly label: string | undefined;
}

/**
 * The `template.place` payload for `pending`, or undefined when it is not
 * yet placeable: a burst/cone/line needs an origin, a cone/line also needs
 * an aim point, and an emanation needs a source token instead of a clicked
 * origin.
 */
export function placePayload(
  sceneId: string,
  pending: PendingTemplate,
): Record<string, unknown> | undefined {
  if (pending.shape === 'emanation') {
    if (pending.tokenId === undefined) {
      return undefined;
    }
    return {
      sceneId,
      shape: pending.shape,
      at: { x: 0, y: 0 },
      feet: pending.feet,
      tokenId: pending.tokenId,
      ...(pending.label === undefined ? {} : { label: pending.label }),
    };
  }
  if (pending.origin === undefined) {
    return undefined;
  }
  if (
    (pending.shape === 'cone' || pending.shape === 'line') &&
    pending.aim === undefined
  ) {
    return undefined;
  }
  return {
    sceneId,
    shape: pending.shape,
    at: pending.origin,
    ...(pending.aim === undefined ? {} : { to: pending.aim }),
    feet: pending.feet,
    ...(pending.shape === 'line' ? { widthFeet: pending.widthFeet } : {}),
    ...(pending.label === undefined ? {} : { label: pending.label }),
  };
}
