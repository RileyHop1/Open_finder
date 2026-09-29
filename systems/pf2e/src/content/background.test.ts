import { describe, expect, it } from 'vitest';

import { backgroundEntrySchema } from './background.js';

function makeBackground(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'backgrounds',
    slug: 'warrior',
    name: 'Warrior',
    kind: 'background',
    provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
    boostOptions: ['str', 'con'],
    trainedSkills: ['athletics'],
    ...overrides,
  };
}

describe('backgroundEntrySchema', () => {
  it('accepts a minimal well-formed background', () => {
    expect(backgroundEntrySchema.safeParse(makeBackground()).success).toBe(true);
  });

  it('accepts the granted skill feat expressed as a grantItem rule element', () => {
    const result = backgroundEntrySchema.safeParse(
      makeBackground({
        ruleElements: [
          { kind: 'grantItem', packId: 'feats', slug: 'intimidating-glare' },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts a Lore skill as a free-text trained skill', () => {
    const result = backgroundEntrySchema.safeParse(
      makeBackground({ trainedSkills: ['academia-lore'] }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an empty boostOptions array', () => {
    expect(
      backgroundEntrySchema.safeParse(makeBackground({ boostOptions: [] })).success,
    ).toBe(false);
  });

  it('rejects an empty trainedSkills array', () => {
    expect(
      backgroundEntrySchema.safeParse(makeBackground({ trainedSkills: [] })).success,
    ).toBe(false);
  });
});
