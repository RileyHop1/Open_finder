import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });

describe('scene.create', () => {
  it('accepts a name and each kind, and trims the name', () => {
    for (const kind of ['overworld', 'area', 'battle']) {
      expect(op('scene.create', { name: 'The Crypt', kind }).success).toBe(true);
    }
    const parsed = op('scene.create', { name: '  The Crypt  ', kind: 'battle' });
    expect(parsed.success && parsed.data.payload).toEqual({
      name: 'The Crypt',
      kind: 'battle',
    });
  });

  it('rejects a blank or overlong name, an unknown kind, and a missing field', () => {
    expect(op('scene.create', { name: '   ', kind: 'battle' }).success).toBe(false);
    expect(op('scene.create', { name: 'x'.repeat(101), kind: 'battle' }).success).toBe(
      false,
    );
    expect(op('scene.create', { name: 'Crypt', kind: 'dungeon' }).success).toBe(false);
    expect(op('scene.create', { name: 'Crypt' }).success).toBe(false);
  });

  it('drops anything else a client adds, so it cannot supply the scene itself', () => {
    const parsed = op('scene.create', {
      name: 'Crypt',
      kind: 'area',
      permissions: { default: 'owner' },
      width: 9,
    });
    expect(parsed.success && parsed.data.payload).toEqual({
      name: 'Crypt',
      kind: 'area',
    });
  });
});

describe('scene.update', () => {
  const sceneId = crypto.randomUUID();
  const update = (changes: unknown) => op('scene.update', { sceneId, changes });

  it('accepts each changeable field on its own', () => {
    expect(update({ name: 'Renamed' }).success).toBe(true);
    expect(update({ kind: 'area' }).success).toBe(true);
    expect(update({ width: 4000 }).success).toBe(true);
    expect(update({ height: 3000 }).success).toBe(true);
    expect(update({ background: `${'a'.repeat(64)}.png` }).success).toBe(true);
    expect(update({ grid: { size: 70 } }).success).toBe(true);
  });

  it('clears the background with null', () => {
    const parsed = update({ background: null });
    expect(parsed.success && parsed.data.payload).toMatchObject({
      changes: { background: null },
    });
  });

  it('accepts several fields at once, and a partial grid', () => {
    expect(
      update({ name: 'Crypt', width: 2000, grid: { size: 70, offsetX: -12 } }).success,
    ).toBe(true);
  });

  it('does not fill in grid defaults, so changing one field cannot reset another', () => {
    const parsed = update({ grid: { size: 70 } });
    // Exactly `{ size: 70 }`: no type, distance, or offsets filled in beside it.
    expect(parsed.success && parsed.data.payload).toEqual({
      sceneId,
      changes: { grid: { size: 70 } },
    });
  });

  it('rejects an empty change, an empty grid change, and an unknown field', () => {
    expect(update({}).success).toBe(false);
    expect(update({ grid: {} }).success).toBe(false);
    expect(update({ links: [] }).success).toBe(false);
    expect(update({ permissions: { default: 'owner' } }).success).toBe(false);
    expect(update({ grid: { colour: 'red' } }).success).toBe(false);
  });

  it('rejects out-of-range values', () => {
    expect(update({ name: '' }).success).toBe(false);
    expect(update({ width: 99 }).success).toBe(false);
    expect(update({ height: 32_001 }).success).toBe(false);
    expect(update({ width: 1000.5 }).success).toBe(false);
    expect(update({ background: '' }).success).toBe(false);
    expect(update({ grid: { size: 9 } }).success).toBe(false);
    expect(update({ grid: { distance: 0 } }).success).toBe(false);
    expect(update({ grid: { type: 'hex' } }).success).toBe(false);
  });

  it('rejects a malformed scene id and a missing changes field', () => {
    expect(op('scene.update', { sceneId: 'nope', changes: { name: 'x' } }).success).toBe(
      false,
    );
    expect(op('scene.update', { sceneId }).success).toBe(false);
  });
});

describe('scene.delete', () => {
  it('accepts a scene id and rejects a malformed or missing one', () => {
    expect(op('scene.delete', { sceneId: crypto.randomUUID() }).success).toBe(true);
    expect(op('scene.delete', { sceneId: 'nope' }).success).toBe(false);
    expect(op('scene.delete', {}).success).toBe(false);
  });
});

describe('scene.addLink', () => {
  const sceneId = crypto.randomUUID();
  const link = (overrides: Record<string, unknown> = {}) => ({
    sceneId,
    label: 'To the cellar',
    x: 400,
    y: 250,
    targetSceneId: crypto.randomUUID(),
    ...overrides,
  });

  it('accepts an exit and trims its label', () => {
    expect(op('scene.addLink', link()).success).toBe(true);
    const parsed = op('scene.addLink', link({ label: '  Down  ' }));
    expect(parsed.success && parsed.data.payload).toMatchObject({ label: 'Down' });
  });

  it('accepts a point on the scene edge', () => {
    expect(op('scene.addLink', link({ x: 0, y: 0 })).success).toBe(true);
    expect(op('scene.addLink', link({ x: 32_000, y: 32_000 })).success).toBe(true);
  });

  it('rejects a blank or overlong label, a point off the largest scene, and a malformed id', () => {
    expect(op('scene.addLink', link({ label: '   ' })).success).toBe(false);
    expect(op('scene.addLink', link({ label: 'x'.repeat(101) })).success).toBe(false);
    expect(op('scene.addLink', link({ x: -1 })).success).toBe(false);
    expect(op('scene.addLink', link({ y: 32_001 })).success).toBe(false);
    expect(op('scene.addLink', link({ x: Number.NaN })).success).toBe(false);
    expect(op('scene.addLink', link({ sceneId: 'nope' })).success).toBe(false);
    expect(op('scene.addLink', link({ targetSceneId: 'nope' })).success).toBe(false);
  });

  it('does not let a client choose the link id', () => {
    const parsed = op('scene.addLink', link({ id: crypto.randomUUID() }));
    expect(parsed.success && parsed.data.payload).not.toHaveProperty('id');
  });
});

describe('scene.activate', () => {
  const sceneId = crypto.randomUUID();

  it('accepts a scene on its own, or with an arrival point', () => {
    expect(op('scene.activate', { sceneId }).success).toBe(true);
    expect(op('scene.activate', { sceneId, at: { x: 350, y: 450 } }).success).toBe(true);
    expect(op('scene.activate', { sceneId, at: { x: 0, y: 32_000 } }).success).toBe(true);
  });

  it('rejects a malformed scene id, a half arrival point, and one off the largest scene', () => {
    expect(op('scene.activate', { sceneId: 'nope' }).success).toBe(false);
    expect(op('scene.activate', {}).success).toBe(false);
    expect(op('scene.activate', { sceneId, at: { x: 10 } }).success).toBe(false);
    expect(op('scene.activate', { sceneId, at: { x: -1, y: 10 } }).success).toBe(false);
    expect(op('scene.activate', { sceneId, at: { x: 10, y: 32_001 } }).success).toBe(
      false,
    );
    expect(op('scene.activate', { sceneId, at: { x: Number.NaN, y: 1 } }).success).toBe(
      false,
    );
  });

  it('keeps nothing else a client adds, so it cannot choose who is placed or where they stand', () => {
    const parsed = op('scene.activate', { sceneId, members: ['x'], permissions: {} });
    expect(parsed.success && parsed.data.payload).toEqual({ sceneId });
  });
});

describe('scene.removeLink', () => {
  it('accepts a scene and link id and rejects a malformed or missing one', () => {
    const ids = { sceneId: crypto.randomUUID(), linkId: crypto.randomUUID() };
    expect(op('scene.removeLink', ids).success).toBe(true);
    expect(op('scene.removeLink', { ...ids, linkId: 'nope' }).success).toBe(false);
    expect(op('scene.removeLink', { sceneId: ids.sceneId }).success).toBe(false);
  });
});
