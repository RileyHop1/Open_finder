/**
 * How many actions a combatant has on a turn, from the conditions it bears --
 * see `docs/action-economy.md`. Pure. The tracker shows this as the action tray
 * and **warns, never blocks**, when more is spent.
 *
 * - A turn has **3** actions.
 * - **Quickened** adds one. The extra action is restricted to particular uses the
 *   app cannot judge, so it is reported separately (`quickenedExtra`) and shown as
 *   "restricted", never enforced.
 * - **Slowed N** removes N.
 * - Never fewer than 0.
 *
 * **Stunned** is not here: it takes actions at the *start* of a turn and then
 * wears off, so `startOfTurn` (`turnBoundaries.ts`) applies it and the lost
 * actions count as spent (`docs/rulings.md`, "Stunned, slowed, and quickened").
 */

import type { AppliedCondition } from '../content/character.js';

/** The actions in a turn before any condition. */
export const BASE_ACTIONS = 3;

export interface ActionCapacity {
  /** Actions available, counting quickened's extra one. */
  readonly total: number;
  /** Whether `total` includes quickened's restricted extra action. */
  readonly quickenedExtra: boolean;
}

/** The actions a combatant bearing `conditions` has on its turn. */
export function actionCapacity(conditions: readonly AppliedCondition[]): ActionCapacity {
  const quickened = conditions.some((condition) => condition.slug === 'quickened');
  const slowed = conditions.find((condition) => condition.slug === 'slowed')?.value ?? 0;
  const total = Math.max(0, BASE_ACTIONS + (quickened ? 1 : 0) - slowed);
  return { total, quickenedExtra: quickened && total > 0 };
}
