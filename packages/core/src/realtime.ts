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

import { z } from 'zod';

import type { AppliedOperation, Broadcast } from './operation.js';
import { idSchema } from './record.js';
import { MAX_SCENE_PIXELS } from './scene.js';

export interface OperationAck {
  readonly ok: boolean;
  readonly error?: string;
}

export interface SyncAck {
  readonly operations: AppliedOperation[];
}

/**
 * Where a token is *right now*, mid-drag: the live preview other players watch
 * (ADR 0005, decision 6). Deliberately not an operation: it is never stored,
 * never sequenced, never replayed, and a dropped one costs a single frame of
 * someone else's drag because the settled `token.move` corrects it. The position
 * is raw (not snapped), so a drag looks smooth; the server only keeps it on the
 * scene.
 */
export const tokenDragSchema = z.object({
  tokenId: idSchema,
  x: z.number().min(0).max(MAX_SCENE_PIXELS),
  y: z.number().min(0).max(MAX_SCENE_PIXELS),
});

export type TokenDrag = z.infer<typeof tokenDragSchema>;

export interface ClientToServerEvents {
  operation: (payload: unknown, ack: (response: OperationAck) => void) => void;
  sync: (payload: unknown, ack: (response: SyncAck) => void) => void;
  /** Fire and forget: no acknowledgement, and a refused or rate-limited preview is dropped silently. */
  'token.drag': (payload: unknown) => void;
}

export interface ServerToClientEvents {
  broadcast: (broadcast: Broadcast) => void;
  /** Another seat's drag preview, sent only to seats that can see the token, never back to the one dragging. */
  'token.drag': (drag: TokenDrag) => void;
}
