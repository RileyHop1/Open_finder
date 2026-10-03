/**
 * The client's view of `apps/server`'s generic documents route, for the types
 * the character sheet and party bar need. The device token goes with the
 * request so the server can filter by what this seat may read
 * (`docs/operations.md`, "Who receives what"): without it the server treats the
 * caller as having no seat and returns only what everyone can see.
 */

import {
  type Actor,
  actorSchema,
  type Combat,
  combatSchema,
  type Combatant,
  combatantSchema,
  type Party,
  partySchema,
  type Scene,
  sceneSchema,
  type Template,
  templateSchema,
  type Token,
  tokenSchema,
} from '@hearthtable/core';
import { z } from 'zod';

import { getDeviceToken } from '../realtime/deviceToken.js';

async function fetchDocuments<T>(
  worldId: string,
  type: string,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const response = await fetch(`/api/worlds/${worldId}/documents?type=${type}`, {
    headers: { 'x-device-token': getDeviceToken() },
  });
  if (!response.ok) {
    throw new Error(
      `failed to load ${type} documents: server responded ${response.status}`,
    );
  }
  const body: unknown = await response.json();
  return z.array(schema).parse(body);
}

/** Every actor in `worldId` this seat can read. */
export function listActors(worldId: string): Promise<Actor[]> {
  return fetchDocuments(worldId, 'actor', actorSchema);
}

/** The world's party, or `undefined` if none has been created yet. */
export async function getParty(worldId: string): Promise<Party | undefined> {
  const [party] = await fetchDocuments(worldId, 'party', partySchema);
  return party;
}

/** Every scene in `worldId` this seat can read: a player gets only the party's scene. */
export function listScenes(worldId: string): Promise<Scene[]> {
  return fetchDocuments(worldId, 'scene', sceneSchema);
}

/** Every token in `worldId` this seat can read: a player gets none that are hidden or off the party's scene. */
export function listTokens(worldId: string): Promise<Token[]> {
  return fetchDocuments(worldId, 'token', tokenSchema);
}

/** Every combat in `worldId` this seat can read: a player gets none while one is only set up. */
export function listCombats(worldId: string): Promise<Combat[]> {
  return fetchDocuments(worldId, 'combat', combatSchema);
}

/** Every combatant in `worldId` this seat can read: a hidden creature's is left out. */
export function listCombatants(worldId: string): Promise<Combatant[]> {
  return fetchDocuments(worldId, 'combatant', combatantSchema);
}

/** Every area template in `worldId` this seat can read: every seat sees every one. */
export function listTemplates(worldId: string): Promise<Template[]> {
  return fetchDocuments(worldId, 'template', templateSchema);
}
