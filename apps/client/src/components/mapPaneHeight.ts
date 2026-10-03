/**
 * The map pane's resizable height: now that the turn bar, the action tray,
 * and the action bar all sit around the map, a fixed height could starve one
 * of them off screen. Kept apart from the component so the clamping is
 * testable without mounting anything.
 */

export const MIN_MAP_PANE_HEIGHT = 320;
/** Leaves at least this much of the viewport for everything else around the map. */
export const MAX_MAP_PANE_FRACTION = 0.85;
export const RESIZE_STEP = 24;

export function maxMapPaneHeight(viewportHeight: number): number {
  return Math.max(MIN_MAP_PANE_HEIGHT, viewportHeight * MAX_MAP_PANE_FRACTION);
}

/** Keeps a height within what the map pane is allowed, for this viewport. */
export function clampMapPaneHeight(height: number, viewportHeight: number): number {
  return Math.min(
    Math.max(height, MIN_MAP_PANE_HEIGHT),
    maxMapPaneHeight(viewportHeight),
  );
}
