import { describe, expect, it } from 'vitest';

import { sceneSchema } from './scene.js';

function sceneFields() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    worldId: crypto.randomUUID(),
    type: 'scene' as const,
    permissions: { default: 'none' as const },
    name: 'The Invented Crypt',
    kind: 'battle' as const,
  };
}

describe('sceneSchema', () => {
  it('fills in a blank 2000px scene with a 100px, 5-foot square grid and no links', () => {
    const parsed = sceneSchema.parse(sceneFields());
    expect(parsed.width).toBe(2000);
    expect(parsed.height).toBe(2000);
    expect(parsed.grid).toEqual({
      type: 'square',
      size: 100,
      distance: 5,
      offsetX: 0,
      offsetY: 0,
    });
    expect(parsed.links).toEqual([]);
    expect(parsed.background).toBeUndefined();
  });

  it('accepts all three kinds and rejects an unknown one', () => {
    for (const kind of ['overworld', 'area', 'battle']) {
      expect(sceneSchema.safeParse({ ...sceneFields(), kind }).success).toBe(true);
    }
    expect(sceneSchema.safeParse({ ...sceneFields(), kind: 'dungeon' }).success).toBe(
      false,
    );
  });

  it('accepts a background asset name and an explicit grid, and keeps them', () => {
    const background = `${'a'.repeat(64)}.png`;
    const parsed = sceneSchema.parse({
      ...sceneFields(),
      background,
      grid: { type: 'none', size: 70, distance: 10, offsetX: -12, offsetY: 30 },
    });
    expect(parsed.background).toBe(background);
    expect(parsed.grid).toEqual({
      type: 'none',
      size: 70,
      distance: 10,
      offsetX: -12,
      offsetY: 30,
    });
  });

  it('rejects an empty name, an empty background, and out-of-range sizes', () => {
    expect(sceneSchema.safeParse({ ...sceneFields(), name: '' }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...sceneFields(), background: '' }).success).toBe(
      false,
    );
    expect(sceneSchema.safeParse({ ...sceneFields(), width: 99 }).success).toBe(false);
    expect(sceneSchema.safeParse({ ...sceneFields(), height: 32_001 }).success).toBe(
      false,
    );
    expect(sceneSchema.safeParse({ ...sceneFields(), width: 1000.5 }).success).toBe(
      false,
    );
  });

  it('rejects a grid that is too small, too large, or measures no distance', () => {
    const withGrid = (grid: object) => sceneSchema.safeParse({ ...sceneFields(), grid });
    expect(withGrid({ size: 9 }).success).toBe(false);
    expect(withGrid({ size: 1001 }).success).toBe(false);
    expect(withGrid({ distance: 0 }).success).toBe(false);
    expect(withGrid({ type: 'hex' }).success).toBe(false);
  });

  describe('links', () => {
    const link = () => ({
      id: crypto.randomUUID(),
      label: 'To the cellar',
      x: 400,
      y: 250,
      targetSceneId: crypto.randomUUID(),
    });

    it('accepts links and keeps their order', () => {
      const links = [link(), link()];
      expect(sceneSchema.parse({ ...sceneFields(), links }).links).toEqual(links);
    });

    it('rejects the same link id twice, a missing label, and a malformed target', () => {
      const first = link();
      expect(
        sceneSchema.safeParse({ ...sceneFields(), links: [first, first] }).success,
      ).toBe(false);
      expect(
        sceneSchema.safeParse({ ...sceneFields(), links: [{ ...link(), label: '' }] })
          .success,
      ).toBe(false);
      expect(
        sceneSchema.safeParse({
          ...sceneFields(),
          links: [{ ...link(), targetSceneId: 'nope' }],
        }).success,
      ).toBe(false);
    });

    it('rejects a link outside the largest possible scene', () => {
      expect(
        sceneSchema.safeParse({ ...sceneFields(), links: [{ ...link(), x: -1 }] })
          .success,
      ).toBe(false);
      expect(
        sceneSchema.safeParse({ ...sceneFields(), links: [{ ...link(), y: 32_001 }] })
          .success,
      ).toBe(false);
    });
  });
});
