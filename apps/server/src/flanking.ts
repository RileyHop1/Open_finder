/**
 * Flanking, worked out when a strike is rolled (`docs/grid.md`, "Flanking"). Nothing
 * is stored: whether a target is flanked depends on where every token stands *now*, so
 * it is derived from the scene at the moment of the roll. The geometry is
 * `flanks` in `systems/pf2e`; this module finds the tokens and the sides.
 *
 * - **Sides:** a party member's token is on the party's side; everything else (monsters,
 *   a character not yet in the party) is on the other. A hazard takes no side.
 * - **Who can flank:** the attacker and any token on its side, other than the target,
 *   whose actor is not unconscious, dying, dead, paralyzed or petrified.
 * - **Reach:** each token's natural reach (its size in squares times the grid's
 *   distance). A reach weapon would extend it; that is not modelled yet and is noted in
 *   `docs/rulings.md`.
 * - **Melee only**, and only on a gridded scene: a gridless scene has no squares to
 *   threaten, so nothing flanks there.
 */

import type { Actor, Footprint, Token } from '@hearthtable/core';
import { actorSchema, partySchema, sceneSchema, tokenSchema } from '@hearthtable/core';
import { characterDataSchema, flanks, npcDataSchema } from '@hearthtable/pf2e';

import { gridFor } from './tokens.js';
import type { WorldStore } from './worldStore.js';

/** Conditions that keep a creature from flanking: it cannot act, so it threatens nothing. */
const CANNOT_FLANK = ['unconscious', 'dying', 'dead', 'paralyzed', 'petrified'];

function conditionSlugs(actor: Actor): string[] {
  const data =
    actor.kind === 'character'
      ? characterDataSchema.safeParse(actor.system).data
      : actor.kind === 'npc'
        ? npcDataSchema.safeParse(actor.system).data
        : undefined;
  return data?.conditions.map((condition) => condition.slug) ?? [];
}

function footprintOf(token: Token): Footprint {
  return { center: { x: token.x, y: token.y }, size: token.size };
}

/**
 * Whether `attackerActorId`'s melee strike at `target` is made while flanking: some
 * token of the attacker and some other token on its side, both threatening the
 * target from opposite sides. False for a ranged strike, a gridless scene, an
 * attacker with no token on the target's scene, or a target on the attacker's own side.
 */
export function isFlanking(
  store: WorldStore,
  attackerActorId: string,
  target: Token,
  options: { readonly ranged: boolean },
): boolean {
  if (options.ranged) {
    return false;
  }
  const scene = sceneSchema.safeParse(store.getDocument(target.sceneId));
  if (!scene.success || scene.data.grid.type === 'none') {
    return false;
  }
  const grid = gridFor(scene.data);
  const [rawParty] = store.listDocuments('party');
  const members = new Set(partySchema.safeParse(rawParty).data?.memberIds ?? []);
  const sideOf = (actorId: string): 'party' | 'other' =>
    members.has(actorId) ? 'party' : 'other';
  const side = sideOf(attackerActorId);
  if (sideOf(target.actorId) === side) {
    return false;
  }

  const onScene = store
    .listDocuments('token')
    .flatMap((raw) => {
      const token = tokenSchema.safeParse(raw);
      return token.success && token.data.sceneId === target.sceneId ? [token.data] : [];
    })
    .filter((token) => token.id !== target.id);
  const reachOf = (token: Token): number => token.size * scene.data.grid.distance;

  const attackers = onScene.filter((token) => token.actorId === attackerActorId);
  const allies = onScene.filter((token) => {
    if (token.actorId === attackerActorId || sideOf(token.actorId) !== side) {
      return false;
    }
    const actor = actorSchema.safeParse(store.getDocument(token.actorId));
    return (
      actor.success &&
      (actor.data.kind === 'character' || actor.data.kind === 'npc') &&
      !conditionSlugs(actor.data).some((slug) => CANNOT_FLANK.includes(slug))
    );
  });

  return attackers.some((attacker) =>
    allies.some((ally) =>
      flanks(
        grid,
        footprintOf(target),
        { footprint: footprintOf(attacker), reachFeet: reachOf(attacker) },
        { footprint: footprintOf(ally), reachFeet: reachOf(ally) },
      ),
    ),
  );
}
