/**
 * What every operation that makes or changes a token shares (ADR 0017): who may
 * see one, how big it is, which grid measures it, and how it is stored.
 *
 * **Visibility is derived here and nowhere else.** A token is `observer` for
 * everyone when its scene is the party's current scene and it is not hidden, and
 * `none` otherwise (the GM always owns everything regardless). A client never
 * sets it. Every code path that changes a token's scene, its `hidden` flag, or the
 * party's scene calls `tokenPermissions`, because a path that forgot would leak a
 * monster; the B.1 deletion rule (`broadcastFor`) then takes the token away from
 * players who already held it.
 */

import type {
  Actor,
  DocumentPermissions,
  GridStrategy,
  Scene,
  Token,
} from '@hearthtable/core';
import { GridlessGrid, partySchema, tokenSchema } from '@hearthtable/core';
import {
  characterDataSchema,
  footprintForSize,
  npcDataSchema,
  SquareGrid,
} from '@hearthtable/pf2e';

import type { CompendiumIndex } from './compendium.js';
import type { WorldStore } from './worldStore.js';

/** The permissions a token has: visible to every seat, or to the GM alone. */
export function tokenPermissions(visible: boolean): DocumentPermissions {
  return { default: visible ? 'observer' : 'none', seats: {} };
}

/** Whether `sceneId` is the scene the party is in right now. */
export function isSceneActive(store: WorldStore, sceneId: string): boolean {
  const [raw] = store.listDocuments('party');
  const party = partySchema.safeParse(raw);
  return party.success && party.data.sceneId === sceneId;
}

/** The grid a scene is measured and snapped with: the PF2e square grid, or freeform for a gridless scene. */
export function gridFor(scene: Pick<Scene, 'grid'>): GridStrategy {
  return scene.grid.type === 'none'
    ? new GridlessGrid(scene.grid)
    : new SquareGrid(scene.grid);
}

/**
 * A token's footprint in squares for `actor`: a creature's size for an NPC, a
 * character's ancestry size when its ancestry is a compendium entry we have, and
 * one square (Medium) when we cannot tell. The GM can change it by hand, which
 * matters for a Gargantuan creature larger than 4x4.
 */
export function tokenSizeForActor(actor: Actor, compendium: CompendiumIndex): number {
  if (actor.kind === 'npc') {
    const npc = npcDataSchema.safeParse(actor.system);
    return npc.success ? footprintForSize(npc.data.creature.size) : 1;
  }
  if (actor.kind === 'character') {
    const character = characterDataSchema.safeParse(actor.system);
    const source = character.success ? character.data.ancestry?.source : undefined;
    if (source !== undefined) {
      const entry = compendium.get(source.packId, source.slug);
      if (entry?.kind === 'ancestry') {
        return footprintForSize(entry.size);
      }
    }
  }
  return 1;
}

export interface NewToken {
  readonly scene: Scene;
  readonly actor: Actor;
  readonly size: number;
  readonly x: number;
  readonly y: number;
  readonly hidden?: boolean;
}

/** Builds and stores a token of `actor` on `scene`, with its visibility derived from the party's current scene. */
export function placeToken(store: WorldStore, token: NewToken): Token {
  const hidden = token.hidden ?? false;
  const now = new Date().toISOString();
  const created = tokenSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'token',
    schemaVersion: 1,
    permissions: tokenPermissions(isSceneActive(store, token.scene.id) && !hidden),
    createdAt: now,
    updatedAt: now,
    sceneId: token.scene.id,
    actorId: token.actor.id,
    x: token.x,
    y: token.y,
    size: token.size,
    hidden,
  });
  store.putDocument(created);
  return created;
}
