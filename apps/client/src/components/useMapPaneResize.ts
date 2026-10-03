/**
 * The map pane's resizable height: now that the turn bar, the action tray,
 * and the action bar all sit around the map, a fixed height could starve one
 * of them off screen. Dragging the returned `startResize` handler, or the
 * keyboard route through `onKey` (arrows, Home, End -- dragging is never the
 * only way), both go through `setHeight`, which clamps and remembers the
 * choice per browser (`localStorage`, not per world: it's about the screen).
 */

import { onBeforeUnmount, ref } from 'vue';

import {
  clampMapPaneHeight,
  maxMapPaneHeight,
  MIN_MAP_PANE_HEIGHT,
  RESIZE_STEP,
} from './mapPaneHeight.js';

const STORAGE_KEY = 'hearthtable:mapPaneHeight';

function storedHeight(): number | undefined {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : undefined;
}

export function useMapPaneResize() {
  const height = ref(
    clampMapPaneHeight(storedHeight() ?? window.innerHeight - 320, window.innerHeight),
  );

  function setHeight(value: number): void {
    height.value = clampMapPaneHeight(value, window.innerHeight);
    localStorage.setItem(STORAGE_KEY, String(height.value));
  }

  let dragStartY = 0;
  let dragStartHeight = 0;

  function onDragMove(event: PointerEvent): void {
    setHeight(dragStartHeight + (event.clientY - dragStartY));
  }

  function endDrag(): void {
    window.removeEventListener('pointermove', onDragMove);
  }

  function startResize(event: PointerEvent): void {
    event.preventDefault();
    dragStartY = event.clientY;
    dragStartHeight = height.value;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag, { once: true });
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      setHeight(height.value + RESIZE_STEP);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      setHeight(height.value - RESIZE_STEP);
    } else if (event.key === 'Home') {
      setHeight(MIN_MAP_PANE_HEIGHT);
    } else if (event.key === 'End') {
      setHeight(maxMapPaneHeight(window.innerHeight));
    } else {
      return;
    }
    event.preventDefault();
  }

  /** The handle's live `aria-valuemax`: a function, so it re-reads the viewport on every render. */
  function maxHeightNow(): number {
    return maxMapPaneHeight(window.innerHeight);
  }

  onBeforeUnmount(endDrag);

  return { height, startResize, onKey, maxHeightNow, MIN_MAP_PANE_HEIGHT };
}
