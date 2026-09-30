/**
 * `prepareCharacter`: stored `CharacterData` in, every derived statistic out.
 * This is the one function the sheet, the server's roll handlers, and the
 * golden tests all call, so a number is computed exactly one way (ADR 0008).
 * It only composes what already exists: `applyRuleElements` for item
 * automation, `conditionModifiers` for conditions, and the per-statistic
 * builders. Strikes are prepared separately (the next PR).
 *
 * **Which items are active.** Feats, class features, actions, and spells
 * always are. Weapons, armor, and gear count only while `equipped`, so a
 * sword in the pack grants nothing. That is a judgment call, recorded in
 * `docs/rulings.md`; the GM can still add a manual modifier.
 *
 * **Selectors.** A rule element names its statistic with a `selector`. Ours
 * are `ac`, `fortitude`/`reflex`/`will`, `perception`, `class-dc`,
 * `skill:<slug>`, and `hp`. The importer passes upstream selector strings
 * through unchanged, so the common upstream spellings are accepted as
 * aliases: a bare skill slug (`athletics`), `saving-throw`, `skill-check`,
 * and `all`. **(confirm)** the alias list against the importer's coverage
 * report once a real import has been read.
 */

import type { Modifier, Statistic } from '@hearthtable/core';

import type { ArmorEntry } from '../content/armor.js';
import type { CharacterData, CharacterItem } from '../content/character.js';
import type { Attribute } from '../content/common.js';
import { applyRuleElements } from './applyRuleElements.js';
import type { ConditionTarget } from './conditionModifiers.js';
import { conditionModifiers } from './conditionModifiers.js';
import { buildArmorClass, buildSave, SAVE_TYPES } from './defenses.js';
import { buildMaxHitPoints } from './hitPoints.js';
import { buildClassDc, buildPerception, buildSkill, SKILLS } from './skills.js';

/** Item kinds that grant nothing until equipped. Everything else is always active. */
const EQUIPMENT_KINDS: ReadonlySet<string> = new Set(['weapon', 'armor', 'gear']);

/** An item whose rule elements include automation we could not map. The sheet flags it so the GM can apply it by hand (ADR 0004). */
export interface InertItem {
  readonly itemId: string;
  readonly name: string;
  readonly inertCount: number;
}

export interface PreparedCharacter {
  /** Keyed like the golden fixtures: `ac`, `fortitude`, `reflex`, `will`, `perception`, `classDc`, `skill:<slug>`. */
  readonly statistics: Readonly<Record<string, Statistic>>;
  readonly hp: {
    readonly current: number;
    readonly temp: number;
    readonly max: Statistic;
  };
  readonly inertItems: readonly InertItem[];
  /** The roll options rule elements activated, for predicates evaluated later (strikes). */
  readonly rollOptions: ReadonlySet<string>;
}

function isActive(item: CharacterItem): boolean {
  return !EQUIPMENT_KINDS.has(item.entry.kind) || item.equipped;
}

function findInertItems(items: readonly CharacterItem[]): InertItem[] {
  const inert: InertItem[] = [];
  for (const item of items) {
    const inertCount = item.entry.ruleElements.filter((e) => e.kind === 'inert').length;
    if (inertCount > 0) {
      inert.push({ itemId: item.id, name: item.entry.name, inertCount });
    }
  }
  return inert;
}

/** The first equipped armor entry, if any. Two suits of armor worn at once is not a state the rules allow. */
function wornArmor(items: readonly CharacterItem[]): ArmorEntry | undefined {
  for (const item of items) {
    if (item.equipped && item.entry.kind === 'armor') {
      return item.entry;
    }
  }
  return undefined;
}

export function prepareCharacter(data: CharacterData): PreparedCharacter {
  const { level, attributes, ranks } = data;
  const applied = applyRuleElements({
    items: data.items
      .filter(isActive)
      .map((item) => ({ name: item.entry.name, ruleElements: item.entry.ruleElements })),
    choices: new Map(Object.entries(data.choices)),
  });
  const attributeModifiers: Readonly<Record<Attribute, number>> = attributes;

  /** Rule-element modifiers for any of `selectors`, then the conditions' modifiers for `target`. */
  const extras = (selectors: readonly string[], target: ConditionTarget): Modifier[] => [
    ...selectors.flatMap((selector) => applied.modifiersBySelector.get(selector) ?? []),
    ...conditionModifiers(data.conditions, target),
  ];
  const common = { attributeModifiers, level, rollOptions: applied.rollOptions };

  const armor = wornArmor(data.items);
  const statistics: Record<string, Statistic> = {
    ac: buildArmorClass({
      ...common,
      ...(armor === undefined ? {} : { armor }),
      proficiencyRank: ranks.armor[armor?.category ?? 'unarmored'],
      extraModifiers: extras(['ac', 'all'], { kind: 'ac' }),
    }),
    perception: buildPerception({
      ...common,
      proficiencyRank: ranks.perception,
      extraModifiers: extras(['perception', 'all'], { kind: 'perception' }),
    }),
    classDc: buildClassDc({
      ...common,
      keyAttribute: data.keyAttribute,
      proficiencyRank: ranks.classDc,
      extraModifiers: extras(['class-dc', 'all'], {
        kind: 'classDc',
        keyAttribute: data.keyAttribute,
      }),
    }),
  };

  for (const save of SAVE_TYPES) {
    statistics[save] = buildSave({
      ...common,
      save,
      proficiencyRank: ranks[save],
      extraModifiers: extras([save, 'saving-throw', 'all'], { kind: 'save', save }),
    });
  }

  const skills = new Set<string>([...SKILLS, ...Object.keys(ranks.skills)]);
  for (const skill of skills) {
    statistics[`skill:${skill}`] = buildSkill({
      ...common,
      skill,
      proficiencyRank: ranks.skills[skill] ?? 'untrained',
      extraModifiers: extras([`skill:${skill}`, skill, 'skill-check', 'all'], {
        kind: 'skill',
        skill,
      }),
    });
  }

  return {
    statistics,
    hp: {
      current: data.hp.current,
      temp: data.hp.temp,
      max: buildMaxHitPoints({
        ancestryHp: data.ancestryHp,
        classHp: data.classHp,
        conModifier: attributes.con,
        level,
        rollOptions: applied.rollOptions,
        extraModifiers: [
          ...(applied.modifiersBySelector.get('hp') ?? []),
          ...conditionModifiers(data.conditions, { kind: 'maxHp', level }),
        ],
      }),
    },
    inertItems: findInertItems(data.items),
    rollOptions: applied.rollOptions,
  };
}
