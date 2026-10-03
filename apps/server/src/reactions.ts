/**
 * Reaction prompts (`docs/action-economy.md`, "Reactions"): when a token moves out
 * of a square a creature with **Reactive Strike** threatens, that creature's owner is
 * told it may react. The reaction is **never spent for them**: auto-spending takes a
 * real tactical decision away from the player, and a missing prompt is acceptable
 * where a wrong automatic reaction is not.
 *
 * - **Only in an active combat**, on a gridded scene, and only for a move that
 *   actually changed the token's square.
 * - **Who may react:** a character carrying the Reactive Strike feature, on the other
 *   side from the mover (party versus everyone else), able to act, with its reaction
 *   not yet used this round, threatening the square the mover left. Reach is natural
 *   reach. Monsters are not offered it: a creature entry has no abilities list yet.
 * - **The prompt** is a chat line seen only by the reactor's owners and the GM, so a
 *   player is never told what another player may do. A mover the table cannot see is
 *   called "a hidden creature".
 */

import type { ChatTextMessage, Seat, Token } from '@hearthtable/core';
import {
  actorSchema,
  combatantSchema,
  combatSchema,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';
import { characterDataSchema, threatens } from '@hearthtable/pf2e';

import { canAct, footprintOf, sideResolver } from './flanking.js';
import { gridFor } from './tokens.js';
import type { WorldStore } from './worldStore.js';

/** The slug of the feature that grants the reaction. */
export const REACTIVE_STRIKE = 'reactive-strike';

/**
 * The prompts owed for a move of `mover`: `before` is the token as it was, `after` as
 * it is now. Returns the chat lines posted, one per creature that may react.
 */
export function promptReactions(
  store: WorldStore,
  seat: Seat,
  before: Token,
  after: Token,
): ChatTextMessage[] {
  if (before.x === after.x && before.y === after.y) {
    return [];
  }
  const combat = store
    .listDocuments('combat')
    .flatMap((raw) => {
      const parsed = combatSchema.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .find((entry) => entry.status === 'active' && entry.sceneId === after.sceneId);
  const scene = sceneSchema.safeParse(store.getDocument(after.sceneId));
  if (combat === undefined || !scene.success || scene.data.grid.type === 'none') {
    return [];
  }
  const grid = gridFor(scene.data);
  const sideOf = sideResolver(store);
  const moverSide = sideOf(after.actorId);
  const moverActor = actorSchema.safeParse(store.getDocument(after.actorId));
  const moverVisible = after.permissions.default !== 'none';
  const moverName = moverVisible
    ? (after.name ?? (moverActor.success ? moverActor.data.name : 'A creature'))
    : 'A hidden creature';

  const combatants = store.listDocuments('combatant').flatMap((raw) => {
    const parsed = combatantSchema.safeParse(raw);
    return parsed.success && parsed.data.combatId === combat.id ? [parsed.data] : [];
  });

  const messages: ChatTextMessage[] = [];
  for (const raw of store.listDocuments('token')) {
    const token = tokenSchema.safeParse(raw);
    if (
      !token.success ||
      token.data.sceneId !== after.sceneId ||
      token.data.id === after.id ||
      sideOf(token.data.actorId) === moverSide
    ) {
      continue;
    }
    const actor = actorSchema.safeParse(store.getDocument(token.data.actorId));
    const sheet =
      actor.success && actor.data.kind === 'character'
        ? characterDataSchema.safeParse(actor.data.system).data
        : undefined;
    const combatant = combatants.find((entry) => entry.tokenId === token.data.id);
    if (
      !actor.success ||
      sheet === undefined ||
      !canAct(actor.data) ||
      combatant === undefined ||
      combatant.turn.reactionUsed ||
      combatant.defeated ||
      !sheet.items.some((item) => item.entry.slug === REACTIVE_STRIKE) ||
      !threatens(
        grid,
        footprintOf(token.data),
        token.data.size * scene.data.grid.distance,
        footprintOf(before),
      )
    ) {
      continue;
    }

    const owners = Object.entries(actor.data.permissions.seats)
      .filter(([, level]) => level === 'owner')
      .map(([seatId]) => seatId);
    const now = new Date().toISOString();
    const message: ChatTextMessage = {
      id: crypto.randomUUID(),
      worldId: store.world.id,
      type: 'chatMessage',
      schemaVersion: 1,
      permissions: {
        default: 'none',
        seats: Object.fromEntries(owners.map((seatId) => [seatId, 'observer' as const])),
      },
      createdAt: now,
      updatedAt: now,
      seatId: seat.id,
      kind: 'text',
      text: `${actor.data.name} can use Reactive Strike: ${moverName} moved out of their reach.`,
    };
    store.putDocument(message);
    messages.push(message);
  }
  return messages;
}
