/**
 * Scene operations: creating, changing, and deleting a scene (ADR 0017). Only
 * the GM does any of it, since a scene is the GM's prep, and a scene a player
 * cannot read is invisible to them. Like the other handler modules these take
 * the already-resolved `Seat` and a `WorldStore` and return what changed, so
 * they are tested without a socket and `realtime.ts` only dispatches.
 *
 * A new scene is hidden from players (`none`). Making one readable is moving the
 * party there (`activateScene`), so nothing else here can leak a scene the GM is
 * still building.
 */

import type { BaseDocument, Party, Scene, Seat, Token } from '@hearthtable/core';
import {
  actorSchema,
  baseDocumentSchema,
  sceneSchema,
  tokenSchema,
  type sceneChangesSchema,
} from '@hearthtable/core';
import type { z } from 'zod';

import { ASSET_NAME_PATTERN } from './assets.js';
import type { CompendiumIndex } from './compendium.js';
import { clearPartyScene, setPartyScene } from './party.js';
import { OperationRejected } from './rejection.js';
import { gridFor, placeToken, tokenPermissions, tokenSizeForActor } from './tokens.js';
import type { WorldStore } from './worldStore.js';

type SceneChanges = z.infer<typeof sceneChangesSchema>;

function requireGM(seat: Seat): void {
  if (!seat.isGM) {
    throw new OperationRejected('only the GM can change scenes');
  }
}

function loadScene(store: WorldStore, sceneId: string): Scene {
  const scene = sceneSchema.safeParse(store.getDocument(sceneId));
  if (!scene.success) {
    throw new OperationRejected(`no scene found with id ${sceneId}`);
  }
  return scene.data;
}

/** Creates a blank scene: 2000px square, the default grid, no map, hidden from players. */
export function createScene(
  store: WorldStore,
  seat: Seat,
  payload: { name: string; kind: Scene['kind'] },
): Scene {
  requireGM(seat);
  const now = new Date().toISOString();
  const scene = sceneSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'scene',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: now,
    updatedAt: now,
    name: payload.name,
    kind: payload.kind,
  });
  store.putDocument(scene);
  return scene;
}

/**
 * Applies `changes` to a scene. The grid merges field by field, so changing the
 * cell size leaves the offset alone. A background must be a well-formed uploaded
 * image name, the same shape the upload route issues; whether the file is still
 * there is not checked (the server does not track assets, and a missing one
 * shows as a blank map, not an error). The whole scene is re-validated, so a
 * change the schema refuses rejects the batch and writes nothing.
 */
export function updateScene(
  store: WorldStore,
  seat: Seat,
  payload: { sceneId: string; changes: SceneChanges },
): Scene {
  requireGM(seat);
  const scene = loadScene(store, payload.sceneId);
  const { background, grid, ...fields } = payload.changes;
  if (
    background !== undefined &&
    background !== null &&
    !ASSET_NAME_PATTERN.test(background)
  ) {
    throw new OperationRejected('background must be the name of an uploaded image');
  }

  const merged: Record<string, unknown> = {
    ...scene,
    ...fields,
    grid: { ...scene.grid, ...grid },
    updatedAt: new Date().toISOString(),
  };
  if (background === null) {
    delete merged['background'];
  } else if (background !== undefined) {
    merged['background'] = background;
  }

  const result = sceneSchema.safeParse(merged);
  if (!result.success) {
    throw new OperationRejected(`invalid change: ${result.error.issues[0]?.message}`);
  }
  store.putDocument(result.data);
  return result.data;
}

export interface SceneDeletion {
  /** Bare envelopes of everything removed: the scene, then its tokens. */
  readonly deleted: BaseDocument[];
  /** Documents the deletion changed: the party if it was in this scene, and scenes that linked here. */
  readonly changed: BaseDocument[];
}

/**
 * Deletes a scene and everything that only made sense with it: its tokens, the
 * party's pointer to it, and every other scene's exit into it.
 */
export function deleteScene(
  store: WorldStore,
  seat: Seat,
  payload: { sceneId: string },
): SceneDeletion {
  requireGM(seat);
  const scene = loadScene(store, payload.sceneId);
  const deleted: BaseDocument[] = [baseDocumentSchema.parse(scene)];
  store.deleteDocument(scene.id);

  for (const raw of store.listDocuments('token')) {
    const token = baseDocumentSchema.loose().safeParse(raw);
    if (token.success && (token.data as { sceneId?: unknown }).sceneId === scene.id) {
      deleted.push(baseDocumentSchema.parse(token.data));
      store.deleteDocument(token.data.id);
    }
  }

  const changed: BaseDocument[] = [];
  const party: Party | undefined = clearPartyScene(store, scene.id);
  if (party !== undefined) {
    changed.push(party);
  }
  for (const raw of store.listDocuments('scene')) {
    const other = sceneSchema.safeParse(raw);
    if (
      other.success &&
      other.data.links.some((link) => link.targetSceneId === scene.id)
    ) {
      const updated: Scene = {
        ...other.data,
        links: other.data.links.filter((link) => link.targetSceneId !== scene.id),
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(updated);
      changed.push(updated);
    }
  }
  return { deleted, changed };
}

/**
 * Adds an exit to a scene and returns the changed scene. The server issues the
 * link's id. The target must be a scene that exists and is not this one, and the
 * point must lie on this scene, so a link can never sit off the map or lead
 * nowhere. Two exits to the same place are allowed (a door and a trapdoor).
 */
export function addSceneLink(
  store: WorldStore,
  seat: Seat,
  payload: {
    sceneId: string;
    label: string;
    x: number;
    y: number;
    targetSceneId: string;
  },
): Scene {
  requireGM(seat);
  const scene = loadScene(store, payload.sceneId);
  if (payload.targetSceneId === scene.id) {
    throw new OperationRejected('an exit cannot lead back to the scene it is in');
  }
  loadScene(store, payload.targetSceneId);
  if (payload.x > scene.width || payload.y > scene.height) {
    throw new OperationRejected(
      `the exit must be on the scene (0 to ${scene.width} across, 0 to ${scene.height} down)`,
    );
  }
  const updated: Scene = {
    ...scene,
    links: [
      ...scene.links,
      {
        id: crypto.randomUUID(),
        label: payload.label,
        x: payload.x,
        y: payload.y,
        targetSceneId: payload.targetSceneId,
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(sceneSchema.parse(updated));
  return updated;
}

/** Removes an exit. Returns the changed scene, or `undefined` if there was no such exit (not an error). */
export function removeSceneLink(
  store: WorldStore,
  seat: Seat,
  payload: { sceneId: string; linkId: string },
): Scene | undefined {
  requireGM(seat);
  const scene = loadScene(store, payload.sceneId);
  if (!scene.links.some((link) => link.id === payload.linkId)) {
    return undefined;
  }
  const updated: Scene = {
    ...scene,
    links: scene.links.filter((link) => link.id !== payload.linkId),
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/** `scene` with its visibility to players set, stored only if that changed. Returns it if it did. */
function setSceneVisible(
  store: WorldStore,
  scene: Scene,
  visible: boolean,
): Scene | undefined {
  const wanted = visible ? 'observer' : 'none';
  if (scene.permissions.default === wanted) {
    return undefined;
  }
  const updated: Scene = {
    ...scene,
    permissions: { ...scene.permissions, default: wanted },
    updatedAt: new Date().toISOString(),
  };
  store.putDocument(updated);
  return updated;
}

/**
 * Where `count` new party tokens go: a row centred on `center`, one grid cell
 * apart, snapped to the scene's grid and kept on the scene.
 */
function rowPositions(
  scene: Scene,
  center: { x: number; y: number },
  count: number,
  size: number,
): { x: number; y: number }[] {
  const grid = gridFor(scene);
  return Array.from({ length: count }, (_, index) => {
    const snapped = grid.snap(
      { x: center.x + (index - (count - 1) / 2) * scene.grid.size, y: center.y },
      size,
    );
    return {
      x: Math.min(Math.max(snapped.x, 0), scene.width),
      y: Math.min(Math.max(snapped.y, 0), scene.height),
    };
  });
}

/**
 * Moves the party to a scene (ADR 0017, decision 4), in one transaction:
 *
 * - the party's `sceneId` is set (the party is created if there is none yet);
 * - the new scene becomes readable to players, and the scene the party left is
 *   hidden again;
 * - every token on either scene has its visibility re-derived (`tokens.ts`): the
 *   new scene's visible tokens are revealed, the old scene's are hidden;
 * - every party member without a token on the new scene gets one, in a row at
 *   `at` (an exit's position) or the scene's centre.
 *
 * Players who held the old scene and its tokens are told to drop them by the
 * deletion rule in `broadcastFor`. Re-activating the party's current scene is
 * allowed and just places any member who is missing.
 */
export function activateScene(
  store: WorldStore,
  compendium: CompendiumIndex,
  seat: Seat,
  payload: { sceneId: string; at?: { x: number; y: number } | undefined },
): BaseDocument[] {
  requireGM(seat);
  const scene = loadScene(store, payload.sceneId);
  const at = payload.at ?? { x: scene.width / 2, y: scene.height / 2 };
  if (at.x > scene.width || at.y > scene.height) {
    throw new OperationRejected(
      `the arrival point must be on the scene (0 to ${scene.width} across, 0 to ${scene.height} down)`,
    );
  }

  const { party, previousSceneId } = setPartyScene(store, scene.id);
  const changed: BaseDocument[] = [party];

  const revealed = setSceneVisible(store, scene, true);
  if (revealed !== undefined) {
    changed.push(revealed);
  }
  if (previousSceneId !== undefined && previousSceneId !== scene.id) {
    const previous = sceneSchema.safeParse(store.getDocument(previousSceneId));
    const hidden = previous.success
      ? setSceneVisible(store, previous.data, false)
      : undefined;
    if (hidden !== undefined) {
      changed.push(hidden);
    }
  }

  // Re-derive every affected token's visibility, and note who is already here.
  const onNewScene = new Set<string>();
  for (const raw of store.listDocuments('token')) {
    const token = tokenSchema.safeParse(raw);
    if (!token.success) {
      continue;
    }
    if (token.data.sceneId === scene.id) {
      onNewScene.add(token.data.actorId);
    } else if (token.data.sceneId !== previousSceneId) {
      continue;
    }
    const wanted = tokenPermissions(
      token.data.sceneId === scene.id && !token.data.hidden,
    );
    if (token.data.permissions.default !== wanted.default) {
      const updated: Token = {
        ...token.data,
        permissions: wanted,
        updatedAt: new Date().toISOString(),
      };
      store.putDocument(updated);
      changed.push(updated);
    }
  }

  // Place each party member who has no token here yet.
  const arriving = party.memberIds.flatMap((memberId) => {
    const actor = actorSchema.safeParse(store.getDocument(memberId));
    return actor.success && !onNewScene.has(memberId) ? [actor.data] : [];
  });
  arriving.forEach((actor, index) => {
    const size = tokenSizeForActor(actor, compendium);
    const position = rowPositions(scene, at, arriving.length, size)[index];
    if (position !== undefined) {
      changed.push(placeToken(store, { scene, actor, size, ...position }));
    }
  });

  return changed;
}
