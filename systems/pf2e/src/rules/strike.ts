/**
 * The strike attack roll: the `Statistic` a strike's attack bonus resolves
 * to, and the first place in the rules layer that `@hearthtable/dice`'s
 * `evaluate` and `degreeOfSuccess` are wired together. `packages/dice`
 * deliberately leaves that wiring to a system layer -- see
 * `degreesOfSuccess.ts`'s module doc -- and this is that layer's first
 * caller.
 *
 * Strike *damage* (weapon dice, striking runes, `deadly`/`fatal`/`splash`)
 * is a separate module (D.6): this one only gets the attack roll and its
 * degree of success.
 */

import type { Modifier, Statistic } from '@hearthtable/core';
import { resolveStatistic } from '@hearthtable/core';
import type {
  DegreeOfSuccess,
  DieTerm,
  RandomSource,
  RollResult,
} from '@hearthtable/dice/pure';
import { degreeOfSuccess, evaluate, parse } from '@hearthtable/dice/pure';

import type { Attribute, ProficiencyRank } from '../content/common.js';
import type { WeaponEntry } from '../content/weapon.js';
import { ATTRIBUTE_LABELS } from './attributes.js';
import { proficiencyModifier } from './proficiency.js';

/**
 * PF2e's Multiple Attack Penalty: a flat penalty on a strike's second and
 * third attack in the same turn, doubled on the third. An `agile` weapon
 * halves the step to 4 (8 on the third attack) instead of 5 (10). Returns
 * `0` for the first attack, so callers can tell "no MAP yet" from "an
 * agile weapon's smaller penalty" without a second check.
 */
function multipleAttackPenalty(attackNumber: 1 | 2 | 3, agile: boolean): number {
  if (attackNumber === 1) {
    return 0;
  }
  const step = agile ? 4 : 5;
  return attackNumber === 2 ? -step : -step * 2;
}

/**
 * The Multiple Attack Penalty as a modifier line, or none on the first attack
 * rather than a visible `0` (the convention for a line that does not apply).
 * Shared by PC strikes here and creature strikes in `prepareNpc`, so the two
 * can never disagree about it.
 */
export function multipleAttackPenaltyModifiers(
  attackNumber: 1 | 2 | 3,
  agile: boolean,
): Modifier[] {
  const value = multipleAttackPenalty(attackNumber, agile);
  return value === 0
    ? []
    : [
        {
          slug: 'multiple-attack-penalty',
          label: 'Multiple Attack Penalty',
          type: 'untyped',
          value,
          source: 'Multiple Attack Penalty',
          enabled: true,
        },
      ];
}

export interface BuildStrikeAttackOptions {
  readonly weapon: WeaponEntry;
  /**
   * The attribute this strike's ability modifier uses. A non-finesse melee
   * weapon always uses Strength; a ranged weapon always uses Dexterity; a
   * `finesse`-trait weapon's wielder may choose either at character
   * creation. Resolving that choice is chargen state (milestone 8), not
   * this function's job, so the already-chosen attribute is passed in --
   * the same pattern `buildClassDc`'s `keyAttribute` uses.
   */
  readonly attackAttribute: Attribute;
  readonly attributeModifiers: Readonly<Record<Attribute, number>>;
  readonly proficiencyRank: ProficiencyRank;
  readonly level: number;
  /** Which attack this is in the current turn's sequence -- drives the Multiple Attack Penalty. */
  readonly attackNumber: 1 | 2 | 3;
  /** A rune's item bonus, a status penalty from a spell, and so on. */
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/**
 * `attribute modifier + proficiency`, plus the Multiple Attack Penalty (from
 * the second attack on) and `extraModifiers`. No base constant, like a save
 * -- an attack roll has nothing to add beyond these. The MAP line is
 * omitted entirely on the first attack rather than included as a visible
 * `0`, matching the rest of Stack D's convention of leaving out a line that
 * does not apply (AC's item-bonus line at `acBonus: 0`, a save's absent
 * base-10 line).
 */
export function buildStrikeAttack(options: BuildStrikeAttackOptions): Statistic {
  const modifiers: Modifier[] = [
    {
      slug: options.attackAttribute,
      label: ATTRIBUTE_LABELS[options.attackAttribute],
      type: 'ability',
      value: options.attributeModifiers[options.attackAttribute],
      source: 'ability',
      enabled: true,
    },
    proficiencyModifier(options.proficiencyRank, options.level),
    ...multipleAttackPenaltyModifiers(
      options.attackNumber,
      options.weapon.traits.includes('agile'),
    ),
    ...(options.extraModifiers ?? []),
  ];

  return resolveStatistic(
    modifiers,
    options.rollOptions === undefined ? {} : { rollOptions: options.rollOptions },
  );
}

export interface RollStrikeAttackOptions extends BuildStrikeAttackOptions {
  /** The defender's AC, or whatever DC this attack is rolled against. */
  readonly dc: number;
  /** Pass `cryptoRandomSource` in production; tests pass a seeded or scripted source. */
  readonly rng: RandomSource;
}

export interface StrikeAttackRoll {
  /** The attack bonus this roll was made against, for the breakdown UI. */
  readonly statistic: Statistic;
  readonly roll: RollResult;
  readonly degree: DegreeOfSuccess;
}

/**
 * Rolls a strike's attack: builds the attack `Statistic` via
 * `buildStrikeAttack`, rolls `1d20` plus its total through
 * `@hearthtable/dice`'s `evaluate`, and resolves the degree of success via
 * `degreeOfSuccess` -- the natural-20/natural-1 shift applied on top of the
 * total-vs-DC comparison. The generated expression is always a plain
 * `1d20` plus an integer constant, so a `parse`/`evaluate` failure here is
 * an internal bug, not a reportable error: unlike a chat-entered roll,
 * nothing here is user input.
 */
export function rollStrikeAttack(options: RollStrikeAttackOptions): StrikeAttackRoll {
  const statistic = buildStrikeAttack(options);
  const expression =
    statistic.total >= 0 ? `1d20+${statistic.total}` : `1d20${statistic.total}`;

  const parsed = parse(expression);
  if (!parsed.ok) {
    throw new Error(
      `internal error: failed to parse generated strike expression "${expression}"`,
    );
  }

  const evaluated = evaluate(expression, parsed.expression, { rng: options.rng });
  if (!evaluated.ok) {
    throw new Error(
      `internal error: failed to evaluate generated strike expression "${expression}"`,
    );
  }

  const natural = evaluated.result.terms.find(
    (term): term is DieTerm => term.kind === 'die' && term.faces === 20,
  );
  if (natural === undefined) {
    throw new Error('internal error: strike roll produced no natural d20 term');
  }

  const degree = degreeOfSuccess(evaluated.result.total, options.dc, natural.result);

  return { statistic, roll: evaluated.result, degree };
}
