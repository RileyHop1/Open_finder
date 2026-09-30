/**
 * Maximum Hit Points, as a `Statistic` like every other number the sheet
 * shows, so "click to see the math" works on it too (ADR 0008).
 *
 * The rule: ancestry HP once, plus (class HP + Constitution modifier) at every
 * level. Stored inputs are `ancestryHp` and `classHp` (`CharacterData`);
 * the total is derived here and never stored.
 *
 * Everything else that raises or lowers max HP arrives as `extraModifiers`:
 * rule elements selecting `hp` (`applyRuleElements`' `modifiersBySelector`),
 * and *drained* (`conditionModifiers` with a `maxHp` target).
 */

import type { Modifier, Statistic } from '@hearthtable/core';
import { resolveStatistic } from '@hearthtable/core';

import { ATTRIBUTE_LABELS } from './attributes.js';

export interface BuildMaxHitPointsOptions {
  /** HP granted once by the ancestry. */
  readonly ancestryHp: number;
  /** HP the class grants at each level, before Constitution. */
  readonly classHp: number;
  readonly conModifier: number;
  readonly level: number;
  readonly extraModifiers?: readonly Modifier[];
  readonly rollOptions?: ReadonlySet<string>;
}

/**
 * `ancestryHp + (classHp + con) * level`, plus `extraModifiers`. Each part is
 * its own line (ancestry, class, Constitution) so the breakdown shows where
 * the number comes from. A part that is zero is left out, matching the rest
 * of the rules layer's convention for a line that does not apply.
 */
export function buildMaxHitPoints(options: BuildMaxHitPointsOptions): Statistic {
  const lines: Modifier[] = [
    {
      slug: 'ancestry-hp',
      label: 'Ancestry',
      type: 'untyped',
      value: options.ancestryHp,
      source: 'Ancestry',
      enabled: true,
    },
    {
      slug: 'class-hp',
      label: `Class (${options.classHp} x level ${options.level})`,
      type: 'untyped',
      value: options.classHp * options.level,
      source: 'Class',
      enabled: true,
    },
    {
      slug: 'con',
      label: `${ATTRIBUTE_LABELS.con} (x level ${options.level})`,
      type: 'ability',
      value: options.conModifier * options.level,
      source: 'ability',
      enabled: true,
    },
  ];

  return resolveStatistic(
    [...lines.filter((line) => line.value !== 0), ...(options.extraModifiers ?? [])],
    options.rollOptions === undefined ? {} : { rollOptions: options.rollOptions },
  );
}
