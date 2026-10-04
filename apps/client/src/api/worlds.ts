/**
 * The client's view of `apps/server`'s world-setup REST API (`app.ts`) --
 * list, create, and activate a campaign. This is plain request/response, not
 * an ADR 0005 operation: creating and activating a world is GM setup, done
 * before anyone connects over the realtime channel, not gameplay that needs
 * a sequence number or a broadcast.
 *
 * Every response is validated against `@hearthtable/core`'s own
 * `worldSchema` before this module hands it back -- the same schema the
 * server validated against on the way in, so a shape mismatch between the
 * two ends of this fetch surfaces as a thrown error here, not as a
 * quietly-wrong `World` object the UI renders without knowing better.
 */

import { type World, worldSchema } from '@hearthtable/core';
import { z } from 'zod';

import { getDeviceToken } from '../realtime/deviceToken.js';

const WORLDS_URL = '/api/worlds';

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  return schema.parse(body);
}

/** The server's own `{ error }` body, if the response has one readable as JSON. */
async function serverError(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body) {
      const { error } = body;
      return typeof error === 'string' ? error : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (!response.ok) {
    const reason = await serverError(response);
    throw new Error(reason ?? `failed to ${action}: server responded ${response.status}`);
  }
}

/** Every campaign that exists, whether or not it is currently active. */
export async function listWorlds(): Promise<World[]> {
  const response = await fetch(WORLDS_URL);
  await assertOk(response, 'list campaigns');
  return parseJson(response, z.array(worldSchema));
}

/** Creates a new campaign. Does not activate it -- see `app.ts`'s own note on why those stay separate steps. */
export async function createWorld(name: string): Promise<World> {
  const response = await fetch(WORLDS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await assertOk(response, 'create campaign');
  return parseJson(response, worldSchema);
}

/** Makes `id` the server's active campaign. */
export async function activateWorld(id: string): Promise<World> {
  const response = await fetch(`${WORLDS_URL}/${id}/activate`, { method: 'POST' });
  await assertOk(response, 'activate campaign');
  return parseJson(response, worldSchema);
}

/** The campaign the server is currently serving, or `undefined` if none is active. */
export async function getActiveWorld(): Promise<World | undefined> {
  const response = await fetch(`${WORLDS_URL}/active`);
  if (response.status === 404) {
    return undefined;
  }
  await assertOk(response, 'fetch the active campaign');
  return parseJson(response, worldSchema);
}

/** Leaves the active campaign: back to the campaign list, for everyone at the table. GM only. */
export async function deactivateWorld(): Promise<void> {
  const response = await fetch(`${WORLDS_URL}/active/deactivate`, {
    method: 'POST',
    headers: { 'x-device-token': getDeviceToken() },
  });
  await assertOk(response, 'leave the campaign');
}
