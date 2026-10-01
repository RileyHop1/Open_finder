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
