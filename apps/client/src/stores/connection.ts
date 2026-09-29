/**
 * Owns the single Socket.IO connection to `apps/server`'s realtime layer,
 * and the last `broadcast` it received. Extracted out of what was
 * `stores/lobby.ts`'s own private connection once chat needed the exact
 * same one: a client has one socket, not one per feature, and both the
 * seat list and the chat log need to react to broadcasts arriving over it.
 *
 * This store deliberately knows nothing about `seats` or `documents`
 * specifically -- consumers (`stores/lobby.ts`, `stores/chat.ts`) watch
 * `lastBroadcast` and pull out whatever they each care about. That keeps
 * this module the one place a new feature needing the realtime channel has
 * to touch, not a place that grows a special case per feature.
 */

import type { Broadcast, OperationAck } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

import { type AppSocket, createSocket, emitOperation } from '../realtime/socket.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const useConnectionStore = defineStore('connection', () => {
  const status = ref<ConnectionStatus>('disconnected');
  const error = ref<string>();
  const lastBroadcast = ref<Broadcast>();
  let socket: AppSocket | undefined;

  /** Opens the connection. Safe to call again -- any previous connection is torn down first. */
  function connect(): void {
    socket?.disconnect();
    error.value = undefined;
    status.value = 'connecting';

    const next = createSocket();
    socket = next;

    next.on('connect', () => {
      status.value = 'connected';
    });
    next.on('connect_error', (connectError) => {
      status.value = 'error';
      error.value = connectError.message;
    });
    next.on('disconnect', () => {
      status.value = 'disconnected';
    });
    next.on('broadcast', (broadcast) => {
      lastBroadcast.value = broadcast;
    });

    next.connect();
  }

  function disconnect(): void {
    socket?.disconnect();
    socket = undefined;
    status.value = 'disconnected';
    lastBroadcast.value = undefined;
  }

  /** Sends an operation and awaits its ack. `id` is the caller's own choice, not generated here -- a caller that needs to correlate a broadcast back to the operation that caused it (chat's optimistic send) needs to already know it. */
  async function sendOperation(
    id: string,
    type: string,
    payload: unknown,
  ): Promise<OperationAck> {
    if (socket === undefined) {
      return { ok: false, error: 'not connected' };
    }
    return emitOperation(socket, { id, type, payload });
  }

  return { status, error, lastBroadcast, connect, disconnect, sendOperation };
});
