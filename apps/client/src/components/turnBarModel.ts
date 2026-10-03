/**
 * What the turn bar shows for each combatant, worked out from documents this seat
 * can already read. A creature's label follows the token rule (its own label, else
 * its actor's name, else "Unknown"), so a player is never given a monster's real
 * name by the bar. Kept apart from the component so the rules are testable
 * without mounting anything.
 */

import type { Actor, Combatant, Token } from '@hearthtable/core';

import { assetUrl } from '../api/assets.js';
import { initialsOf, UNKNOWN_LABEL } from './map/tokenModel.js';

export interface TurnBarItem {
  readonly id: string;
  /** The token to focus on the map, when this seat can see it. */
  readonly tokenId: string | undefined;
  readonly label: string;
  readonly initials: string;
  readonly portraitUrl: string | undefined;
  /** Absent until rolled. */
  readonly initiative: number | undefined;
  readonly active: boolean;
  readonly defeated: boolean;
}

export function turnBarItems(
  order: readonly Combatant[],
  activeId: string | undefined,
  tokens: readonly Token[],
  actorOf: (actorId: string) => Actor | undefined,
  worldId: string,
): TurnBarItem[] {
  return order.map((combatant) => {
    const token = tokens.find((t) => t.id === combatant.tokenId);
    const actor = actorOf(combatant.actorId);
    const label = token?.name ?? actor?.name ?? UNKNOWN_LABEL;
    return {
      id: combatant.id,
      tokenId: token?.id,
      label,
      initials: initialsOf(label),
      portraitUrl:
        actor?.portrait === undefined ? undefined : assetUrl(worldId, actor.portrait),
      initiative: combatant.initiative,
      active: combatant.id === activeId,
      defeated: combatant.defeated,
    };
  });
}
