/**
 * A single Socket.IO connection to `apps/server`'s realtime layer
 * (`apps/server/src/realtime.ts`), typed against the shared event contract
 * in `@hearthtable/core` so neither side of the connection can drift from
 * the other.
 *
 * `createSocket` does not auto-connect -- a caller (`stores/lobby.ts`)
 * decides when a connection is actually wanted (once a campaign is active
 * and the lobby is showing), and is responsible for disconnecting it too.
 */

import type {
  ClientToServerEvents,
  OperationAck,
  ServerToClientEvents,
} from '@hearthtable/core';
import { io, type Socket } from 'socket.io-client';

import { getDeviceToken } from './deviceToken.js';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function createSocket(): AppSocket {
  return io({
    auth: { deviceToken: getDeviceToken() },
    autoConnect: false,
  });
}

/**
 * Wraps the ack-callback `operation` event in a Promise, the way every
 * other network call in this app already reads (`await`, not a callback).
 */
export function emitOperation(
  socket: AppSocket,
  operation: { readonly id: string; readonly type: string; readonly payload: unknown },
): Promise<OperationAck> {
  return new Promise((resolve) => {
    socket.emit('operation', operation, resolve);
  });
}
