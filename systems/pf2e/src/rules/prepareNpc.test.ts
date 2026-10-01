import { describe, expect, it } from 'vitest';

import type { CreatureEntry, CreatureStrike } from '../content/creature.js';
import { newNpcFromCreature, type NpcData } from '../content/npc.js';
import { prepareNpc } from './prepareNpc.js';

// An invented monster with hand-computed numbers, never a published stat block (ADR 0003, ADR 0013).
const IMPORTED_AT = '2026-10-01T00:00:00.000Z';

const VINE: CreatureStrike = {
  name: 'Vine',
  attackBonus: 11,
  traits: [],
  damage: [{ diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'bludgeoning' }],
};

function creature(overrides: Partial<CreatureEntry> = {}): CreatureEntry {
  return {
    id: '20000000-0001-5000-8000-000000000001',
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'bestiary',
    slug: 'invented-bog-strangler',
    name: 'Invented Bog Strangler',
    kind: 'creature',
    provenance: {
      publication: 'Pathfinder Monster Core',
      license: 'ORC',
      remaster: true,
    },
    traits: [],
    ruleElements: [],
    description: '',
    level: 3,
    size: 'large',
    perception: 8,
    ac: 19,
    savingThrows: { fortitude: 10, reflex: 6, will: 7 },
    hp: 45,
    resistances: [],
    weaknesses: [],
    speeds: { land: 25 },
    attributes: { str: 4, dex: 1, con: 3, int: -2, wis: 1, cha: -1 },
    skills: { athletics: 11 },
    strikes: [VINE],
    languages: [],
    ...overrides,
  };
}

function npc(
  conditions: NpcData['conditions'] = [],
  overrides: Partial<CreatureEntry> = {},
): NpcData {
  return { ...newNpcFromCreature(creature(overrides)), conditions };
}

const totals = (data: NpcData) =>
  Object.fromEntries(
    Object.entries(prepareNpc(data).statistics).map(([key, s]) => [key, s.total]),
  );

describe('prepareNpc with no conditions', () => {
  const prepared = prepareNpc(npc());

  it("reads the creature's printed numbers, under the same keys as a character", () => {
    expect(totals(npc())).toEqual({
      ac: 19,
      perception: 8,
      fortitude: 10,
      reflex: 6,
      will: 7,
      'skill:athletics': 11,
    });
  });

  it('shows each number as one printed line, so the breakdown names where it came from', () => {
    expect(prepared.statistics.ac?.modifiers).toEqual([
      {
        slug: 'printed',
        label: 'Stat block',
        type: 'untyped',
        value: 19,
        source: 'Invented Bog Strangler',
        enabled: true,
        applied: true,
      },
    ]);
  });

  it('reports hit points, with the printed maximum', () => {
    expect(prepared.hp.current).toBe(45);
    expect(prepared.hp.temp).toBe(0);
    expect(prepared.hp.max.total).toBe(45);
  });

  it('prepares a strike with the Multiple Attack Penalty on the 2nd and 3rd attack', () => {
    const [strike] = prepared.strikes;
    expect(strike?.key).toBe('strike:vine');
    expect(strike?.attacks.map((a) => a.total)).toEqual([11, 6, 1]);
    expect(strike?.attackAttribute).toBe('str');
  });

  it('keeps the printed damage, and no adjustment', () => {
    const [strike] = prepared.strikes;
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+4', damageType: 'bludgeoning' },
    ]);
    expect(strike?.damage.critical).toEqual(strike?.damage.normal);
    expect(strike?.damageModifiers.total).toBe(0);
  });

  it('counts no inert automation', () => {
    expect(prepared.inertCount).toBe(0);
  });
});

describe('conditions on an NPC', () => {
  it('frightened 2 lowers every check and DC by 2, and not its hit points', () => {
    const data = npc([{ slug: 'frightened', value: 2 }]);
    expect(totals(data)).toEqual({
      ac: 17,
      perception: 6,
      fortitude: 8,
      reflex: 4,
      will: 5,
      'skill:athletics': 9,
    });
    const prepared = prepareNpc(data);
    expect(prepared.strikes[0]?.attacks.map((a) => a.total)).toEqual([9, 4, -1]);
    expect(prepared.hp.max.total).toBe(45);
  });

  it('clumsy 1 lowers only the Dexterity-based numbers: AC and Reflex, not a Strength strike', () => {
    const data = npc([{ slug: 'clumsy', value: 1 }]);
    expect(totals(data)).toMatchObject({
      ac: 18,
      reflex: 5,
      fortitude: 10,
      will: 7,
      perception: 8,
      'skill:athletics': 11,
    });
    expect(prepareNpc(data).strikes[0]?.attacks[0]?.total).toBe(11);
  });

  it('does not stack frightened 2 and clumsy 1: the worse status penalty applies, the other is shown suppressed', () => {
    const ac = prepareNpc(
      npc([
        { slug: 'frightened', value: 2 },
        { slug: 'clumsy', value: 1 },
      ]),
    ).statistics.ac;
    expect(ac?.total).toBe(17);
    const clumsy = ac?.modifiers.find((m) => m.slug === 'clumsy');
    expect(clumsy?.applied).toBe(false);
    expect(clumsy?.suppressedBy).toBe('frightened');
  });

  it('enfeebled 2 lowers a Strength strike and its damage, and the Strength skill', () => {
    const data = npc([{ slug: 'enfeebled', value: 2 }]);
    const prepared = prepareNpc(data);
    const [strike] = prepared.strikes;
    expect(strike?.attacks[0]?.total).toBe(9);
    expect(strike?.damageModifiers.total).toBe(-2);
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+2', damageType: 'bludgeoning' },
    ]);
    expect(prepared.statistics['skill:athletics']?.total).toBe(9);
    expect(prepared.statistics.ac?.total).toBe(19);
  });

  it('drained 2 lowers Constitution-based numbers and maximum hit points by level x value', () => {
    const prepared = prepareNpc(npc([{ slug: 'drained', value: 2 }]));
    expect(prepared.statistics.fortitude?.total).toBe(8);
    expect(prepared.hp.max.total).toBe(45 - 2 * 3);
  });

  it('prone makes it off-guard: -2 to AC, and -2 to its own attacks', () => {
    const prepared = prepareNpc(npc([{ slug: 'prone' }]));
    expect(prepared.statistics.ac?.total).toBe(17);
    expect(prepared.strikes[0]?.attacks[0]?.total).toBe(9);
  });

  it('adds nothing for a condition it does not model', () => {
    expect(totals(npc([{ slug: 'quickened' }]))).toEqual(totals(npc()));
  });
});

describe('strike attributes and traits', () => {
  const strikeOf = (strike: CreatureStrike) => prepareNpc(npc([], { strikes: [strike] }));

  it('treats a ranged strike as Dexterity: clumsy lowers it, enfeebled does not touch it', () => {
    const spit: CreatureStrike = {
      name: 'Spit',
      attackBonus: 9,
      traits: ['range-increment-30'],
      damage: [{ diceNumber: 2, dieFaces: 6, bonus: 0, damageType: 'acid' }],
    };
    const clumsy = prepareNpc(npc([{ slug: 'clumsy', value: 1 }], { strikes: [spit] }));
    expect(clumsy.strikes[0]?.attackAttribute).toBe('dex');
    expect(clumsy.strikes[0]?.attacks[0]?.total).toBe(8);

    const enfeebled = prepareNpc(
      npc([{ slug: 'enfeebled', value: 2 }], { strikes: [spit] }),
    );
    expect(enfeebled.strikes[0]?.attacks[0]?.total).toBe(9);
    expect(enfeebled.strikes[0]?.damage.normal).toEqual([
      { expression: '2d6', damageType: 'acid' },
    ]);
  });

  it('treats a thrown strike as Dexterity to hit but Strength for damage', () => {
    const javelin: CreatureStrike = {
      name: 'Javelin',
      attackBonus: 10,
      traits: ['thrown', 'range-increment-30'],
      damage: [{ diceNumber: 1, dieFaces: 6, bonus: 4, damageType: 'piercing' }],
    };
    const prepared = prepareNpc(
      npc([{ slug: 'enfeebled', value: 1 }], { strikes: [javelin] }),
    );
    expect(prepared.strikes[0]?.attackAttribute).toBe('dex');
    expect(prepared.strikes[0]?.attacks[0]?.total).toBe(10);
    expect(prepared.strikes[0]?.damage.normal[0]?.expression).toBe('1d6+3');
  });

  it('treats a finesse strike as Dexterity only when Dexterity is the better attribute', () => {
    const rapier: CreatureStrike = { ...VINE, name: 'Rapier', traits: ['finesse'] };
    expect(strikeOf(rapier).strikes[0]?.attackAttribute).toBe('str');
    const nimble = prepareNpc(
      npc([], {
        strikes: [rapier],
        attributes: { str: 1, dex: 4, con: 0, int: 0, wis: 0, cha: 0 },
      }),
    );
    expect(nimble.strikes[0]?.attackAttribute).toBe('dex');
  });

  it('halves the Multiple Attack Penalty step for an agile strike', () => {
    const agile: CreatureStrike = { ...VINE, name: 'Tail', traits: ['agile'] };
    expect(strikeOf(agile).strikes[0]?.attacks.map((a) => a.total)).toEqual([11, 7, 3]);
  });

  it('adds deadly as a critical-only die of its own, in both the normal and critical lists', () => {
    const spear: CreatureStrike = { ...VINE, name: 'Spear', traits: ['deadly-d10'] };
    const [strike] = strikeOf(spear).strikes;
    const deadly = {
      expression: '1d10',
      damageType: 'bludgeoning',
      doubling: 'criticalOnly',
    };
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+4', damageType: 'bludgeoning' },
      deadly,
    ]);
    expect(strike?.damage.critical).toEqual(strike?.damage.normal);
  });

  it('makes fatal swap the first component to the larger die plus one, on a critical only', () => {
    const pick: CreatureStrike = { ...VINE, name: 'Pick', traits: ['fatal-d10'] };
    const [strike] = strikeOf(pick).strikes;
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+4', damageType: 'bludgeoning' },
    ]);
    expect(strike?.damage.critical).toEqual([
      { expression: '2d10+4', damageType: 'bludgeoning' },
    ]);
  });

  it('keeps every damage component, and applies a condition adjustment to the first only', () => {
    const burning: CreatureStrike = {
      ...VINE,
      name: 'Burning Claw',
      damage: [
        { diceNumber: 1, dieFaces: 8, bonus: 4, damageType: 'slashing' },
        { diceNumber: 1, dieFaces: 6, bonus: 0, damageType: 'fire' },
      ],
    };
    const prepared = prepareNpc(
      npc([{ slug: 'enfeebled', value: 2 }], { strikes: [burning] }),
    );
    expect(prepared.strikes[0]?.damage.normal).toEqual([
      { expression: '1d8+2', damageType: 'slashing' },
      { expression: '1d6', damageType: 'fire' },
    ]);
  });

  it('keys strikes by name, and numbers a repeat', () => {
    const prepared = prepareNpc(
      npc([], {
        strikes: [
          { ...VINE, name: 'Jaws & Claws' },
          { ...VINE, name: 'Claw' },
          { ...VINE, name: 'Claw' },
        ],
      }),
    );
    expect(prepared.strikes.map((s) => s.key)).toEqual([
      'strike:jaws-claws',
      'strike:claw',
      'strike:claw-2',
    ]);
  });

  it('has no strikes for a creature with none', () => {
    expect(prepareNpc(npc([], { strikes: [] })).strikes).toEqual([]);
  });
});

describe("a creature's rule elements", () => {
  it('applies a flat modifier to the statistic it selects, with its label', () => {
    const prepared = prepareNpc(
      npc([], {
        ruleElements: [
          {
            kind: 'flatModifier',
            selector: 'ac',
            label: 'Slick Hide',
            type: 'item',
            value: 1,
          },
        ],
      }),
    );
    expect(prepared.statistics.ac?.total).toBe(20);
    expect(prepared.statistics.ac?.modifiers.map((m) => m.label)).toContain('Slick Hide');
  });

  it('counts automation it could not map, so the sheet can flag it', () => {
    const prepared = prepareNpc(
      npc([], {
        ruleElements: [
          { kind: 'inert', upstreamKind: 'Aura', reason: 'unsupported' },
          { kind: 'inert', upstreamKind: 'Resistance', reason: 'unsupported' },
        ],
      }),
    );
    expect(prepared.inertCount).toBe(2);
    expect(prepared.statistics.ac?.total).toBe(19);
  });
});

describe('prepareNpc skills', () => {
  it('prepares every printed skill, Lore included, and a creature with none has no skill keys', () => {
    const prepared = prepareNpc(
      npc([], { skills: { athletics: 11, 'bog-lore': 7, stealth: 9 } }),
    );
    expect(prepared.statistics['skill:bog-lore']?.total).toBe(7);
    expect(prepared.statistics['skill:stealth']?.total).toBe(9);
    expect(
      Object.keys(prepareNpc(npc([], { skills: {} })).statistics).some((k) =>
        k.startsWith('skill:'),
      ),
    ).toBe(false);
  });

  it('applies stupefied to an Intelligence-based Lore skill but not a Strength skill', () => {
    const prepared = prepareNpc(
      npc([{ slug: 'stupefied', value: 2 }], {
        skills: { athletics: 11, 'bog-lore': 7 },
      }),
    );
    expect(prepared.statistics['skill:bog-lore']?.total).toBe(5);
    expect(prepared.statistics['skill:athletics']?.total).toBe(11);
  });
});
