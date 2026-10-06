import { describe, expect, it } from 'vitest';

import { tokenSchema } from './token.js';

function tokenFields() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    worldId: crypto.randomUUID(),
    type: 'token' as const,
    permissions: { default: 'observer' as const },
    sceneId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    x: 250,
    y: 350,
  };
}

describe('tokenSchema', () => {
  it('defaults to a one-square, visible token with no label', () => {
    const parsed = tokenSchema.parse(tokenFields());
    expect(parsed.size).toBe(1);
    expect(parsed.hidden).toBe(false);
    expect(parsed.name).toBeUndefined();
  });

  it('hides the HP bar from players by default and keeps a server-set percentage', () => {
    const parsed = tokenSchema.parse(tokenFields());
    expect(parsed.showHpBar).toBe(false);
    expect(parsed.hpBar).toBeUndefined();
    const shown = tokenSchema.parse({
      ...tokenFields(),
      showHpBar: true,
      hpBar: { percent: 40 },
    });
    expect(shown).toMatchObject({ showHpBar: true, hpBar: { percent: 40 } });
  });

  it('rejects an HP percentage outside 0 to 100', () => {
    for (const percent of [-1, 101, Number.NaN]) {
      expect(
        tokenSchema.safeParse({ ...tokenFields(), hpBar: { percent } }).success,
      ).toBe(false);
    }
    for (const percent of [0, 100]) {
      expect(
        tokenSchema.safeParse({ ...tokenFields(), hpBar: { percent } }).success,
      ).toBe(true);
    }
  });

  it('keeps a label, a footprint, and the hidden flag', () => {
    const parsed = tokenSchema.parse({
      ...tokenFields(),
      name: 'Goblin 2',
      size: 2,
      hidden: true,
    });
    expect(parsed).toMatchObject({ name: 'Goblin 2', size: 2, hidden: true });
  });

  it('rejects an empty label and a footprint of zero, a fraction, or too many squares', () => {
    expect(tokenSchema.safeParse({ ...tokenFields(), name: '' }).success).toBe(false);
    expect(tokenSchema.safeParse({ ...tokenFields(), size: 0 }).success).toBe(false);
    expect(tokenSchema.safeParse({ ...tokenFields(), size: 1.5 }).success).toBe(false);
    expect(tokenSchema.safeParse({ ...tokenFields(), size: 13 }).success).toBe(false);
  });

  it('rejects a position that is negative, beyond the largest scene, or not a number', () => {
    expect(tokenSchema.safeParse({ ...tokenFields(), x: -1 }).success).toBe(false);
    expect(tokenSchema.safeParse({ ...tokenFields(), y: 32_001 }).success).toBe(false);
    expect(tokenSchema.safeParse({ ...tokenFields(), x: Number.NaN }).success).toBe(
      false,
    );
  });

  it('accepts a position on the scene edge and fractional pixels', () => {
    expect(tokenSchema.safeParse({ ...tokenFields(), x: 0, y: 32_000 }).success).toBe(
      true,
    );
    expect(tokenSchema.safeParse({ ...tokenFields(), x: 12.5, y: 7.25 }).success).toBe(
      true,
    );
  });

  it('rejects a malformed scene or actor id', () => {
    expect(tokenSchema.safeParse({ ...tokenFields(), sceneId: 'nope' }).success).toBe(
      false,
    );
    expect(tokenSchema.safeParse({ ...tokenFields(), actorId: 'nope' }).success).toBe(
      false,
    );
  });
});
