/**
 * `prepareNpc`: stored `NpcData` in, every statistic out -- the NPC twin of
 * `prepareCharacter`, returning the same keys (`ac`, `fortitude`, `reflex`,
 * `will`, `perception`, `skill:<slug>`, `strike:<name>`) so the sheet, the
 * server's roll handlers, and the golden tests treat both the same way.
 *
 * A creature's numbers are already the finished product (`creature.ts`), so
 * nothing is built from proficiency and attributes. Each statistic is one
 * "printed value" line, with the creature's own rule elements and its
 * conditions stacked on top through `resolveStatistic`. That is what makes
 * *frightened 2* lower a monster's AC and attack by 2 with the line shown, and
 * what lets *clumsy* hit a goblin's Reflex and ranged attack but not its
 * Fortitude (ADR 0008).
 *
 * **Strike attributes are inferred.** A creature's strike says what it hits
 * and for how much, not which attribute it uses, and clumsy and enfeebled
 * depend on that. Ranged and thrown strikes count as Dexterity, a finesse
 * strike as Dexterity when that is the creature's better attribute, and
 * everything else as Strength; enfeebled's damage penalty applies to the
 * Strength ones. Recorded in `docs/rulings.md`; the GM can adjust a result.
 */

import type { Modifier, Statistic } from '@hearthtable/core';
import { resolveStatistic } from '@hearthtable/core';
import type { DamageComponent } from '@hearthtable/dice/pure';

import type { Attribute } from '../content/common.js';
import type { CreatureEntry, CreatureStrike } from '../content/creature.js';
import type { NpcData } from '../content/npc.js';
import { applyRuleElements } from './applyRuleElements.js';
import type { ConditionTarget } from './conditionModifiers.js';
import { conditionModifiers } from './conditionModifiers.js';
import { SAVE_TYPES } from './defenses.js';
import { multipleAttackPenaltyModifiers } from './strike.js';
import { diceExpression, traitDieFaces } from './strikeDamage.js';

export interface PreparedNpcStrike {
  /** `strike:<name as a slug>`, with `-2`, `-3`... for a second strike of the same name. */
  readonly key: string;
  readonly name: string;
  readonly attackAttribute: Attribute;
  /** The attack for the 1st, 2nd, and 3rd attack of a turn (Multiple Attack Penalty; `agile` halves its step). */
  readonly attacks: readonly [Statistic, Statistic, Statistic];
  /** What conditions add to the first damage component (enfeebled on a Strength strike). Zero total when none. */
  readonly damageModifiers: Statistic;
  readonly damage: {
    readonly normal: readonly DamageComponent[];
    readonly critical: readonly DamageComponent[];
  };
}

export interface PreparedNpc {
  /** Keyed like `PreparedCharacter`, minus `classDc`: `ac`, `fortitude`, `reflex`, `will`, `perception`, `skill:<slug>`. */
  readonly statistics: Readonly<Record<string, Statistic>>;
  readonly hp: {
    readonly current: number;
    readonly temp: number;
    readonly max: Statistic;
  };
  readonly strikes: readonly PreparedNpcStrike[];
  /** How many rule elements on the creature we could not map. The sheet flags them so the GM can apply them by hand (ADR 0004). */
  readonly inertCount: number;
  readonly rollOptions: ReadonlySet<string>;
}

/** A creature's own stat block number, as the base line every other modifier stacks on. */
function printed(value: number, source: string, label = 'Stat block'): Modifier {
  return { slug: 'printed', label, type: 'untyped', value, source, enabled: true };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isRanged(strike: CreatureStrike): boolean {
  return strike.traits.some((t) => t === 'ranged' || t.startsWith('range-increment'));
}

function isThrown(strike: CreatureStrike): boolean {
  return strike.traits.includes('thrown');
}

/** See the module doc: inferred, because the entry does not say. */
function attackAttributeFor(
  strike: CreatureStrike,
  attributes: CreatureEntry['attributes'],
): Attribute {
  if (isRanged(strike) || isThrown(strike)) {
    return 'dex';
  }
  if (strike.traits.includes('finesse') && attributes.dex > attributes.str) {
    return 'dex';
  }
  return 'str';
}

/** Enfeebled's damage penalty belongs to Strength damage: melee and thrown, not other ranged strikes. */
function damageUsesStrength(strike: CreatureStrike): boolean {
  return !isRanged(strike) || isThrown(strike);
}

export function prepareNpc(data: NpcData): PreparedNpc {
  const { creature } = data;
  const applied = applyRuleElements({
    items: [{ name: creature.name, ruleElements: creature.ruleElements }],
    choices: new Map(),
  });
  const options = { rollOptions: applied.rollOptions };

  /** The printed value, then rule-element modifiers for any of `selectors`, then the conditions' modifiers for `target`. */
  const statistic = (
    value: number,
    selectors: readonly string[],
    target: ConditionTarget,
  ): Statistic =>
    resolveStatistic(
      [
        printed(value, creature.name),
        ...selectors.flatMap(
          (selector) => applied.modifiersBySelector.get(selector) ?? [],
        ),
        ...conditionModifiers(data.conditions, target),
      ],
      options,
    );

  const statistics: Record<string, Statistic> = {
    ac: statistic(creature.ac, ['ac', 'all'], { kind: 'ac' }),
    perception: statistic(creature.perception, ['perception', 'all'], {
      kind: 'perception',
    }),
  };
  for (const save of SAVE_TYPES) {
    statistics[save] = statistic(
      creature.savingThrows[save],
      [save, 'saving-throw', 'all'],
      { kind: 'save', save },
    );
  }
  for (const [skill, value] of Object.entries(creature.skills)) {
    statistics[`skill:${skill}`] = statistic(
      value,
      [`skill:${skill}`, skill, 'skill-check', 'all'],
      { kind: 'skill', skill },
    );
  }

  const seen = new Map<string, number>();
  const strikes = creature.strikes.map((strike): PreparedNpcStrike => {
    const base = slugify(strike.name);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);

    const attackAttribute = attackAttributeFor(strike, creature.attributes);
    const attackAt = (attackNumber: 1 | 2 | 3): Statistic =>
      resolveStatistic(
        [
          printed(strike.attackBonus, creature.name, 'Attack bonus'),
          ...multipleAttackPenaltyModifiers(
            attackNumber,
            strike.traits.includes('agile'),
          ),
          ...['attack', 'all'].flatMap(
            (selector) => applied.modifiersBySelector.get(selector) ?? [],
          ),
          ...conditionModifiers(data.conditions, {
            kind: 'attack',
            attribute: attackAttribute,
          }),
        ],
        options,
      );

    const damageModifiers = resolveStatistic(
      damageUsesStrength(strike)
        ? [
            ...['strike-damage', 'damage'].flatMap(
              (selector) => applied.modifiersBySelector.get(selector) ?? [],
            ),
            ...conditionModifiers(data.conditions, { kind: 'damage', attribute: 'str' }),
          ]
        : [],
      options,
    );

    return {
      key: count === 1 ? `strike:${base}` : `strike:${base}-${count}`,
      name: strike.name,
      attackAttribute,
      attacks: [attackAt(1), attackAt(2), attackAt(3)],
      damageModifiers,
      damage: {
        normal: damageComponents(strike, damageModifiers.total, false),
        critical: damageComponents(strike, damageModifiers.total, true),
      },
    };
  });

  return {
    statistics,
    hp: {
      current: data.hp.current,
      temp: data.hp.temp,
      max: resolveStatistic(
        [
          printed(creature.hp, creature.name, 'Hit points'),
          ...(applied.modifiersBySelector.get('hp') ?? []),
          ...conditionModifiers(data.conditions, {
            kind: 'maxHp',
            level: creature.level,
          }),
        ],
        options,
      ),
    },
    strikes,
    inertCount: creature.ruleElements.filter((e) => e.kind === 'inert').length,
    rollOptions: applied.rollOptions,
  };
}

/**
 * A strike's damage: each printed component, with the conditions' flat
 * adjustment on the first, then `deadly`'s extra critical-only die. On a
 * critical hit `fatal` swaps the first component to its larger die and adds
 * one, as it does for a PC's weapon (`strikeDamage.ts`). The dice layer doubles
 * the total on a critical.
 */
function damageComponents(
  strike: CreatureStrike,
  adjustment: number,
  critical: boolean,
): DamageComponent[] {
  const fatalFaces = critical ? traitDieFaces(strike.traits, 'fatal') : undefined;
  const components: DamageComponent[] = strike.damage.map((part, index) => {
    const bonus = part.bonus + (index === 0 ? adjustment : 0);
    return fatalFaces !== undefined && index === 0
      ? {
          expression: diceExpression(part.diceNumber + 1, fatalFaces, bonus),
          damageType: part.damageType,
        }
      : {
          expression: diceExpression(part.diceNumber, part.dieFaces, bonus),
          damageType: part.damageType,
        };
  });

  const deadlyFaces = traitDieFaces(strike.traits, 'deadly');
  const first = strike.damage[0];
  if (deadlyFaces !== undefined && first !== undefined) {
    components.push({
      expression: diceExpression(1, deadlyFaces, 0),
      damageType: first.damageType,
      doubling: 'criticalOnly',
    });
  }
  return components;
}
