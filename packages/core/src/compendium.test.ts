import { describe, expect, it } from 'vitest';

import { compendiumEntrySchema, packManifestSchema } from './compendium.js';

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    packId: 'feats',
    slug: 'toughness',
    name: 'Toughness',
    kind: 'feat',
    provenance: {
      publication: 'Pathfinder Player Core',
      license: 'ORC',
      remaster: true,
    },
    ...overrides,
  };
}

describe('compendiumEntrySchema', () => {
  it('accepts a minimal well-formed entry, defaulting traits/ruleElements/description', () => {
    const result = compendiumEntrySchema.safeParse(makeEntry());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.traits).toEqual([]);
      expect(result.data.ruleElements).toEqual([]);
      expect(result.data.description).toBe('');
    }
  });

  it('accepts an entry with traits, rule elements, and a description', () => {
    const result = compendiumEntrySchema.safeParse(
      makeEntry({
        traits: ['general', 'skill'],
        description: '<p>You have significantly more hit points...</p>',
        ruleElements: [
          {
            kind: 'flatModifier',
            selector: 'hp',
            label: 'Toughness',
            type: 'untyped',
            value: 1,
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('has no worldId and no permissions -- unlike a document', () => {
    const result = compendiumEntrySchema.safeParse(makeEntry());
    expect(result.success).toBe(true);
    if (result.success) {
      expect('worldId' in result.data).toBe(false);
      expect('permissions' in result.data).toBe(false);
    }
  });

  it('rejects an entry with no provenance', () => {
    const { provenance: _provenance, ...rest } = makeEntry();
    expect(compendiumEntrySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an entry whose provenance did not pass the license filter', () => {
    const result = compendiumEntrySchema.safeParse(
      makeEntry({
        provenance: {
          publication: 'Pathfinder Bestiary',
          license: 'OGL',
          remaster: false,
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects an empty slug', () => {
    expect(compendiumEntrySchema.safeParse(makeEntry({ slug: '' })).success).toBe(false);
  });
});

describe('packManifestSchema', () => {
  it('accepts a well-formed manifest', () => {
    const result = packManifestSchema.safeParse({
      packId: 'feats',
      name: 'Feats',
      upstream: {
        repo: 'foundryvtt/pf2e',
        commit: 'afcd141f81e0a1d482d3b85152eb584547560416',
        packsChecksum: 'sha256:abc123',
      },
      entryCount: 1191,
      generatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a zero entryCount (an empty pack is a valid, if unusual, state)', () => {
    const result = packManifestSchema.safeParse({
      packId: 'empty-pack',
      name: 'Empty',
      upstream: { repo: 'foundryvtt/pf2e', commit: 'abc', packsChecksum: 'sha256:x' },
      entryCount: 0,
      generatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative entryCount', () => {
    const result = packManifestSchema.safeParse({
      packId: 'feats',
      name: 'Feats',
      upstream: { repo: 'foundryvtt/pf2e', commit: 'abc', packsChecksum: 'sha256:x' },
      entryCount: -1,
      generatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
