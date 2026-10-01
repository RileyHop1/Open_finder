import { sequenceRandomSource } from '@hearthtable/dice/testing';
import { describe, expect, it } from 'vitest';

import type { CharacterData, CharacterItem, WeaponEntry } from '../index.js';
import { characterDataSchema, rollStrikeAttack, rollStrikeDamage } from '../index.js';
import { prepareCharacter } from './prepareCharacter.js';

const IMPORTED_AT = '2026-09-30T00:00:00.000Z';

function weapon(slug: string, overrides: Partial<WeaponEntry> = {}): WeaponEntry {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    packId: 'test',
    slug,
    name: slug,
    kind: 'weapon',
    provenance: {
      publication: 'Pathfinder Player Core',
      license: 'ORC',
      remaster: true,
    },
    traits: [],
    ruleElements: [],
    description: '',
    category: 'martial',
    group: 'sword',
    damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
    hands: 1,
    ...overrides,
  };
}

function wielded(entry: WeaponEntry, equipped = true): CharacterItem {
  return { id: crypto.randomUUID(), entry, equipped, quantity: 1 };
}

function character(overrides: Partial<CharacterData> = {}): CharacterData {
  return characterDataSchema.parse({
    level: 1,
    attributes: { str: 4, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
    keyAttribute: 'str',
    ranks: { weapons: { martial: 'expert', simple: 'expert' } },
    hp: { current: 20 },
    ...overrides,
  });
}

const strikesOf = (data: CharacterData) => prepareCharacter(data).strikes;

describe('prepareStrikes', () => {
  it('prepares one strike per equipped weapon and none for a weapon in the pack', () => {
    const strikes = strikesOf(
      character({
        items: [wielded(weapon('longsword')), wielded(weapon('spare-sword'), false)],
      }),
    );
    expect(strikes.map((s) => s.key)).toEqual(['strike:longsword']);
  });

  it('matches the hand-built Fighter longsword: +9 to hit, 1d8+4 slashing', () => {
    const [strike] = strikesOf(character({ items: [wielded(weapon('longsword'))] }));
    // 4 (str) + 5 (expert at level 1)
    expect(strike?.attacks[0].total).toBe(9);
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+4', damageType: 'slashing' },
    ]);
    expect(strike?.damage.critical).toEqual([
      { expression: '1d8+4', damageType: 'slashing' },
    ]);
  });

  it('applies the Multiple Attack Penalty, softened by agile', () => {
    const [plain] = strikesOf(character({ items: [wielded(weapon('longsword'))] }));
    expect(plain?.attacks.map((a) => a.total)).toEqual([9, 4, -1]);
    const [agile] = strikesOf(
      character({ items: [wielded(weapon('dagger', { traits: ['agile'] }))] }),
    );
    expect(agile?.attacks.map((a) => a.total)).toEqual([9, 5, 1]);
  });

  it('uses the weapon category rank, untrained when the character has none', () => {
    const [advanced] = strikesOf(
      character({ items: [wielded(weapon('exotic', { category: 'advanced' }))] }),
    );
    // 4 (str) + 0 (untrained)
    expect(advanced?.attacks[0].total).toBe(4);
  });

  it('lets a finesse weapon use the better of Strength and Dexterity to hit, but Strength for damage', () => {
    const finesse = wielded(weapon('rapier', { traits: ['finesse'] }));
    const dexFighter = character({
      attributes: { str: 1, dex: 4, con: 2, int: 0, wis: 1, cha: 0 },
      items: [finesse],
    });
    const [strike] = strikesOf(dexFighter);
    expect(strike?.attackAttribute).toBe('dex');
    // 4 (dex) + 5 (expert)
    expect(strike?.attacks[0].total).toBe(9);
    expect(strike?.damage.normal[0]?.expression).toBe('1d8+1');

    const [strong] = strikesOf(character({ items: [finesse] }));
    expect(strong?.attackAttribute).toBe('str');
  });

  it('uses Dexterity for a ranged weapon and adds no Strength to damage', () => {
    const bow = weapon('shortbow', { range: 60, group: 'bow' });
    const [strike] = strikesOf(character({ items: [wielded(bow)] }));
    expect(strike?.attackAttribute).toBe('dex');
    // 2 (dex) + 5 (expert)
    expect(strike?.attacks[0].total).toBe(7);
    expect(strike?.damage.normal[0]?.expression).toBe('1d8');
  });

  it('adds full Strength to a thrown weapon and half to a propulsive one', () => {
    const javelin = weapon('javelin', { range: 30, traits: ['thrown-30'] });
    const [thrown] = strikesOf(character({ items: [wielded(javelin)] }));
    expect(thrown?.damage.normal[0]?.expression).toBe('1d8+4');

    const composite = weapon('composite-bow', { range: 100, traits: ['propulsive'] });
    const [propulsive] = strikesOf(
      character({
        attributes: { str: 3, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
        items: [wielded(composite)],
      }),
    );
    // floor(3 / 2) = 1
    expect(propulsive?.damage.normal[0]?.expression).toBe('1d8+1');

    const [weak] = strikesOf(
      character({
        attributes: { str: -1, dex: 2, con: 2, int: 0, wis: 1, cha: 0 },
        items: [wielded(composite)],
      }),
    );
    // a negative Strength modifier applies in full
    expect(weak?.damage.normal[0]?.expression).toBe('1d8-1');
  });

  it('keys a second copy of the same weapon separately', () => {
    const keys = strikesOf(
      character({ items: [wielded(weapon('sword')), wielded(weapon('sword'))] }),
    ).map((s) => s.key);
    expect(keys).toEqual(['strike:sword', 'strike:sword-2']);
  });

  it('applies conditions: enfeebled lowers attack and damage, clumsy does not touch a Strength strike', () => {
    const [strike] = strikesOf(
      character({
        items: [wielded(weapon('longsword'))],
        conditions: [
          { slug: 'enfeebled', value: 2 },
          { slug: 'clumsy', value: 1 },
        ],
      }),
    );
    expect(strike?.attacks[0].total).toBe(7);
    expect(strike?.damageModifiers.total).toBe(2);
    expect(strike?.damage.normal[0]?.expression).toBe('1d8+2');
  });

  it('adds rule-element damage: flat bonuses into the modifier, extra dice as components', () => {
    const feat = {
      id: crypto.randomUUID(),
      equipped: false,
      quantity: 1,
      entry: {
        id: crypto.randomUUID(),
        schemaVersion: 1,
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
        packId: 'test',
        slug: 'invented-fury',
        name: 'Invented Fury',
        kind: 'feat' as const,
        provenance: {
          publication: 'Pathfinder Player Core',
          license: 'ORC' as const,
          remaster: true as const,
        },
        traits: [],
        description: '',
        level: 1,
        category: 'general' as const,
        prerequisites: [],
        ruleElements: [
          {
            kind: 'flatModifier' as const,
            selector: 'strike-damage',
            label: 'Fury',
            type: 'untyped' as const,
            value: 2,
          },
          {
            kind: 'damageDice' as const,
            selector: 'strike-damage',
            diceNumber: 1,
            dieFaces: 6 as const,
            damageType: 'fire',
          },
        ],
      },
    };
    const [strike] = strikesOf(
      character({ items: [wielded(weapon('longsword')), feat] }),
    );
    expect(strike?.damage.normal).toEqual([
      { expression: '1d8+6', damageType: 'slashing' },
      { expression: '1d6', damageType: 'fire' },
    ]);
  });

  it('hands the server the exact inputs to roll with', () => {
    const [strike] = strikesOf(character({ items: [wielded(weapon('longsword'))] }));
    if (strike === undefined) {
      throw new Error('expected a strike');
    }
    const attack = rollStrikeAttack({
      ...strike.attackInputs,
      attackNumber: 1,
      dc: 20,
      rng: sequenceRandomSource([15]),
    });
    expect(attack.roll.total).toBe(24);
    expect(attack.degree).toBe('success');

    const damage = rollStrikeDamage({
      ...strike.damageInputs,
      critical: true,
      rng: sequenceRandomSource([5]),
    });
    expect(damage.ok).toBe(true);
    if (damage.ok) {
      // (5 + 4) * 2
      expect(damage.result.total).toBe(18);
    }
  });
});
