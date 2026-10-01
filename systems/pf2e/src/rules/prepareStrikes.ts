/**
 * Strikes: one per equipped weapon, prepared from `CharacterData` the same
 * way `prepareCharacter` prepares everything else. Each strike carries its
 * attack `Statistic` for the first, second, and third attack of a turn
 * (Multiple Attack Penalty), a `Statistic` breaking down the flat damage
 * modifier, and the damage components for a hit and a critical hit.
 *
 * It also carries the exact inputs it was built from (`attackInputs`,
 * `damageInputs`), so the server's roll handlers call `rollStrikeAttack` and
 * `rollStrikeDamage` with them rather than re-deriving anything: what the
 * sheet shows and what gets rolled cannot drift apart.
 *
 * **Not modeled yet:** potency and striking runes (always 0 and 0, a visible
 * gap rather than a guess), and an unarmed Strike, which every character has
 * but which needs an entry the compendium does not provide. Both are noted in
 * `docs/actor.md`.
 */

import type { Modifier, Statistic } from '@hearthtable/core';
import { resolveStatistic } from '@hearthtable/core';
import type { DamageComponent } from '@hearthtable/dice/pure';

import type { CharacterData } from '../content/character.js';
import type { Attribute } from '../content/common.js';
import type { WeaponEntry } from '../content/weapon.js';
import type { AppliedRuleElements } from './applyRuleElements.js';
import { ATTRIBUTE_LABELS } from './attributes.js';
import { conditionModifiers } from './conditionModifiers.js';
import type { BuildStrikeAttackOptions } from './strike.js';
import { buildStrikeAttack } from './strike.js';
import type { BuildStrikeDamageOptions } from './strikeDamage.js';
import { buildStrikeDamage } from './strikeDamage.js';

export interface PreparedStrike {
  /** `strike:<weapon slug>`, with `-2`, `-3`... for further copies of the same weapon. Matches the golden fixtures' keys. */
  readonly key: string;
  readonly itemId: string;
  readonly name: string;
  readonly attackAttribute: Attribute;
  /** The attack for the 1st, 2nd, and 3rd attack of a turn. */
  readonly attacks: readonly [Statistic, Statistic, Statistic];
  /** What gets added to the weapon's dice: the attribute part, rule-element bonuses, and condition penalties. */
  readonly damageModifiers: Statistic;
  readonly damage: {
    readonly normal: readonly DamageComponent[];
    readonly critical: readonly DamageComponent[];
  };
  readonly attackInputs: Omit<BuildStrikeAttackOptions, 'attackNumber'>;
  readonly damageInputs: Omit<BuildStrikeDamageOptions, 'critical'>;
}

function hasTrait(weapon: WeaponEntry, trait: string): boolean {
  return weapon.traits.some((t) => t === trait || t.startsWith(`${trait}-`));
}

/** Finesse lets a melee weapon use Dexterity instead of Strength to hit; a ranged weapon always uses Dexterity. */
function attackAttributeFor(
  weapon: WeaponEntry,
  modifiers: Readonly<Record<Attribute, number>>,
): Attribute {
  if (weapon.range !== undefined) {
    return 'dex';
  }
  if (hasTrait(weapon, 'finesse') && modifiers.dex > modifiers.str) {
    return 'dex';
  }
  return 'str';
}

/** The attribute part of a strike's damage: Strength for melee and thrown weapons, half (rounded down) for propulsive ones, nothing for other ranged weapons. */
function damageAbilityLine(weapon: WeaponEntry, str: number): Modifier | undefined {
  let value = 0;
  let label: string = ATTRIBUTE_LABELS.str;
  if (weapon.range === undefined || hasTrait(weapon, 'thrown')) {
    value = str;
  } else if (hasTrait(weapon, 'propulsive')) {
    value = str > 0 ? Math.floor(str / 2) : str;
    label = `${ATTRIBUTE_LABELS.str} (propulsive)`;
  }
  return value === 0
    ? undefined
    : { slug: 'str', label, type: 'ability', value, source: 'ability', enabled: true };
}

/** Selectors a strike's attack rolls listen to, and the ones its damage listens to. */
const ATTACK_SELECTORS = ['attack', 'all'] as const;
const DAMAGE_SELECTORS = ['strike-damage', 'damage'] as const;

export function prepareStrikes(
  data: CharacterData,
  applied: AppliedRuleElements,
): PreparedStrike[] {
  const { attributes, level } = data;
  const strikes: PreparedStrike[] = [];
  const seen = new Map<string, number>();

  for (const item of data.items) {
    if (!item.equipped || item.entry.kind !== 'weapon') {
      continue;
    }
    const weapon = item.entry;
    const attackAttribute = attackAttributeFor(weapon, attributes);

    const count = (seen.get(weapon.slug) ?? 0) + 1;
    seen.set(weapon.slug, count);
    const key = count === 1 ? `strike:${weapon.slug}` : `strike:${weapon.slug}-${count}`;

    const attackInputs: Omit<BuildStrikeAttackOptions, 'attackNumber'> = {
      weapon,
      attackAttribute,
      attributeModifiers: attributes,
      proficiencyRank: data.ranks.weapons[weapon.category],
      level,
      rollOptions: applied.rollOptions,
      extraModifiers: [
        ...ATTACK_SELECTORS.flatMap((s) => applied.modifiersBySelector.get(s) ?? []),
        ...conditionModifiers(data.conditions, {
          kind: 'attack',
          attribute: attackAttribute,
        }),
      ],
    };

    const abilityLine = damageAbilityLine(weapon, attributes.str);
    const damageModifiers = resolveStatistic(
      [
        ...(abilityLine === undefined ? [] : [abilityLine]),
        ...DAMAGE_SELECTORS.flatMap((s) => applied.modifiersBySelector.get(s) ?? []),
        ...conditionModifiers(data.conditions, { kind: 'damage', attribute: 'str' }),
      ],
      { rollOptions: applied.rollOptions },
    );

    const damageInputs: Omit<BuildStrikeDamageOptions, 'critical'> = {
      weapon,
      strikingDice: 0,
      abilityModifier: damageModifiers.total,
      extraComponents: DAMAGE_SELECTORS.flatMap(
        (s) => applied.damageDiceBySelector.get(s) ?? [],
      ).map((dice) => ({
        expression: `${dice.diceNumber}d${dice.dieFaces}`,
        damageType: dice.damageType ?? weapon.damage.damageType,
      })),
    };

    strikes.push({
      key,
      itemId: item.id,
      name: weapon.name,
      attackAttribute,
      attacks: [
        buildStrikeAttack({ ...attackInputs, attackNumber: 1 }),
        buildStrikeAttack({ ...attackInputs, attackNumber: 2 }),
        buildStrikeAttack({ ...attackInputs, attackNumber: 3 }),
      ],
      damageModifiers,
      damage: {
        normal: buildStrikeDamage({ ...damageInputs, critical: false }),
        critical: buildStrikeDamage({ ...damageInputs, critical: true }),
      },
      attackInputs,
      damageInputs,
    });
  }

  return strikes;
}
