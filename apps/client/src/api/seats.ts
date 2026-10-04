/**
 * The client's view of `apps/server`'s seat-setup REST routes (`app.ts`) --
 * list and create seats for a world. Like `worlds.ts`, this is plain
 * request/response, not an ADR 0005 operation: a GM adding a seat to the
 * roster is setup, not gameplay. Claiming and releasing a seat, in
 * contrast, ARE operations (`../realtime/socket.ts`) -- they need to be
 * attributed to a connection and broadcast live to everyone else in the
 * lobby, which REST has no mechanism for.
 *
 * Every response is validated against `@hearthtable/core`'s own
 * `seatSchema`, the same way `worlds.ts` validates against `worldSchema`.
 */

import { type Seat, seatSchema } from '@hearthtable/core';
import { z } from 'zod';

function seatsUrl(worldId: string): string {
  return `/api/worlds/${worldId}/seats`;
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

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  return schema.parse(body);
}

/** Every seat in `worldId`, claimed or not -- `claimedByDeviceToken` included, not redacted (see `seatSchema`'s own docs on why). */
export async function listSeats(worldId: string): Promise<Seat[]> {
  const response = await fetch(seatsUrl(worldId));
  await assertOk(response, 'list seats');
  return parseJson(response, z.array(seatSchema));
}

/** Adds a new, unclaimed seat to `worldId`'s roster. */
export async function createSeat(
  worldId: string,
  name: string,
  isGM: boolean,
  pin?: string,
): Promise<Seat> {
  const response = await fetch(seatsUrl(worldId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin === undefined ? { name, isGM } : { name, isGM, pin }),
  });
  await assertOk(response, 'create seat');
  return parseJson(response, seatSchema);
}
