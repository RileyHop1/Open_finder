/**
 * What the action tray shows for the combatant whose turn it is: capacity from
 * conditions (`actionCapacity`, docs/action-economy.md), how many of it is
 * spent, and whether the reaction is used. Kept apart from the component so
 * the overspend math is testable without mounting anything.
 */

import type { Actor, Combatant } from '@hearthtable/core';
import {
  actionCapacity,
  characterDataSchema,
  npcDataSchema,
  type ActionCapacity,
} from '@hearthtable/pf2e';

export interface ActionTrayView {
  readonly capacity: ActionCapacity;
  readonly spent: number;
  readonly reactionUsed: boolean;
  /** How many actions over capacity, 0 when not overspent. */
  readonly overspent: number;
}

/** The conditions borne by `actor`, character or NPC alike, or none if it can't be read. */
function conditionsOf(actor: Actor | undefined) {
  if (actor === undefined) {
    return [];
  }
  const data =
    actor.kind === 'npc'
      ? npcDataSchema.safeParse(actor.system).data
      : actor.kind === 'character'
        ? characterDataSchema.safeParse(actor.system).data
        : undefined;
  return data?.conditions ?? [];
}

export function actionTrayView(
  combatant: Combatant,
  actor: Actor | undefined,
): ActionTrayView {
  const capacity = actionCapacity(conditionsOf(actor));
  const spent = combatant.turn.actionsSpent;
  return {
    capacity,
    spent,
    reactionUsed: combatant.turn.reactionUsed,
    overspent: Math.max(0, spent - capacity.total),
  };
}
