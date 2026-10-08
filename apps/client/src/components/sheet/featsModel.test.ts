import type { CharacterItem } from '@hearthtable/pf2e';
import { describe, expect, it } from 'vitest';

import { featGroups, spellGroups, termKindOf } from './featsModel.js';

const NOW = '2026-10-01T00:00:00.000Z';

function item(entry: Record<string, unknown>): CharacterItem {
  return {
    id: crypto.randomUUID(),
    equipped: false,
    quantity: 1,
    entry: {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      packId: 'x',
      slug: String(entry.name).toLowerCase(),
      traits: [],
      ruleElements: [],
      description: '',
      ...entry,
    },
  } as unknown as CharacterItem;
}

const feat = (name: string, category: string, level: number) =>
  item({ kind: 'feat', name, category, level, prerequisites: [] });

describe('featGroups', () => {
  it('orders groups features, feat categories, actions, and sorts by level then name', () => {
    const groups = featGroups([
      feat('Zeta', 'general', 3),
      item({ kind: 'action', name: 'Stride' }),
      feat('Beta', 'class', 2),
      feat('Alpha', 'class', 2),
      feat('Early', 'class', 1),
      item({ kind: 'classFeature', name: 'Rage', level: 1, classSlug: 'barbarian' }),
      feat('Tongue', 'ancestry', 1),
    ]);
    expect(groups.map((g) => g.heading)).toEqual([
      'Class features',
      'Ancestry feats',
      'Class feats',
      'General feats',
      'Actions',
    ]);
    expect(groups[2]?.items.map((i) => i.entry.name)).toEqual(['Early', 'Alpha', 'Beta']);
  });

  it('leaves out empty groups and ignores gear and spells', () => {
    expect(
      featGroups([
        item({ kind: 'gear', name: 'Rope' }),
        item({ kind: 'spell', name: 'Zap', rank: 1 }),
      ]),
    ).toEqual([]);
  });
});

describe('spellGroups', () => {
  it('groups by rank, lowest first, sorted by name', () => {
    const groups = spellGroups([
      item({ kind: 'spell', name: 'Bolt', rank: 2 }),
      item({ kind: 'spell', name: 'Spark', rank: 1 }),
      item({ kind: 'spell', name: 'Arc', rank: 2 }),
    ]);
    expect(groups.map((g) => g.heading)).toEqual(['Rank 1', 'Rank 2']);
    expect(groups[1]?.items.map((i) => i.entry.name)).toEqual(['Arc', 'Bolt']);
  });
});

describe('termKindOf', () => {
  it('has a tooltip kind for feats, spells and actions, but not class features', () => {
    expect(termKindOf('feat')).toBe('feat');
    expect(termKindOf('spell')).toBe('spell');
    expect(termKindOf('action')).toBe('action');
    expect(termKindOf('classFeature')).toBeUndefined();
  });
});
