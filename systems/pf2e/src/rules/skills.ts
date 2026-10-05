/**
 * Skills, Perception, and class DC -- three more `Statistic`s built the
 * same way `defenses.ts` builds AC and saves: assemble a `Modifier[]`, call
 * `resolveStatistic`, return the result. Grouped in one module because they
 * share `SKILL_ATTRIBUTES`, not because class DC is a skill.
 */

import type { Modifier, Statistic } from '@hearthtable/core';
import { resolveStatistic } from '@hearthtable/core';

import type { Attribute, ProficiencyRank } from '../content/common.js';
import { ATTRIBUTE_LABELS } from './attributes.js';
import { proficiencyModifier } from './proficiency.js';

/**
 * PF2e's sixteen named skills. **Lore is deliberately absent** -- it is an
 * open-ended family (`academia-lore`, `farming-lore`, ...), matching
 * `background.ts`'s `trainedSkills: string[]` rather than a closed enum, so
 * there is no fixed list of Lore slugs to add here. `attributeForSkill`
 * below is what every caller actually uses; this list and
 * `SKILL_ATTRIBUTES` exist for anything that wants to enumerate the named
 * skills specifically (a level-1 skill picker, for instance).
 */
export const SKILLS = [
  'acrobatics',
  'arcana',
  'athletics',
  'crafting',
  'deception',
  'diplomacy',
  'intimidation',
  'medicine',
  'nature',
  'occultism',
  'performance',
  'religion',
  'society',
  'stealth',
  'survival',
  'thievery',
] as const;

export type Skill = (typeof SKILLS)[number];

const SKILL_ATTRIBUTES: Readonly<Record<Skill, Attribute>> = {
  acrobatics: 'dex',
  arcana: 'int',
  athletics: 'str',
  crafting: 'int',
  deception: 'cha',
  diplomacy: 'cha',
  intimidation: 'cha',
  medicine: 'wis',
  nature: 'wis',
  occultism: 'int',
  performance: 'cha',
  religion: 'wis',
  society: 'int',
  stealth: 'dex',
  survival: 'wis',
  thievery: 'dex',
};

/** A named skill's fixed attribute, or Intelligence for anything else -- every Lore skill uses Intelligence, regardless of its subject. */
export function attributeForSkill(skill: string): Attribute {
  return (SKILL_ATTRIBUTES as Readonly<Record<string, Attribute>>)[skill] ?? 'int';
}

export interface BuildSkillOptions {
  /** A `SKILLS` slug, or any other string for a Lore skill. */
  readonly skill: string;
  readonly attributeModifiers: Readonly<Record<Attribute, number>>;
  readonly proficiencyRank: ProficiencyRank;
  readonly level: number;
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/** `attribute modifier + proficiency`, plus `extraModifiers`. No base constant, like a save. */
export function buildSkill(options: BuildSkillOptions): Statistic {
  const attribute = attributeForSkill(options.skill);
  const modifiers: Modifier[] = [
    {
      slug: attribute,
      label: ATTRIBUTE_LABELS[attribute],
      type: 'ability',
      value: options.attributeModifiers[attribute],
      source: 'ability',
      enabled: true,
    },
    proficiencyModifier(options.proficiencyRank, options.level),
    ...(options.extraModifiers ?? []),
  ];

  return resolveStatistic(
    modifiers,
    options.rollOptions === undefined ? {} : { rollOptions: options.rollOptions },
  );
}

export interface BuildPerceptionOptions {
  readonly attributeModifiers: Readonly<Record<Attribute, number>>;
  readonly proficiencyRank: ProficiencyRank;
  readonly level: number;
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/** Perception is always Wisdom-based -- unlike a skill, there is no per-entry lookup here. */
export function buildPerception(options: BuildPerceptionOptions): Statistic {
  const modifiers: Modifier[] = [
    {
      slug: 'wis',
      label: ATTRIBUTE_LABELS.wis,
      type: 'ability',
      value: options.attributeModifiers.wis,
      source: 'ability',
      enabled: true,
    },
    proficiencyModifier(options.proficiencyRank, options.level),
    ...(options.extraModifiers ?? []),
  ];

  return resolveStatistic(
    modifiers,
    options.rollOptions === undefined ? {} : { rollOptions: options.rollOptions },
  );
}

export interface BuildClassDcOptions {
  /**
   * The character's chosen key attribute for their class. `class.ts`'s
   * `keyAttributeOptions` may list more than one (a Fighter picks Strength
   * or Dexterity) -- resolving that choice is chargen state (milestone 8),
   * not this function's job, so the already-chosen attribute is passed in.
   */
  readonly keyAttribute: Attribute;
  readonly attributeModifiers: Readonly<Record<Attribute, number>>;
  readonly proficiencyRank: ProficiencyRank;
  readonly level: number;
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/** `10 + key attribute modifier + proficiency`, plus `extraModifiers` -- the same base-10 pattern `buildArmorClass` uses, since a class DC is a DC, not a check total. */
export function buildClassDc(options: BuildClassDcOptions): Statistic {
  const modifiers: Modifier[] = [
    {
      slug: 'base',
      label: 'Base',
      type: 'untyped',
      value: 10,
      source: 'base',
      enabled: true,
    },
    {
      slug: options.keyAttribute,
      label: ATTRIBUTE_LABELS[options.keyAttribute],
      type: 'ability',
      value: options.attributeModifiers[options.keyAttribute],
      source: 'ability',
      enabled: true,
    },
    proficiencyModifier(options.proficiencyRank, options.level),
    ...(options.extraModifiers ?? []),
  ];

  return resolveStatistic(
    modifiers,
    options.rollOptions === undefined ? {} : { rollOptions: options.rollOptions },
  );
}
