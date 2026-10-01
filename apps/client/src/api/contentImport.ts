/**
 * The client's view of the in-app content import (`docs/content-import.md`,
 * ADR 0016): what the compendium holds, how an import is going, and the GM's
 * button that starts one. Status is readable by every seat; starting is the
 * GM's, and the device token says who is asking.
 */

import { z } from 'zod';

import { getDeviceToken } from '../realtime/deviceToken.js';

const importStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('running'), startedAt: z.string() }),
  z.object({ state: z.literal('done'), finishedAt: z.string(), entryCount: z.number() }),
  z.object({
    state: z.literal('failed'),
    finishedAt: z.string(),
    message: z.string(),
    detail: z.string().optional(),
  }),
]);

export type ImportState = z.infer<typeof importStateSchema>;

const contentStatusSchema = z.object({ available: z.boolean(), entryCount: z.number() });

export type ContentStatus = z.infer<typeof contentStatusSchema>;

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

/** What the compendium holds right now. */
export async function getContentStatus(): Promise<ContentStatus> {
  const response = await fetch('/api/compendium');
  if (!response.ok) {
    throw new Error(
      `failed to check the game content: server responded ${response.status}`,
    );
  }
  return contentStatusSchema.parse(await readJson(response));
}

/** How the import is going. Throws if this server cannot import at all. */
export async function getImportStatus(): Promise<ImportState> {
  const response = await fetch('/api/compendium/import');
  if (!response.ok) {
    throw new Error(`failed to check the import: server responded ${response.status}`);
  }
  return importStateSchema.parse(await readJson(response));
}

/** Starts an import. Resolves with the state after asking (an import already running is not an error). Throws the server's message if it refuses. */
export async function startImport(): Promise<ImportState> {
  const response = await fetch('/api/compendium/import', {
    method: 'POST',
    headers: { 'x-device-token': getDeviceToken() },
  });
  const body = await readJson(response);
  if (response.status === 202 || response.status === 409) {
    return importStateSchema.parse(body);
  }
  const reason = z.object({ error: z.string() }).safeParse(body);
  throw new Error(
    reason.success
      ? reason.data.error
      : `failed to start the import: server responded ${response.status}`,
  );
}
