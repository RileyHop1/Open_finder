import { describe, expect, it } from 'vitest';

import {
  classEntrySchema,
  classFeatureEntrySchema,
  proficiencyProgressionSchema,
  rankAtLevel,
} from './class.js';

describe('proficiencyProgressionSchema', () => {
  it('accepts a full progression in strictly increasing order', () => {
    const result = proficiencyProgressionSchema.safeParse({
      trained: 1,
      expert: 5,
      master: 11,
      legendary: 17,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a partial progression (only trained, e.g. a category the class never masters)', () => {
    expect(proficiencyProgressionSchema.safeParse({ trained: 1 }).success).toBe(true);
  });

  it('accepts an entirely empty progression -- never trained in this category at all', () => {
    expect(proficiencyProgressionSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a rank present with no lower rank set -- starting directly at expert at level 1', () => {
    // A Fighter's martial-weapon progression: level 1 is a starting point,
    // not a rank-up event, so there is no separate "trained" moment to
    // record -- the character simply starts at expert.
    expect(proficiencyProgressionSchema.safeParse({ expert: 1 }).success).toBe(true);
  });

  it('accepts legendary set without master, for the same reason', () => {
    expect(
      proficiencyProgressionSchema.safeParse({ trained: 1, expert: 5, legendary: 17 })
        .success,
    ).toBe(true);
  });

  it('rejects ranks that do not strictly increase', () => {
    expect(
      proficiencyProgressionSchema.safeParse({ trained: 5, expert: 5 }).success,
    ).toBe(false);
    expect(
      proficiencyProgressionSchema.safeParse({ trained: 5, expert: 3 }).success,
    ).toBe(false);
  });

  it('rejects a level outside 1-20', () => {
    expect(proficiencyProgressionSchema.safeParse({ trained: 0 }).success).toBe(false);
    expect(proficiencyProgressionSchema.safeParse({ trained: 21 }).success).toBe(false);
  });
});

describe('rankAtLevel', () => {
  const progression = { trained: 1, expert: 5, master: 11, legendary: 17 };

  it('returns untrained for an entirely empty progression (never trained in this category)', () => {
    expect(rankAtLevel({}, 10)).toBe('untrained');
  });

  it('returns the highest rank reached at each threshold level', () => {
    expect(rankAtLevel(progression, 1)).toBe('trained');
    expect(rankAtLevel(progression, 4)).toBe('trained');
    expect(rankAtLevel(progression, 5)).toBe('expert');
    expect(rankAtLevel(progression, 10)).toBe('expert');
    expect(rankAtLevel(progression, 11)).toBe('master');
    expect(rankAtLevel(progression, 16)).toBe('master');
    expect(rankAtLevel(progression, 17)).toBe('legendary');
    expect(rankAtLevel(progression, 20)).toBe('legendary');
  });

  it('returns untrained for a level before any rank is reached', () => {
    expect(rankAtLevel({ trained: 5 }, 1)).toBe('untrained');
  });

  it('handles a rank present with no lower rank set -- a Fighter starting at expert', () => {
    expect(rankAtLevel({ expert: 1 }, 1)).toBe('expert');
  });
});

function makeClass(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'classes',
    slug: 'fighter',
    name: 'Fighter',
    kind: 'class',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    keyAttributeOptions: ['str', 'dex'],
    hpPerLevel: 10,
    proficiencies: {
      perception: { trained: 1, expert: 5 },
      savingThrows: {
        fortitude: { trained: 1, expert: 5, master: 11 },
        reflex: { trained: 1 },
        will: { trained: 1 },
      },
      classDc: { trained: 1 },
      weapons: {
        // Starting directly at expert, level 1 -- see proficiencyProgressionSchema's doc.
        unarmed: { expert: 1 },
        simple: { expert: 1 },
        martial: { expert: 1 },
        advanced: { trained: 1 },
      },
      armor: {
        unarmored: { trained: 1 },
        light: { trained: 1 },
        medium: { trained: 1 },
        heavy: { trained: 1 },
      },
    },
    skills: { trainedSkillCount: 3, automaticallyTrained: [] },
    ...overrides,
  };
}

describe('classEntrySchema', () => {
  it('accepts a fighter-shaped class: a choice of key attribute, dense proficiencies', () => {
    const result = classEntrySchema.safeParse(makeClass());
    expect(result.success).toBe(true);
  });

  it('accepts a wizard-shaped class: a single fixed key attribute, low hp', () => {
    const result = classEntrySchema.safeParse(
      makeClass({
        slug: 'wizard',
        name: 'Wizard',
        keyAttributeOptions: ['int'],
        hpPerLevel: 6,
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts automaticallyTrained skills', () => {
    const result = classEntrySchema.safeParse(
      makeClass({
        slug: 'barbarian',
        name: 'Barbarian',
        skills: { trainedSkillCount: 3, automaticallyTrained: ['athletics'] },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an empty keyAttributeOptions -- every class has at least one', () => {
    expect(
      classEntrySchema.safeParse(makeClass({ keyAttributeOptions: [] })).success,
    ).toBe(false);
  });

  it('rejects a non-positive hpPerLevel', () => {
    expect(classEntrySchema.safeParse(makeClass({ hpPerLevel: 0 })).success).toBe(false);
  });

  it('rejects an invalid progression nested inside proficiencies', () => {
    const invalid = makeClass();
    (invalid as { proficiencies: { classDc: unknown } }).proficiencies.classDc = {
      trained: 5,
      expert: 3, // non-increasing -- invalid regardless of where it's nested
    };
    expect(classEntrySchema.safeParse(invalid).success).toBe(false);
  });
});

describe('classFeatureEntrySchema', () => {
  function makeClassFeature(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      packId: 'class-features',
      slug: 'reactive-strike',
      name: 'Reactive Strike',
      kind: 'classFeature',
      provenance: {
        publication: 'Pathfinder Player Core',
        license: 'ORC',
        remaster: true,
      },
      classSlug: 'fighter',
      level: 1,
      ...overrides,
    };
  }

  it('accepts a well-formed class feature', () => {
    expect(classFeatureEntrySchema.safeParse(makeClassFeature()).success).toBe(true);
  });

  it('rejects level 0', () => {
    expect(
      classFeatureEntrySchema.safeParse(makeClassFeature({ level: 0 })).success,
    ).toBe(false);
  });

  it('rejects level 21 -- past the level cap', () => {
    expect(
      classFeatureEntrySchema.safeParse(makeClassFeature({ level: 21 })).success,
    ).toBe(false);
  });
});
