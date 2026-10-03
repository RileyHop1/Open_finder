import { describe, expect, it } from 'vitest';

import {
  clampMapPaneHeight,
  maxMapPaneHeight,
  MIN_MAP_PANE_HEIGHT,
} from './mapPaneHeight.js';

describe('clampMapPaneHeight', () => {
  it('never goes below the minimum, even for a tiny viewport', () => {
    expect(clampMapPaneHeight(10, 400)).toBe(MIN_MAP_PANE_HEIGHT);
  });

  it('never exceeds the viewport’s share, even asking for more', () => {
    expect(clampMapPaneHeight(10_000, 1000)).toBe(maxMapPaneHeight(1000));
  });

  it('passes a height through unchanged when it already fits', () => {
    expect(clampMapPaneHeight(500, 1000)).toBe(500);
  });
});

describe('maxMapPaneHeight', () => {
  it('is a fraction of the viewport, never under the minimum', () => {
    expect(maxMapPaneHeight(1000)).toBe(850);
    expect(maxMapPaneHeight(100)).toBe(MIN_MAP_PANE_HEIGHT);
  });
});
