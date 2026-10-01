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
  BaseDocument,
  DocumentPermissions,
  GridStrategy,
  Scene,
  Seat,
  Token,
  tokenChangesSchema,
} from '@hearthtable/core';
import {
  actorSchema,
  baseDocumentSchema,
  GridlessGrid,
  partySchema,
  sceneSchema,
  tokenSchema,
} from '@hearthtable/core';
import {
  characterDataSchema,
  footprintForSize,
  npcDataSchema,
  SquareGrid,
} from '@hearthtable/pf2e';
import type { z } from 'zod';

import type { CompendiumIndex } from './compendium.js';
import { OperationRejected } from './rejection.js';
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

type TokenChanges = z.infer<typeof tokenChangesSchema>;

function requireGM(seat: Seat): void {
  if (!seat.isGM) {
    throw new OperationRejected('only the GM can change tokens');
  }
}

function loadToken(store: WorldStore, tokenId: string): Token {
  const token = tokenSchema.safeParse(store.getDocument(tokenId));
  if (!token.success) {
    throw new OperationRejected(`no token found with id ${tokenId}`);
  }
  return token.data;
}

/** `point` snapped to `scene`'s grid for a token of `size`, and kept on the scene. */
function snapOnScene(
  scene: Scene,
  point: { x: number; y: number },
  size: number,
): { x: number; y: number } {
  const snapped = gridFor(scene).snap(point, size);
  return {
    x: Math.min(Math.max(snapped.x, 0), scene.width),
    y: Math.min(Math.max(snapped.y, 0), scene.height),
  };
}

/**
 * Puts a token of an actor on a scene. Any actor may have one, hazards included
 * (they are on the map even though they cannot join the party). Its size comes
 * from the actor, its position is snapped to the grid, and whether players can
 * see it is derived: the GM can pre-place a token on a scene the party has not
 * reached, and it stays invisible until the party arrives.
 */
export function createToken(
  store: WorldStore,
  compendium: CompendiumIndex,
  seat: Seat,
  payload: {
    sceneId: string;
    actorId: string;
    at?: { x: number; y: number } | undefined;
    hidden?: boolean | undefined;
  },
): Token {
  requireGM(seat);
  const scene = sceneSchema.safeParse(store.getDocument(payload.sceneId));
  if (!scene.success) {
    throw new OperationRejected(`no scene found with id ${payload.sceneId}`);
  }
  const actor = actorSchema.safeParse(store.getDocument(payload.actorId));
  if (!actor.success) {
    throw new OperationRejected(`no actor found with id ${payload.actorId}`);
  }
  const { width, height } = scene.data;
  const at = payload.at ?? { x: width / 2, y: height / 2 };
  if (at.x > width || at.y > height) {
    throw new OperationRejected(
      `the token must be on the scene (0 to ${width} across, 0 to ${height} down)`,
    );
  }
  const size = tokenSizeForActor(actor.data, compendium);
  return placeToken(store, {
    scene: scene.data,
    actor: actor.data,
    size,
    ...snapOnScene(scene.data, at, size),
    ...(payload.hidden === undefined ? {} : { hidden: payload.hidden }),
  });
}

/**
 * Hides, shows, resizes, or relabels a token. **Visibility is re-derived** from
 * the new `hidden` flag and whether the token's scene is the party's, so a token
 * hidden here is taken away from players who hold it (the deletion rule in
 * `broadcastFor`), and one shown reaches them. A resize re-snaps the token, since
 * a two-square token is centred on a grid intersection and a one-square one on a
 * cell.
 */
export function updateToken(
  store: WorldStore,
  seat: Seat,
  payload: { tokenId: string; changes: TokenChanges },
): Token {
  requireGM(seat);
  const token = loadToken(store, payload.tokenId);
  const { name, ...fields } = payload.changes;
  const merged: Record<string, unknown> = {
    ...token,
    ...fields,
    updatedAt: new Date().toISOString(),
  };
  if (name === null) {
    delete merged['name'];
  } else if (name !== undefined) {
    merged['name'] = name;
  }

  const size = fields.size ?? token.size;
  const hidden = fields.hidden ?? token.hidden;
  merged['permissions'] = tokenPermissions(
    isSceneActive(store, token.sceneId) && !hidden,
  );
  if (fields.size !== undefined && fields.size !== token.size) {
    const scene = sceneSchema.safeParse(store.getDocument(token.sceneId));
    if (scene.success) {
      Object.assign(merged, snapOnScene(scene.data, token, size));
    }
  }

  const result = tokenSchema.safeParse(merged);
  if (!result.success) {
    throw new OperationRejected(`invalid change: ${result.error.issues[0]?.message}`);
  }
  store.putDocument(result.data);
  return result.data;
}

/** Takes a token off its scene and returns its bare envelope. The actor is untouched. */
export function deleteToken(
  store: WorldStore,
  seat: Seat,
  payload: { tokenId: string },
): BaseDocument {
  requireGM(seat);
  const token = loadToken(store, payload.tokenId);
  store.deleteDocument(token.id);
  return baseDocumentSchema.parse(token);
}

/**
 * Deletes every token of `actorId`, on any scene, and returns their bare
 * envelopes. Called when the actor itself is deleted, so no token is left
 * pointing at nothing. Not GM-checked: the seat deleting an actor may be its
 * owner.
 */
export function deleteTokensOf(store: WorldStore, actorId: string): BaseDocument[] {
  const removed: BaseDocument[] = [];
  for (const raw of store.listDocuments('token')) {
    const token = tokenSchema.safeParse(raw);
    if (token.success && token.data.actorId === actorId) {
      store.deleteDocument(token.data.id);
      removed.push(baseDocumentSchema.parse(token.data));
    }
  }
  return removed;
}
