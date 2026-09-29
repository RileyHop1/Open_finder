/**
 * The chat log for the currently active campaign: message history, loaded
 * once over REST (`api/chat.ts` -- `apps/server` has no way to replay it
 * from the operation log, see `docs/chatMessage.md`, "Reading history"),
 * then kept live by watching `connectionStore`'s `lastBroadcast` the same
 * way `stores/lobby.ts` does for seats.
 *
 * Sending is optimistic (ADR 0005): a pending entry, tagged with the
 * operation's own client-generated id, appears immediately and is either
 * replaced by the real document once its broadcast arrives (matched by
 * that same id on `broadcast.operation.id`) or removed if the server
 * rejects it. A pending roll never guesses a number -- the server rolls,
 * never the client, per `@hearthtable/dice`'s own rule -- its placeholder
 * is just "Rolling `<expression>`…".
 */

import type { ChatMessage } from '@hearthtable/core';
import { chatMessageSchema } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { listChatMessages } from '../api/chat.js';
import { useConnectionStore } from './connection.js';

export interface PendingTextMessage {
  readonly id: string;
  readonly pending: true;
  readonly kind: 'text';
  readonly text: string;
}

export interface PendingRoll {
  readonly id: string;
  readonly pending: true;
  readonly kind: 'roll';
  readonly expression: string;
}

/** A real, persisted `ChatMessage`, or a not-yet-confirmed local entry standing in for one. */
export type ChatEntry = ChatMessage | PendingTextMessage | PendingRoll;

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

function isPending(entry: ChatEntry): entry is PendingTextMessage | PendingRoll {
  return 'pending' in entry;
}

/** Every entry in `documents` that validates as a `ChatMessage`; a `Broadcast`'s `documents` may carry other document types once they exist, so this is a filter, not an assumption. */
function parseChatDocuments(documents: readonly unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const document of documents) {
    const parsed = chatMessageSchema.safeParse(document);
    if (parsed.success) {
      messages.push(parsed.data);
    }
  }
  return messages;
}

export const useChatStore = defineStore('chat', () => {
  const connection = useConnectionStore();
  const messages = ref<ChatEntry[]>([]);
  const error = ref<string>();

  /** Loads existing chat history for `worldId`. Call once, when the lobby for this world mounts. */
  async function load(worldId: string): Promise<void> {
    try {
      messages.value = await listChatMessages(worldId);
    } catch (caught) {
      error.value = messageOf(caught, 'failed to load chat history');
    }
  }

  watch(
    () => connection.lastBroadcast,
    (broadcast) => {
      if (broadcast === undefined) {
        return;
      }
      const chatDocs = parseChatDocuments(broadcast.documents);
      if (chatDocs.length === 0) {
        return;
      }
      // The pending entry this broadcast confirms (if any) is dropped in
      // the same update that adds the real document, so the message never
      // visibly appears twice.
      const operationId = broadcast.operation.id;
      messages.value = [
        ...messages.value.filter(
          (entry) => !isPending(entry) || entry.id !== operationId,
        ),
        ...chatDocs,
      ];
    },
  );

  async function sendMessage(text: string): Promise<void> {
    const id = crypto.randomUUID();
    error.value = undefined;
    messages.value = [...messages.value, { id, pending: true, kind: 'text', text }];
    const ack = await connection.sendOperation(id, 'chat.sendMessage', { text });
    if (!ack.ok) {
      messages.value = messages.value.filter(
        (entry) => !isPending(entry) || entry.id !== id,
      );
      error.value = ack.error ?? 'failed to send message';
    }
  }

  async function sendRoll(expression: string): Promise<void> {
    const id = crypto.randomUUID();
    error.value = undefined;
    messages.value = [...messages.value, { id, pending: true, kind: 'roll', expression }];
    const ack = await connection.sendOperation(id, 'chat.sendRoll', { expression });
    if (!ack.ok) {
      messages.value = messages.value.filter(
        (entry) => !isPending(entry) || entry.id !== id,
      );
      error.value = ack.error ?? 'failed to roll';
    }
  }

  return { messages, error, load, sendMessage, sendRoll };
});
