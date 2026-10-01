/**
 * Builds a golden character as `CharacterData` and reads its statistics back
 * out of `prepareCharacter`. This is what routes the golden set through the
 * same path the sheet and the server use (milestone 3): a golden fixture no
 * longer wires each builder by hand, so a change to how `prepareCharacter`
 * composes a statistic shows up here.
 *
 * Fixtures stay ours and hermetic (ADR 0013): the caller supplies invented
 * ability scores and invented armor and weapon entries.
 */

import type { Statistic } from '@hearthtable/core';

import type {
  AppliedCondition,
  ArmorEntry,
  Attribute,
  CharacterData,
  CharacterItem,
  PreparedCharacter,
  ProficiencyRank,
  WeaponEntry,
} from '../index.js';
import { attributeModifier, characterDataSchema } from '../index.js';

export interface GoldenCharacterSpec {
  readonly level: number;
  /** Ability *scores*, the way a fixture's author thinks of them; converted to modifiers here. */
  readonly scores: Readonly<Record<Attribute, number>>;
  readonly keyAttribute: Attribute;
  readonly ranks: {
    readonly perception: ProficiencyRank;
    readonly fortitude: ProficiencyRank;
    readonly reflex: ProficiencyRank;
    readonly will: ProficiencyRank;
    readonly classDc: ProficiencyRank;
    /** The rank in the worn armor's own category. */
    readonly armor: ProficiencyRank;
    /** The rank in the wielded weapon's own category. */
    readonly weapon: ProficiencyRank;
  };
  readonly armor: ArmorEntry;
  readonly weapon: WeaponEntry;
  readonly skills?: Readonly<Record<string, ProficiencyRank>>;
  /** Anything else the character carries, such as an item whose rule elements the fixture exercises. */
  readonly extraItems?: readonly CharacterItem[];
  /** Conditions currently on the character, as `{ slug, value? }`. */
  readonly conditions?: readonly AppliedCondition[];
  readonly ancestryHp?: number;
  readonly classHp?: number;
}

/** An equipped copy of `entry`, with a fresh id. */
export function equipped(entry: CharacterItem['entry']): CharacterItem {
  return { id: crypto.randomUUID(), entry, equipped: true, quantity: 1 };
}

export function goldenCharacter(spec: GoldenCharacterSpec): CharacterData {
  const modifiers = Object.fromEntries(
    Object.entries(spec.scores).map(([attribute, score]) => [
      attribute,
      attributeModifier(score),
    ]),
  );
  return characterDataSchema.parse({
    level: spec.level,
    attributes: modifiers,
    keyAttribute: spec.keyAttribute,
    ranks: {
      perception: spec.ranks.perception,
      fortitude: spec.ranks.fortitude,
      reflex: spec.ranks.reflex,
      will: spec.ranks.will,
      classDc: spec.ranks.classDc,
      armor: { [spec.armor.category]: spec.ranks.armor },
      weapons: { [spec.weapon.category]: spec.ranks.weapon },
      skills: spec.skills ?? {},
    },
    ancestryHp: spec.ancestryHp ?? 0,
    classHp: spec.classHp ?? 0,
    hp: { current: 1 },
    conditions: spec.conditions ?? [],
    items: [equipped(spec.armor), equipped(spec.weapon), ...(spec.extraItems ?? [])],
  });
}

/**
 * The statistics a golden fixture pins, under the names fixtures already use
 * (`ac`, `fortitude`, ..., `skill:<slug>`), plus the first strike's attack
 * (first attack of the turn, no Multiple Attack Penalty) under `strikeName`
 * and max HP as `hp:max`.
 */
export function goldenStatistics(
  prepared: PreparedCharacter,
  strikeName: string,
): Record<string, Statistic> {
  const strike = prepared.strikes[0];
  if (strike === undefined) {
    throw new Error('a golden character needs an equipped weapon to have a strike');
  }
  return {
    ...prepared.statistics,
    [`strike:${strikeName}`]: strike.attacks[0],
    'hp:max': prepared.hp.max,
  };
}
