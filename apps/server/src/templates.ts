/**
 * Area templates on the wire (`docs/template.md`). Placing one stores a
 * `template` document every seat can read and posts the creatures it catches to
 * chat. **Nothing is applied**: the GM confirms targets (`docs/grid.md`,
 * "Templates").
 *
 * The caught list is derived, never stored: the template's cells from the
 * scene's grid, matched against the cells each token on the scene covers.
 * Hidden tokens are named only in a GM-only line, so a player is never told
 * where an unseen creature stands.
 */

import type { ChatTextMessage, Seat, Template, Token } from '@hearthtable/core';
import { actorSchema, sceneSchema, templateSchema, tokenSchema } from '@hearthtable/core';

import { footprintOf } from './flanking.js';
import { OperationRejected } from './rejection.js';
import { gridFor } from './tokens.js';
import type { WorldStore } from './worldStore.js';

/** What `template.place` changed: the new template and the chat lines about it. */
export interface TemplatePlacement {
  readonly template: Template;
  readonly messages: ChatTextMessage[];
}

function loadTemplate(store: WorldStore, templateId: string): Template | undefined {
  return templateSchema.safeParse(store.getDocument(templateId)).data;
}

/** The tokens of `scene` whose squares overlap the template's. */
export function creaturesCaught(store: WorldStore, template: Template): Token[] {
  const scene = sceneSchema.safeParse(store.getDocument(template.sceneId)).data;
  if (scene === undefined || scene.grid.type === 'none') {
    return [];
  }
  const grid = gridFor(scene);
  const origin = { x: template.x, y: template.y };
  const aim = { x: template.toX ?? template.x, y: template.toY ?? template.y };
  const source = tokenSchema.safeParse(store.getDocument(template.tokenId ?? '')).data;
  const cells =
    template.shape === 'burst'
      ? grid.burst(origin, template.feet)
      : template.shape === 'cone'
        ? grid.cone(origin, aim, template.feet)
        : template.shape === 'line'
          ? grid.line(origin, aim, template.widthFeet, template.feet)
          : source === undefined
            ? []
            : grid.emanation(footprintOf(source), template.feet);
  const covered = new Set(cells.map((cell) => `${cell.col},${cell.row}`));

  return store.listDocuments('token').flatMap((raw) => {
    const token = tokenSchema.safeParse(raw);
    if (!token.success || token.data.sceneId !== template.sceneId) {
      return [];
    }
    const touches = grid
      .cellsUnder(footprintOf(token.data))
      .some((cell) => covered.has(`${cell.col},${cell.row}`));
    return touches ? [token.data] : [];
  });
}

function nameOf(store: WorldStore, token: Token): string {
  if (token.name !== undefined) {
    return token.name;
  }
  return actorSchema.safeParse(store.getDocument(token.actorId)).data?.name ?? 'Unknown';
}

function say(
  store: WorldStore,
  seat: Seat,
  text: string,
  visibleToAll: boolean,
): ChatTextMessage {
  const now = new Date().toISOString();
  const message: ChatTextMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: { default: visibleToAll ? 'observer' : 'none', seats: {} },
    createdAt: now,
    updatedAt: now,
    seatId: seat.id,
    kind: 'text',
    text,
  };
  store.putDocument(message);
  return message;
}

/**
 * Places a template. Needs a gridded scene (a gridless scene has no squares to
 * list creatures from), an aim point for a cone or line, and a token on the
 * scene for an emanation. A burst or cone origin is snapped to a square the way
 * a token snaps; a line and a cone's aim are kept as given.
 */
export function placeTemplate(
  store: WorldStore,
  seat: Seat,
  payload: {
    sceneId: string;
    shape: Template['shape'];
    at: { x: number; y: number };
    to?: { x: number; y: number } | undefined;
    feet: number;
    widthFeet?: number | undefined;
    tokenId?: string | undefined;
    label?: string | undefined;
  },
): TemplatePlacement {
  const scene = sceneSchema.safeParse(store.getDocument(payload.sceneId));
  if (!scene.success) {
    throw new OperationRejected(`no scene found with id ${payload.sceneId}`);
  }
  if (scene.data.grid.type === 'none') {
    throw new OperationRejected('area templates need a gridded scene');
  }
  if (
    (payload.shape === 'cone' || payload.shape === 'line') &&
    payload.to === undefined
  ) {
    throw new OperationRejected(`a ${payload.shape} needs a point to aim at`);
  }

  let origin = payload.at;
  if (payload.shape === 'emanation') {
    const source = tokenSchema.safeParse(store.getDocument(payload.tokenId ?? ''));
    if (!source.success || source.data.sceneId !== scene.data.id) {
      throw new OperationRejected('an emanation needs a token on this scene');
    }
    origin = { x: source.data.x, y: source.data.y };
  } else if (payload.shape === 'burst' || payload.shape === 'cone') {
    origin = gridFor(scene.data).snap(payload.at, 1);
  }

  const now = new Date().toISOString();
  const template = templateSchema.parse({
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'template',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: now,
    updatedAt: now,
    sceneId: scene.data.id,
    shape: payload.shape,
    x: origin.x,
    y: origin.y,
    ...(payload.to === undefined ? {} : { toX: payload.to.x, toY: payload.to.y }),
    feet: payload.feet,
    ...(payload.widthFeet === undefined ? {} : { widthFeet: payload.widthFeet }),
    ...(payload.tokenId === undefined ? {} : { tokenId: payload.tokenId }),
    ...(payload.label === undefined ? {} : { label: payload.label }),
    placedBy: seat.id,
  });
  store.putDocument(template);

  const caught = creaturesCaught(store, template);
  const shown = caught.filter((token) => !token.hidden).map((t) => nameOf(store, t));
  const unseen = caught.filter((token) => token.hidden).map((t) => nameOf(store, t));
  const what = `${template.label ?? 'an area'} (${String(template.feet)}-foot ${template.shape})`;
  const messages = [
    say(
      store,
      seat,
      `${seat.name} placed ${what}: ${shown.length === 0 ? 'no creatures caught' : `caught ${shown.join(', ')}`}.`,
      true,
    ),
  ];
  if (unseen.length > 0) {
    messages.push(
      say(store, seat, `Also caught by ${what}, unseen: ${unseen.join(', ')}.`, false),
    );
  }
  return { template, messages };
}

/**
 * Removes a template: the GM, or the seat that placed it. Returns the removed
 * document's tombstone, or undefined if it was already gone.
 */
export function removeTemplate(
  store: WorldStore,
  seat: Seat,
  payload: { templateId: string },
): Template | undefined {
  const template = loadTemplate(store, payload.templateId);
  if (template === undefined) {
    return undefined;
  }
  if (!seat.isGM && template.placedBy !== seat.id) {
    throw new OperationRejected(
      'only the GM or the seat that placed a template can remove it',
    );
  }
  store.deleteDocument(template.id);
  return template;
}
