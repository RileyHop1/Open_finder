import { describe, expect, it } from 'vitest';

import type { Attribute, ProficiencyRank } from '../content/common.js';
import { characterDataSchema, newCharacterData } from '../content/character.js';
import { prepareCharacter } from './prepareCharacter.js';

// Everything below is invented (ADR 0013). Numbers are worked out by hand: a
// proficiency modifier is the rank's 2/4/6/8 plus the level.
const ENTRY_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_ID = '00000000-0000-4000-8000-000000000002';

function caster(options: {
  level?: number;
  attribute?: Attribute;
  modifier?: number;
  rank?: ProficiencyRank;
  conditions?: { slug: string; value?: number }[];
  items?: unknown[];
}) {
  const attribute = options.attribute ?? 'int';
  const base = newCharacterData();
  return characterDataSchema.parse({
    ...base,
    level: options.level ?? 1,
    attributes: { ...base.attributes, [attribute]: options.modifier ?? 4 },
    conditions: options.conditions ?? [],
    items: options.items ?? [],
    spellcasting: [
      {
        id: ENTRY_ID,
        kind: 'prepared',
        name: 'Invented casting',
        tradition: 'arcane',
        attribute,
        rank: options.rank ?? 'trained',
      },
    ],
  });
}

const stat = (
  data: ReturnType<typeof caster>,
  which: 'spellAttack' | 'spellDc',
  id = ENTRY_ID,
) => prepareCharacter(data).statistics[`${which}:${id}`];

describe('spell attack and spell DC', () => {
  it('a level 1 caster with +4 and trained: attack +7, DC 17', () => {
    const data = caster({});
    expect(stat(data, 'spellAttack')?.total).toBe(7);
    expect(stat(data, 'spellDc')?.total).toBe(17);
  });

  it('the spellcasting rank sets the proficiency: expert at level 7 is 4 + 7', () => {
    const data = caster({ level: 7, rank: 'expert' });
    expect(stat(data, 'spellAttack')?.total).toBe(4 + 4 + 7);
    expect(stat(data, 'spellDc')?.total).toBe(10 + 4 + 4 + 7);
  });

  it('master at level 15 and legendary at level 19', () => {
    expect(stat(caster({ level: 15, rank: 'master' }), 'spellDc')?.total).toBe(
      10 + 4 + 6 + 15,
    );
    expect(stat(caster({ level: 19, rank: 'legendary' }), 'spellAttack')?.total).toBe(
      4 + 8 + 19,
    );
  });

  it('shows where the number comes from, like every other statistic', () => {
    const modifiers = stat(caster({}), 'spellDc')?.modifiers.map((m) => [
      m.slug,
      m.value,
    ]);
    expect(modifiers).toEqual([
      ['base', 10],
      ['int', 4],
      ['proficiency', 3],
    ]);
    const attack = stat(caster({}), 'spellAttack')?.modifiers.map((m) => m.slug);
    expect(attack).toEqual(['int', 'proficiency']);
  });

  it('has none for a character that does not cast', () => {
    const statistics = prepareCharacter(newCharacterData()).statistics;
    expect(Object.keys(statistics).filter((k) => k.startsWith('spell'))).toEqual([]);
  });

  it('keeps one pair per entry, each from its own attribute and rank', () => {
    const base = caster({});
    const data = characterDataSchema.parse({
      ...base,
      attributes: { ...base.attributes, cha: 3 },
      spellcasting: [
        ...base.spellcasting,
        {
          id: SECOND_ID,
          kind: 'spontaneous',
          name: 'Invented second casting',
          tradition: 'occult',
          attribute: 'cha',
          rank: 'trained',
        },
      ],
    });
    expect(stat(data, 'spellAttack', ENTRY_ID)?.total).toBe(7);
    expect(stat(data, 'spellAttack', SECOND_ID)?.total).toBe(3 + 3);
    expect(stat(data, 'spellDc', SECOND_ID)?.total).toBe(10 + 3 + 3);
  });
});

describe('conditions on spell statistics', () => {
  it('stupefied is a status penalty on both, because the casting attribute is mental', () => {
    const data = caster({ conditions: [{ slug: 'stupefied', value: 1 }] });
    expect(stat(data, 'spellAttack')?.total).toBe(6);
    expect(stat(data, 'spellDc')?.total).toBe(16);
  });

  it('does not touch a casting attribute it does not cover (clumsy on an Intelligence caster)', () => {
    const data = caster({ conditions: [{ slug: 'clumsy', value: 2 }] });
    expect(stat(data, 'spellAttack')?.total).toBe(7);
  });

  it('frightened 2 with stupefied 1 is one -2 status penalty, not -3', () => {
    const data = caster({
      conditions: [
        { slug: 'frightened', value: 2 },
        { slug: 'stupefied', value: 1 },
      ],
    });
    expect(stat(data, 'spellDc')?.total).toBe(15);
  });

  it('prone is a circumstance penalty to the attack roll only, not to the DC', () => {
    const data = caster({ conditions: [{ slug: 'prone' }] });
    expect(stat(data, 'spellAttack')?.total).toBe(5);
    expect(stat(data, 'spellDc')?.total).toBe(17);
  });
});

describe('rule elements on spell statistics', () => {
  const item = (selector: string) => ({
    id: '00000000-0000-4000-8000-0000000000aa',
    equipped: false,
    quantity: 1,
    entry: {
      id: '00000000-0000-4000-8000-0000000000bb',
      schemaVersion: 1,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      packId: 'feats',
      slug: 'invented-focus',
      name: 'Invented Focus',
      kind: 'feat',
      provenance: {
        publication: 'Pathfinder Player Core',
        license: 'ORC',
        remaster: true,
      },
      traits: [],
      description: '',
      level: 1,
      category: 'general',
      prerequisites: [],
      ruleElements: [
        {
          kind: 'flatModifier',
          selector,
          label: 'Invented Focus',
          type: 'item',
          value: 1,
        },
      ],
    },
  });

  it('a spell-dc bonus raises the DC and not the attack roll', () => {
    const data = caster({ items: [item('spell-dc')] });
    expect(stat(data, 'spellDc')?.total).toBe(18);
    expect(stat(data, 'spellAttack')?.total).toBe(7);
  });

  it('a spell-attack bonus raises the attack roll and not the DC', () => {
    const data = caster({ items: [item('spell-attack')] });
    expect(stat(data, 'spellAttack')?.total).toBe(8);
    expect(stat(data, 'spellDc')?.total).toBe(17);
  });
});
