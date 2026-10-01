import type { DamageComponent, RandomSource } from '@hearthtable/dice';

import type { CreatureEntry, CreatureStrikeDamage } from '../index.js';

/**
 * The two golden creatures, shared by every golden test that uses one
 * (`creatures.test.ts` for the schema and raw rolls, and
 * `creaturesThroughPrepareNpc.test.ts` for the numbers `prepareNpc` builds from
 * them). Two invented monsters with hand-computed stats -- never a published stat
 * block (ADR 0003's consequences, ADR 0013).
 */
const IMPORTED_AT = '2026-09-30T00:00:00.000Z';
const PROVENANCE = {
  publication: 'Pathfinder Monster Core',
  license: 'ORC' as const,
  remaster: true as const,
};

/** A scripted RNG returning one value per call, in order -- local to this test file since `@hearthtable/dice`'s own equivalent is not exported outside its package. */
export function sequenceRandomSource(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`sequenceRandomSource exhausted after ${index} call(s)`);
    }
    index += 1;
    return value;
  };
}

/** Converts a creature's already-finished damage entries into `@hearthtable/dice`'s generic `DamageComponent[]` -- the same target shape `strikeDamage.ts` builds for a PC. */
export function damageComponents(
  damage: readonly CreatureStrikeDamage[],
): DamageComponent[] {
  return damage.map((component) => {
    const dice = `${component.diceNumber}d${component.dieFaces}`;
    const expression =
      component.bonus === 0
        ? dice
        : component.bonus > 0
          ? `${dice}+${component.bonus}`
          : `${dice}${component.bonus}`;
    return { expression, damageType: component.damageType };
  });
}

export const BOG_STRANGLER: CreatureEntry = {
  id: '20000000-0001-5000-8000-000000000001',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'bestiary',
  slug: 'invented-bog-strangler',
  name: 'Invented Bog Strangler',
  kind: 'creature',
  provenance: PROVENANCE,
  traits: ['aquatic', 'amphibious'],
  ruleElements: [],
  description: '',
  level: 3,
  size: 'medium',
  perception: 8,
  ac: 18,
  savingThrows: { fortitude: 9, reflex: 6, will: 7 },
  hp: 45,
  resistances: [{ damageType: 'cold', value: 5 }],
  weaknesses: [{ damageType: 'fire', value: 5 }],
  speeds: { land: 20, swim: 25 },
  attributes: { str: 3, dex: 1, con: 3, int: -4, wis: 1, cha: -1 },
  skills: { athletics: 11, stealth: 9, 'nature-lore': 6 },
  strikes: [
    {
      name: 'tentacle',
      attackBonus: 11,
      traits: ['reach-10', 'grab'],
      damage: [{ diceNumber: 2, dieFaces: 6, bonus: 3, damageType: 'bludgeoning' }],
    },
  ],
  languages: ['invented-bog-speech'],
};

export const CINDER_WHELP: CreatureEntry = {
  id: '20000000-0002-5000-8000-000000000002',
  schemaVersion: 1,
  createdAt: IMPORTED_AT,
  updatedAt: IMPORTED_AT,
  packId: 'bestiary',
  slug: 'invented-cinder-whelp',
  name: 'Invented Cinder Whelp',
  kind: 'creature',
  provenance: PROVENANCE,
  traits: ['fire', 'animal'],
  ruleElements: [],
  description: '',
  level: 1,
  size: 'small',
  perception: 5,
  ac: 15,
  savingThrows: { fortitude: 5, reflex: 8, will: 3 },
  hp: 20,
  resistances: [{ damageType: 'fire', value: 10 }],
  weaknesses: [{ damageType: 'cold', value: 5 }],
  speeds: { land: 25, fly: 30 },
  attributes: { str: -1, dex: 4, con: 1, int: -3, wis: 0, cha: 1 },
  skills: { acrobatics: 8, stealth: 8 },
  strikes: [
    {
      name: 'bite',
      attackBonus: 8,
      traits: ['finesse'],
      damage: [
        { diceNumber: 1, dieFaces: 6, bonus: 1, damageType: 'piercing' },
        { diceNumber: 1, dieFaces: 4, bonus: 0, damageType: 'fire' },
      ],
    },
  ],
  languages: [],
};
