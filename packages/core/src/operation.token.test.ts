import { describe, expect, it } from 'vitest';

import { clientOperationUnionSchema } from './operation.js';

const op = (type: string, payload: unknown) =>
  clientOperationUnionSchema.safeParse({ id: crypto.randomUUID(), type, payload });

describe('token.create', () => {
  const ids = () => ({ sceneId: crypto.randomUUID(), actorId: crypto.randomUUID() });

  it('accepts a scene and an actor on their own, with a position, or hidden', () => {
    expect(op('token.create', ids()).success).toBe(true);
    expect(op('token.create', { ...ids(), at: { x: 350, y: 450 } }).success).toBe(true);
    expect(op('token.create', { ...ids(), hidden: true }).success).toBe(true);
    expect(
      op('token.create', { ...ids(), at: { x: 0, y: 32_000 }, hidden: false }).success,
    ).toBe(true);
  });

  it('rejects a malformed id, a half position, and one off the largest scene', () => {
    expect(op('token.create', { ...ids(), sceneId: 'nope' }).success).toBe(false);
    expect(op('token.create', { ...ids(), actorId: 'nope' }).success).toBe(false);
    expect(op('token.create', { sceneId: crypto.randomUUID() }).success).toBe(false);
    expect(op('token.create', { ...ids(), at: { x: 10 } }).success).toBe(false);
    expect(op('token.create', { ...ids(), at: { x: -1, y: 5 } }).success).toBe(false);
    expect(op('token.create', { ...ids(), at: { x: 5, y: 32_001 } }).success).toBe(false);
    expect(op('token.create', { ...ids(), hidden: 'yes' }).success).toBe(false);
  });

  it('drops anything else a client sends, so it cannot choose the size or who may see it', () => {
    const parsed = op('token.create', {
      ...ids(),
      size: 12,
      permissions: { default: 'owner' },
    });
    expect(parsed.success && parsed.data.payload).not.toHaveProperty('size');
    expect(parsed.success && parsed.data.payload).not.toHaveProperty('permissions');
  });
});

describe('token.update', () => {
  const tokenId = crypto.randomUUID();
  const update = (changes: unknown) => op('token.update', { tokenId, changes });

  it('accepts each changeable field on its own, and several together', () => {
    expect(update({ hidden: true }).success).toBe(true);
    expect(update({ size: 2 }).success).toBe(true);
    expect(update({ name: 'Goblin 2' }).success).toBe(true);
    expect(update({ hidden: false, size: 3, name: 'Boss' }).success).toBe(true);
  });

  it('clears the label with null, and trims it', () => {
    const cleared = update({ name: null });
    expect(cleared.success && cleared.data.payload).toMatchObject({
      changes: { name: null },
    });
    const trimmed = update({ name: '  Goblin 2  ' });
    expect(trimmed.success && trimmed.data.payload).toMatchObject({
      changes: { name: 'Goblin 2' },
    });
  });

  it('rejects an empty change, an unknown field, and position (moving has its own operation)', () => {
    expect(update({}).success).toBe(false);
    expect(update({ permissions: { default: 'owner' } }).success).toBe(false);
    expect(update({ x: 100, y: 100 }).success).toBe(false);
    expect(update({ actorId: crypto.randomUUID() }).success).toBe(false);
  });

  it('rejects an out-of-range size, a blank label, and a malformed id', () => {
    expect(update({ size: 0 }).success).toBe(false);
    expect(update({ size: 1.5 }).success).toBe(false);
    expect(update({ size: 13 }).success).toBe(false);
    expect(update({ name: '   ' }).success).toBe(false);
    expect(update({ name: 'x'.repeat(101) }).success).toBe(false);
    expect(update({ hidden: 'yes' }).success).toBe(false);
    expect(
      op('token.update', { tokenId: 'nope', changes: { hidden: true } }).success,
    ).toBe(false);
    expect(op('token.update', { tokenId }).success).toBe(false);
  });
});

describe('token.move', () => {
  const tokenId = crypto.randomUUID();

  it('accepts a token and a point, including the scene edge', () => {
    expect(op('token.move', { tokenId, x: 350, y: 450 }).success).toBe(true);
    expect(op('token.move', { tokenId, x: 0, y: 32_000 }).success).toBe(true);
    expect(op('token.move', { tokenId, x: 12.5, y: 7.25 }).success).toBe(true);
  });

  it('rejects a malformed id, a missing coordinate, and a point off the largest scene', () => {
    expect(op('token.move', { tokenId: 'nope', x: 1, y: 1 }).success).toBe(false);
    expect(op('token.move', { tokenId, x: 1 }).success).toBe(false);
    expect(op('token.move', { tokenId, x: -1, y: 1 }).success).toBe(false);
    expect(op('token.move', { tokenId, x: 1, y: 32_001 }).success).toBe(false);
    expect(op('token.move', { tokenId, x: Number.NaN, y: 1 }).success).toBe(false);
    expect(op('token.move', { tokenId, x: Number.POSITIVE_INFINITY, y: 1 }).success).toBe(
      false,
    );
  });

  it('keeps only the move, so a client cannot change anything else with it', () => {
    const parsed = op('token.move', { tokenId, x: 1, y: 1, hidden: false, size: 12 });
    expect(parsed.success && parsed.data.payload).toEqual({ tokenId, x: 1, y: 1 });
  });
});

describe('token.delete', () => {
  it('accepts a token id and rejects a malformed or missing one', () => {
    expect(op('token.delete', { tokenId: crypto.randomUUID() }).success).toBe(true);
    expect(op('token.delete', { tokenId: 'nope' }).success).toBe(false);
    expect(op('token.delete', {}).success).toBe(false);
  });
});
