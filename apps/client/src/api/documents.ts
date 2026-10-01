/**
 * The client's view of `apps/server`'s generic documents route, for the types
 * the character sheet and party bar need. The device token goes with the
 * request so the server can filter by what this seat may read
 * (`docs/operations.md`, "Who receives what"): without it the server treats the
 * caller as having no seat and returns only what everyone can see.
 */

import { type Actor, actorSchema, type Party, partySchema } from '@hearthtable/core';
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
