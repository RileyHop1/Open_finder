import type { Scene } from '@hearthtable/core';
import { sceneSchema } from '@hearthtable/core';
import { describe, expect, it } from 'vitest';

import { arrivalPoint, describeExit, exitAt, exitViews } from './exitModel.js';

const NOW = '2026-10-01T00:00:00.000Z';

const makeScene = (
  name: string,
  links: { label: string; x: number; y: number; targetSceneId: string }[] = [],
): Scene =>
  sceneSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'scene',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    name,
    kind: 'area',
    links: links.map((link) => ({ id: crypto.randomUUID(), ...link })),
  });

describe('exitViews', () => {
  it('names the scene each exit leads to', () => {
    const keep = makeScene('Keep');
    const yard = makeScene('Yard', [
      { label: 'Gate', x: 100, y: 200, targetSceneId: keep.id },
    ]);
    expect(exitViews(yard, [yard, keep])).toEqual([
      expect.objectContaining({
        label: 'Gate',
        x: 100,
        y: 200,
        targetSceneId: keep.id,
        targetName: 'Keep',
      }),
    ]);
  });

  it('leaves the name out when the target is not there', () => {
    const yard = makeScene('Yard', [
      { label: 'Gate', x: 1, y: 1, targetSceneId: crypto.randomUUID() },
    ]);
    expect(exitViews(yard, [yard])[0]?.targetName).toBeUndefined();
  });

  it('has no exits for no scene', () => {
    expect(exitViews(undefined, [])).toEqual([]);
  });
});

describe('describeExit', () => {
  it('says the label and where it goes, and admits a missing target', () => {
    expect(describeExit({ label: 'Gate', targetName: 'Keep' })).toBe(
      'Exit: Gate, to Keep',
    );
    expect(describeExit({ label: 'Gate', targetName: undefined })).toBe(
      'Exit: Gate, to a scene that is gone',
    );
  });
});

describe('exitAt', () => {
  const exit = (id: string, x: number, y: number) => ({
    id,
    label: id,
    x,
    y,
    targetSceneId: 's',
    targetName: 'S',
  });

  it('finds the exit under a point, within its reach', () => {
    const exits = [exit('a', 100, 100)];
    expect(exitAt(exits, { x: 120, y: 100 }, 30)?.id).toBe('a');
    expect(exitAt(exits, { x: 140, y: 100 }, 30)).toBeUndefined();
  });

  it('prefers the one drawn on top', () => {
    const exits = [exit('under', 100, 100), exit('over', 105, 100)];
    expect(exitAt(exits, { x: 102, y: 100 }, 30)?.id).toBe('over');
  });
});

describe('arrivalPoint', () => {
  it('is the target’s own exit back to where the party came from', () => {
    const yard = makeScene('Yard');
    const keep = makeScene('Keep', [
      { label: 'Elsewhere', x: 9, y: 9, targetSceneId: crypto.randomUUID() },
      { label: 'Gate', x: 300, y: 400, targetSceneId: yard.id },
    ]);
    expect(arrivalPoint(keep, yard.id)).toEqual({ x: 300, y: 400 });
  });

  it('is nothing when there is no way back, so the server uses the middle', () => {
    expect(arrivalPoint(makeScene('Keep'), crypto.randomUUID())).toBeUndefined();
    expect(arrivalPoint(undefined, crypto.randomUUID())).toBeUndefined();
  });
});
