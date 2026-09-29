/**
 * The realtime layer: Socket.IO attached directly to the app's underlying
 * HTTP server (no extra Fastify plugin -- `.inject()` can't drive
 * WebSockets, so this is deliberately separate from `app.ts` and tested with
 * a real listening server and a real `socket.io-client` instead). Implements
 * ADR 0005's pipeline end to end: validate the incoming message against
 * `clientOperationUnionSchema`, apply whatever check that operation type
 * needs, apply it in a transaction, assign a sequence, broadcast.
 *
 * Ships with `seat.claim`/`seat.release` as its concrete proof -- the only
 * operations that don't presuppose infrastructure (like a `ChatMessage`
 * schema) that doesn't exist yet, and the ones every other operation needs
 * anyway, since nothing can be attributed to a sender until a seat is
 * claimed.
 *
 * There is only ever one active world for the whole server (see
 * `activeWorld.ts`), so there are no Socket.IO rooms here -- every connected
 * client is, by definition, watching the same world, and `io.emit` reaches
 * all of them. When the GM activates a different world, `activeWorld`'s
 * `onChange` listener (registered below) disconnects every socket so
 * clients reconnect against the new world's context rather than silently
 * keep receiving a stale world's broadcasts.
 */

import type { Server as HTTPServer } from 'node:http';

import type {
  AnyClientOperation,
  AppliedOperation,
  BaseDocument,
  Broadcast,
  Seat,
} from '@hearthtable/core';
import { clientOperationUnionSchema } from '@hearthtable/core';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';

import type { ActiveWorldManager } from './activeWorld.js';
import type { NewOperation, WorldStore } from './worldStore.js';

/** Per-connection state. `seatId` is absent until this connection claims a seat, and cleared on release. */
export interface SocketData {
  seatId?: string | undefined;
}

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

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type AppServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface AttachRealtimeOptions {
  readonly activeWorld: ActiveWorldManager;
}

/**
 * Thrown by a dispatch handler to reject an operation cleanly: caught by the
 * `operation` handler below, which rolls back the transaction (via the
 * throw propagating out of `store.transaction`) and acks the sender with
 * the message, without broadcasting anything. Never thrown for a genuine
 * bug -- that's an unhandled error, which acks a generic message instead of
 * leaking internals to the client.
 */
export class OperationRejected extends Error {}

const syncRequestSchema = z.object({ lastSequence: z.number().int().nonnegative() });

function readDeviceToken(auth: unknown): string | undefined {
  if (typeof auth !== 'object' || auth === null) {
    return undefined;
  }
  const value = (auth as Record<string, unknown>)['deviceToken'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Re-reads the device token from the handshake rather than caching it
 * elsewhere -- `socket.handshake.auth` already persists for the socket's
 * lifetime, so there's nothing to keep in sync. Throws if it's missing,
 * which would mean the `io.use` middleware below let a connection through
 * it shouldn't have -- a genuine bug, not a normal outcome a caller needs to
 * branch on.
 */
function requireDeviceToken(socket: AppSocket): string {
  const token = readDeviceToken(socket.handshake.auth);
  if (token === undefined) {
    throw new Error(
      'deviceToken missing on a connection that passed handshake validation',
    );
  }
  return token;
}

/**
 * Claims `payload.seatId` for `deviceToken`. Rejects a seat that doesn't
 * exist, one already claimed by a *different* device token, and a wrong pin
 * (ADR 0007 -- checked only when the target seat has one set). Auto-releases
 * any other seat this device token already holds, matching this milestone's
 * "click a character, unclick if wrong" story rather than requiring an
 * explicit release first.
 */
function handleSeatClaim(
  store: WorldStore,
  deviceToken: string,
  payload: { seatId: string; pin?: string | undefined },
): Seat[] {
  const target = store.getSeat(payload.seatId);
  if (target === undefined) {
    throw new OperationRejected(`no seat found with id ${payload.seatId}`);
  }
  if (
    target.claimedByDeviceToken !== undefined &&
    target.claimedByDeviceToken !== deviceToken
  ) {
    throw new OperationRejected('seat is already claimed');
  }
  if (target.pin !== undefined && target.pin !== payload.pin) {
    throw new OperationRejected('incorrect pin');
  }

  const changed: Seat[] = [];

  const previouslyHeld = store.getSeatByDeviceToken(deviceToken);
  if (previouslyHeld !== undefined && previouslyHeld.id !== target.id) {
    const { claimedByDeviceToken: _previousToken, ...released } = previouslyHeld;
    store.putSeat(released);
    changed.push(released);
  }

  const claimed: Seat = { ...target, claimedByDeviceToken: deviceToken };
  store.putSeat(claimed);
  changed.push(claimed);

  return changed;
}

/** Releases the seat this connection currently holds. */
function handleSeatRelease(store: WorldStore, seatId: string): Seat[] {
  const seat = store.getSeat(seatId);
  if (seat === undefined) {
    throw new OperationRejected(`no seat found with id ${seatId}`);
  }
  const { claimedByDeviceToken: _previousToken, ...released } = seat;
  store.putSeat(released);
  return [released];
}

function assertNever(value: never): never {
  throw new OperationRejected(`unhandled operation type: ${JSON.stringify(value)}`);
}

interface DispatchResult {
  /** The seatId to stamp onto the AppliedOperation's envelope -- absent for seat.claim, see operation.ts's own TSDoc. */
  readonly seatId: string | undefined;
  readonly seats: Seat[];
  readonly documents: BaseDocument[];
}

function dispatch(
  store: WorldStore,
  deviceToken: string,
  socket: AppSocket,
  operation: AnyClientOperation,
): DispatchResult {
  switch (operation.type) {
    case 'seat.claim': {
      const seats = handleSeatClaim(store, deviceToken, operation.payload);
      const claimed = seats.find((seat) => seat.claimedByDeviceToken === deviceToken);
      socket.data.seatId = claimed?.id;
      return { seatId: undefined, seats, documents: [] };
    }
    case 'seat.release': {
      const { seatId } = socket.data;
      if (seatId === undefined) {
        throw new OperationRejected('this connection has not claimed a seat');
      }
      const seats = handleSeatRelease(store, seatId);
      socket.data.seatId = undefined;
      return { seatId, seats, documents: [] };
    }
    case 'chat.sendMessage':
    case 'chat.sendRoll':
      // Lands in PR 12, once packages/core has a ChatMessage schema to store into.
      throw new OperationRejected('not yet implemented');
    default:
      return assertNever(operation);
  }
}

function handleOperation(
  io: AppServer,
  activeWorld: ActiveWorldManager,
  socket: AppSocket,
  rawPayload: unknown,
  ack: (response: OperationAck) => void,
): void {
  const parsed = clientOperationUnionSchema.safeParse(rawPayload);
  if (!parsed.success) {
    ack({ ok: false, error: 'invalid operation' });
    return;
  }

  const store = activeWorld.get();
  if (store === undefined) {
    ack({ ok: false, error: 'no world is currently active' });
    return;
  }

  const deviceToken = requireDeviceToken(socket);

  try {
    const { appliedOperation, seats, documents } = store.transaction(() => {
      const result = dispatch(store, deviceToken, socket, parsed.data);
      const newOperation: NewOperation = {
        id: parsed.data.id,
        worldId: store.world.id,
        type: parsed.data.type,
        payload: parsed.data.payload,
        appliedAt: new Date().toISOString(),
        ...(result.seatId === undefined ? {} : { seatId: result.seatId }),
      };
      return { appliedOperation: store.appendOperation(newOperation), ...result };
    });

    const broadcast: Broadcast = {
      sequence: appliedOperation.sequence,
      operation: appliedOperation,
      documents,
      seats,
    };
    io.emit('broadcast', broadcast);
    ack({ ok: true });
  } catch (error) {
    const message = error instanceof OperationRejected ? error.message : 'internal error';
    ack({ ok: false, error: message });
  }
}

function handleSync(
  activeWorld: ActiveWorldManager,
  rawPayload: unknown,
  ack: (response: SyncAck) => void,
): void {
  const parsed = syncRequestSchema.safeParse(rawPayload);
  const store = activeWorld.get();
  if (!parsed.success || store === undefined) {
    ack({ operations: [] });
    return;
  }
  ack({ operations: store.listOperationsSince(parsed.data.lastSequence) });
}

/**
 * Attaches Socket.IO to `httpServer` and wires up the full dispatch
 * pipeline. Called once from `index.ts`, alongside `createApp`, both
 * sharing the same `activeWorld` instance.
 */
export function attachRealtime(
  httpServer: HTTPServer,
  options: AttachRealtimeOptions,
): AppServer {
  const { activeWorld } = options;
  const io: AppServer = new SocketIOServer(httpServer);

  io.use((socket, next) => {
    const deviceToken = readDeviceToken(socket.handshake.auth);
    if (deviceToken === undefined) {
      next(new Error('deviceToken is required'));
      return;
    }
    if (activeWorld.get() === undefined) {
      next(new Error('no world is currently active'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    const store = activeWorld.get();
    const deviceToken = requireDeviceToken(socket);
    const seat = store?.getSeatByDeviceToken(deviceToken);
    socket.data.seatId = seat?.id;

    socket.on('operation', (rawPayload, ack) => {
      handleOperation(io, activeWorld, socket, rawPayload, ack);
    });

    socket.on('sync', (rawPayload, ack) => {
      handleSync(activeWorld, rawPayload, ack);
    });
  });

  activeWorld.onChange(() => {
    io.disconnectSockets(true);
  });

  return io;
}
