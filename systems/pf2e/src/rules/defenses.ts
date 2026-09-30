/**
 * AC and saving throws -- the first two places `resolveStatistic` actually
 * gets called, and the pattern every later Stack D function (skills,
 * perception, class DC, strikes) repeats: assemble a `Modifier[]`, hand it
 * to the resolver, return the `Statistic`. **Never a bare number** (ADR
 * 0008 decision 4) -- there is no code path here that returns `total`
 * without the modifier list that explains it.
 */

import type { Modifier, Statistic } from '@hearthtable/core';
import { resolveStatistic } from '@hearthtable/core';

import type { ArmorEntry } from '../content/armor.js';
import type { Attribute } from '../content/common.js';
import type { ProficiencyRank } from '../content/common.js';
import { ATTRIBUTE_LABELS } from './attributes.js';
import { proficiencyModifier } from './proficiency.js';

export interface BuildArmorClassOptions {
  readonly attributeModifiers: Readonly<Record<Attribute, number>>;
  /** The worn armor, or absent for an unarmored character (no Dexterity cap, no item bonus). */
  readonly armor?: ArmorEntry;
  readonly proficiencyRank: ProficiencyRank;
  readonly level: number;
  /** Anything beyond the base/Dexterity/proficiency/armor lines -- a shield's circumstance bonus, a spell's status penalty, and so on. */
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/**
 * `10 + Dexterity (capped by the worn armor's `dexCap`, if any) +
 * proficiency + the armor's item bonus`, plus whatever `extraModifiers`
 * supplies. The base `10` is itself an (always-applying, `untyped`)
 * modifier rather than added after resolution -- so `Statistic.total` is
 * the real, final AC, and the breakdown UI can show where the `10` came
 * from exactly like every other line.
 *
 * `Math.min(dexModifier, dexCap)` handles both directions correctly
 * without a special case: a positive Dexterity modifier above the cap is
 * reduced to it, and a negative modifier (already below any positive cap)
 * passes through unchanged -- a cap limits how much Dexterity can *help*,
 * never how much it can hurt.
 */
export function buildArmorClass(options: BuildArmorClassOptions): Statistic {
  const rawDexModifier = options.attributeModifiers.dex;
  const dexModifier =
    options.armor?.dexCap === undefined
      ? rawDexModifier
      : Math.min(rawDexModifier, options.armor.dexCap);

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
      slug: 'dexterity',
      label: ATTRIBUTE_LABELS.dex,
      type: 'ability',
      value: dexModifier,
      source: 'ability',
      enabled: true,
    },
    proficiencyModifier(options.proficiencyRank, options.level),
    ...(options.armor !== undefined && options.armor.acBonus !== 0
      ? [
          {
            slug: 'armor',
            label: options.armor.name,
            type: 'item' as const,
            value: options.armor.acBonus,
            source: options.armor.name,
            enabled: true,
          },
        ]
      : []),
    ...(options.extraModifiers ?? []),
  ];

  return resolveStatistic(
    modifiers,
    options.rollOptions === undefined ? {} : { rollOptions: options.rollOptions },
  );
}

export const SAVE_TYPES = ['fortitude', 'reflex', 'will'] as const;

export type SaveType = (typeof SAVE_TYPES)[number];

/** Which attribute backs which save -- fixed by the rules, never a player or GM choice. */
const SAVE_ATTRIBUTES: Readonly<Record<SaveType, Attribute>> = {
  fortitude: 'con',
  reflex: 'dex',
  will: 'wis',
};

export interface BuildSaveOptions {
  readonly save: SaveType;
  readonly attributeModifiers: Readonly<Record<Attribute, number>>;
  readonly proficiencyRank: ProficiencyRank;
  readonly level: number;
  /** A spell's status penalty, a condition's circumstance penalty, and so on. */
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/** `attribute modifier (fixed per save) + proficiency`, plus `extraModifiers`. No base constant -- unlike AC, a save has nothing to add beyond these. */
export function buildSave(options: BuildSaveOptions): Statistic {
  const attribute = SAVE_ATTRIBUTES[options.save];
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
