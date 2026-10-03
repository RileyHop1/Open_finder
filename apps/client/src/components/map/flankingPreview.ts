/**
 * A live preview of flanking while picking a target (M5 C.10): the same
 * algorithm `apps/server/src/flanking.ts`'s `isFlanking` uses, minus its
 * `WorldStore` dependency, so it can run entirely from what the client
 * already has (the scene's tokens and the party's membership).
 *
 * This is a **hint**, not the final answer: it skips the server's `canAct`
 * filter (an unconscious, dying, dead, paralyzed, or petrified ally still
 * "flanks" here), so the `flanking` field on the strike's own chat card is
 * always authoritative. Callers must also only ask for melee strikes --
 * "a ranged or thrown strike never flanks" (`docs/grid.md`).
 */
import type { GridStrategy } from '@hearthtable/core';
import { flanks } from '@hearthtable/pf2e';

export type Side = 'party' | 'other';

export interface FlankingToken {
  readonly id: string;
  readonly actorId: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

/**
 * Whether some token of `attackerActorId`'s side (the attacker included)
 * and some other token of that side flank `target`, by the grid's own
 * reach rule. `target` is never counted as one of its own flankers.
 */
export function wouldFlank(
  grid: GridStrategy,
  sideOf: (actorId: string) => Side,
  attackerActorId: string,
  target: FlankingToken,
  tokensOnScene: readonly FlankingToken[],
): boolean {
  const side = sideOf(attackerActorId);
  if (sideOf(target.actorId) === side) {
    return false;
  }
  const onScene = tokensOnScene.filter((token) => token.id !== target.id);
  const attackers = onScene.filter((token) => token.actorId === attackerActorId);
  const allies = onScene.filter(
    (token) => token.actorId !== attackerActorId && sideOf(token.actorId) === side,
  );
  const reachFeetOf = (token: FlankingToken): number => token.size * grid.grid.distance;
  const targetFootprint = { center: { x: target.x, y: target.y }, size: target.size };
  const footprintOf = (token: FlankingToken) => ({
    footprint: { center: { x: token.x, y: token.y }, size: token.size },
    reachFeet: reachFeetOf(token),
  });
  return attackers.some((attacker) =>
    allies.some((ally) =>
      flanks(grid, targetFootprint, footprintOf(attacker), footprintOf(ally)),
    ),
  );
}
