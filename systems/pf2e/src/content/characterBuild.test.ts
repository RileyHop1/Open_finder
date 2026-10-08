import { describe, expect, it } from 'vitest';

import { characterDataSchema, newCharacterData } from './character.js';
import { characterBuildSchema } from './characterBuild.js';

describe('characterBuildSchema', () => {
  it('parses an empty build to all defaults', () => {
    expect(characterBuildSchema.parse({})).toEqual({
      flaws: [],
      boosts: [],
      trainedSkills: [],
      skillIncreases: [],
      feats: [],
      languages: [],
      classChoices: {},
    });
  });

  it('stores choices without judging them: a repeated boost and an odd slot are both fine', () => {
    const build = characterBuildSchema.parse({
      ancestry: { packId: 'ancestries', slug: 'invented-folk' },
      boosts: [
        { level: 1, source: 'free', attributes: ['str', 'str'] },
        { level: 5, source: 'free', attributes: ['dex'] },
      ],
      feats: [{ slot: 'general', level: 1, feat: { packId: 'feats', slug: 'x' } }],
    });
    expect(build.boosts[0]?.attributes).toEqual(['str', 'str']);
    expect(build.feats[0]?.slot).toBe('general');
  });

  it('rejects a malformed record', () => {
    expect(
      characterBuildSchema.safeParse({
        boosts: [{ level: 2, source: 'free', attributes: ['str'] }],
      }).success,
    ).toBe(false);
    expect(
      characterBuildSchema.safeParse({
        boosts: [{ level: 1, source: 'free', attributes: [] }],
      }).success,
    ).toBe(false);
    expect(
      characterBuildSchema.safeParse({
        feats: [{ slot: 'bonus', level: 1, feat: { packId: 'a', slug: 'b' } }],
      }).success,
    ).toBe(false);
  });
});

describe('a character’s build', () => {
  it('is optional: a hand-built character has none, and still parses', () => {
    const parsed = characterDataSchema.parse(newCharacterData());
    expect(parsed.build).toBeUndefined();
  });

  it('is kept when present', () => {
    const parsed = characterDataSchema.parse({
      ...newCharacterData(),
      build: { class: { packId: 'classes', slug: 'invented' } },
    });
    expect(parsed.build?.class?.slug).toBe('invented');
  });
});
