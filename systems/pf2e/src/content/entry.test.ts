import { describe, expect, it } from 'vitest';

import { PF2E_ENTRY_KINDS, pf2eEntrySchema } from './entry.js';

const base = {
  id: crypto.randomUUID(),
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  provenance: { publication: 'Pathfinder Player Core', license: 'ORC', remaster: true },
};

// One minimal, well-formed entry per kind -- proves the union routes each
// `kind` to its own schema's specific requirements, not just to "any object
// with the right traits/description/ruleElements".
const minimalEntryByKind: Record<
  (typeof PF2E_ENTRY_KINDS)[number],
  Record<string, unknown>
> = {
  action: {
    ...base,
    packId: 'actions',
    slug: 'escape',
    name: 'Escape',
    kind: 'action',
    actionCost: 'one',
  },
  feat: {
    ...base,
    packId: 'feats',
    slug: 'toughness',
    name: 'Toughness',
    kind: 'feat',
    level: 1,
    category: 'general',
  },
  weapon: {
    ...base,
    packId: 'equipment',
    slug: 'longsword',
    name: 'Longsword',
    kind: 'weapon',
    category: 'martial',
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
  },
  armor: {
    ...base,
    packId: 'equipment',
    slug: 'chain-shirt',
    name: 'Chain Shirt',
    kind: 'armor',
    category: 'light',
    group: 'chain',
    acBonus: 2,
  },
  gear: {
    ...base,
    packId: 'equipment',
    slug: 'grappling-hook',
    name: 'Grappling Hook',
    kind: 'gear',
  },
  spell: {
    ...base,
    packId: 'spells',
    slug: 'magic-missile',
    name: 'Magic Missile',
    kind: 'spell',
    rank: 1,
    traditions: ['arcane'],
    castTime: 'two',
    range: { kind: 'feet', value: 120 },
  },
  ancestry: {
    ...base,
    packId: 'ancestries',
    slug: 'human',
    name: 'Human',
    kind: 'ancestry',
    hp: 8,
    size: 'medium',
    speed: 25,
  },
  heritage: {
    ...base,
    packId: 'heritages',
    slug: 'rock-dwarf',
    name: 'Rock Dwarf',
    kind: 'heritage',
  },
  background: {
    ...base,
    packId: 'backgrounds',
    slug: 'warrior',
    name: 'Warrior',
    kind: 'background',
    boostOptions: ['str'],
    trainedSkills: ['athletics'],
  },
  class: {
    ...base,
    packId: 'classes',
    slug: 'fighter',
    name: 'Fighter',
    kind: 'class',
    keyAttributeOptions: ['str', 'dex'],
    hpPerLevel: 10,
    proficiencies: {
      perception: { trained: 1 },
      savingThrows: {
        fortitude: { trained: 1 },
        reflex: { trained: 1 },
        will: { trained: 1 },
      },
      classDc: { trained: 1 },
      weapons: {
        unarmed: { trained: 1 },
        simple: { trained: 1 },
        martial: { trained: 1 },
        advanced: { trained: 1 },
      },
      armor: {
        unarmored: { trained: 1 },
        light: { trained: 1 },
        medium: { trained: 1 },
        heavy: { trained: 1 },
      },
    },
    skills: { trainedSkillCount: 3 },
  },
  classFeature: {
    ...base,
    packId: 'class-features',
    slug: 'reactive-strike',
    name: 'Reactive Strike',
    kind: 'classFeature',
    classSlug: 'fighter',
    level: 1,
  },
  creature: {
    ...base,
    packId: 'creatures',
    slug: 'quill-stalker',
    name: 'Quill Stalker',
    kind: 'creature',
    level: 2,
    size: 'small',
    perception: 8,
    ac: 18,
    savingThrows: { fortitude: 7, reflex: 9, will: 5 },
    hp: 30,
    speeds: { land: 25 },
    attributes: { str: 2, dex: 4, con: 2, int: -3, wis: 1, cha: -1 },
  },
  condition: {
    ...base,
    packId: 'conditions',
    slug: 'frightened',
    name: 'Frightened',
    kind: 'condition',
    valued: true,
  },
};

describe('pf2eEntrySchema', () => {
  it.each(PF2E_ENTRY_KINDS)('accepts a minimal well-formed %s entry', (kind) => {
    const result = pf2eEntrySchema.safeParse(minimalEntryByKind[kind]);
    expect(result.success).toBe(true);
  });

  it('routes to the right schema -- a weapon missing weapon-specific fields is rejected, not silently accepted as some other kind', () => {
    const incomplete = {
      ...base,
      packId: 'equipment',
      slug: 'x',
      name: 'X',
      kind: 'weapon',
    };
    expect(pf2eEntrySchema.safeParse(incomplete).success).toBe(false);
  });

  it('still runs the refined validation on condition through the union', () => {
    // maxValue only applies to a valued condition -- conditionEntrySchema's
    // own .refine(), which must still fire when reached via this union.
    const invalid = {
      ...minimalEntryByKind.condition,
      valued: false,
      maxValue: 4,
    };
    expect(pf2eEntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects a kind outside the thirteen content kinds', () => {
    const result = pf2eEntrySchema.safeParse({
      ...base,
      kind: 'macro',
      slug: 'x',
      name: 'X',
    });
    expect(result.success).toBe(false);
  });

  it('PF2E_ENTRY_KINDS names exactly the kinds the union accepts -- no more, no fewer', () => {
    expect(Object.keys(minimalEntryByKind).sort()).toEqual([...PF2E_ENTRY_KINDS].sort());
  });
});
