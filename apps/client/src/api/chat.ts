/**
 * The client's view of `apps/server`'s chat history route -- see
 * docs/chatMessage.md, "Reading history". New messages arrive live over the
 * `broadcast` event (`stores/chat.ts`); this is only for catching up on
 * whatever already exists when a client connects, since the operation log
 * cannot be replayed to reconstruct it (a `chat.sendRoll` operation's
 * payload is the raw expression text, not the evaluated result).
 */

import { type ChatMessage, chatMessageSchema } from '@hearthtable/core';
import { z } from 'zod';

function assertOk(response: Response, action: string): void {
  if (!response.ok) {
    throw new Error(`failed to ${action}: server responded ${response.status}`);
  }
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  return schema.parse(body);
}

/** Every chat message already sent in `worldId`, oldest first. */
export async function listChatMessages(worldId: string): Promise<ChatMessage[]> {
  const response = await fetch(`/api/worlds/${worldId}/documents?type=chatMessage`);
  assertOk(response, 'load chat history');
  return parseJson(response, z.array(chatMessageSchema));
}
