/**
 * The Socket.IO event contract between `apps/server` and `apps/client`,
 * shared here so neither side can drift from the other -- the same reason
 * `operation.ts`'s schemas are shared rather than each end hand-rolling its
 * own idea of what an operation looks like. See ADR 0005 and
 * `apps/server/src/realtime.ts`, which implements the server half of this
 * and re-exports these same types for its own existing imports; `SocketData`
 * (per-connection server state) stays there, not here -- it has no meaning
 * on the client side of a connection.
 */

import type { AppliedOperation, Broadcast } from './operation.js';

export interface OperationAck {
  readonly ok: boolean;
  readonly error?: string;
}

export interface SyncAck {
  readonly operations: AppliedOperation[];
}

export interface ClientToServerEvents {
  operation: (payload: unknown, ack: (response: OperationAck) => void) => void;
  sync: (payload: unknown, ack: (response: SyncAck) => void) => void;
}

export interface ServerToClientEvents {
  broadcast: (broadcast: Broadcast) => void;
}
