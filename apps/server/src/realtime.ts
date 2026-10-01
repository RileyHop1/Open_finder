/**
 * The realtime layer: Socket.IO attached directly to the app's underlying
 * HTTP server (no extra Fastify plugin -- `.inject()` can't drive
 * WebSockets, so this is deliberately separate from `app.ts` and tested with
 * a real listening server and a real `socket.io-client` instead). Implements
 * ADR 0005's pipeline end to end: validate the incoming message against
 * `clientOperationUnionSchema`, apply whatever check that operation type
 * needs, apply it in a transaction, assign a sequence, broadcast.
 *
 * Ships with `seat.claim`/`seat.release` and, as of this PR, `chat.sendMessage`
 * `chat.sendRoll` -- see `handleChatSendMessage`/`handleChatSendRoll` below.
 * A `chat.*` operation always requires the sending connection to already hold
 * a seat, for the same reason seat operations had to come first: nothing can
 * be attributed to a sender until one is claimed.
 *
 * There is only ever one active world for the whole server (see
 * `activeWorld.ts`), so there are no Socket.IO rooms here -- every connected
 * client is, by definition, watching the same world, and `io.emit` reaches
 * all of them. When the GM activates a different world, `activeWorld`'s
 * `onChange` listener (registered below) disconnects every socket so
 * clients reconnect against the new world's context rather than silently
 * keep receiving a stale world's broadcasts.
 *
 * The event contract itself (`ClientToServerEvents`/`ServerToClientEvents`/
 * `OperationAck`/`SyncAck`) lives in `@hearthtable/core`, not here, so
 * `apps/client` can share the exact same types rather than hand-rolling a
 * second copy that could drift from this side. Re-exported below so this
 * module's own existing imports (and `realtime.test.ts`) don't need to
 * change where they import them from.
 */

import type { Server as HTTPServer } from 'node:http';

import type {
  AnyClientOperation,
  BaseDocument,
  Broadcast,
  ChatRollMessage,
  ChatTextMessage,
  ClientToServerEvents,
  OperationAck,
  Seat,
  ServerToClientEvents,
  SyncAck,
} from '@hearthtable/core';
import { clientOperationUnionSchema } from '@hearthtable/core';
import { cryptoRandomSource, evaluate, parse } from '@hearthtable/dice';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { z } from 'zod';

import type { ActiveWorldManager } from './activeWorld.js';
import { createActor, deleteActor, updateActor } from './actors.js';
import type { CompendiumIndex } from './compendium.js';
import {
  addConditionToActor,
  removeConditionFromActor,
  setConditionOnActor,
} from './conditions.js';
import { emptyCompendium } from './compendium.js';
import { addItem, removeItem, updateItem } from './items.js';
import { addPartyMember, removePartyMember, reorderParty } from './party.js';
import { OperationRejected } from './rejection.js';
import { broadcastFor, operationsFor } from './visibility.js';
import type { NewOperation, WorldStore } from './worldStore.js';

export type { ClientToServerEvents, OperationAck, ServerToClientEvents, SyncAck };

/** Per-connection state. `seatId` is absent until this connection claims a seat, and cleared on release. */
export interface SocketData {
  seatId?: string | undefined;
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
  /** Where `actor.addItem` copies entries from (ADR 0015). Absent means an empty compendium. */
  readonly compendium?: CompendiumIndex;
}

export { OperationRejected };

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

/** A ChatMessage's `permissions` is hardcoded observer-by-default here, not left to a caller: chat is public at the table, per docs/documents.md's "Why no default default". */
const CHAT_MESSAGE_PERMISSIONS = { default: 'observer', seats: {} } as const;

/** Stores a plain text chat message from `seatId`. */
function handleChatSendMessage(
  store: WorldStore,
  seatId: string,
  payload: { text: string },
): ChatTextMessage {
  const now = new Date().toISOString();
  const message: ChatTextMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: CHAT_MESSAGE_PERMISSIONS,
    createdAt: now,
    updatedAt: now,
    seatId,
    kind: 'text',
    text: payload.text,
  };
  store.putDocument(message);
  return message;
}

/**
 * Parses and evaluates `payload.expression` -- server-side, never trusting a
 * client-computed result, per `@hearthtable/dice`'s "the server rolls" rule
 * -- and stores the structured `RollResult`, never a rendered string, per
 * CLAUDE.md's ChatMessage rule. Rejects a malformed expression or an unknown
 * `@reference` with the parser's/evaluator's own message rather than a
 * generic one, since these are genuinely the sender's own mistake to fix,
 * not an internal error to hide.
 *
 * No DC is part of this operation's payload (see `operation.ts`), so this
 * never produces `degree`/`natural` -- a future check-rolling caller that
 * has a DC to compare against composes those onto its own `RollResult`
 * itself, the same way `docs/chatMessage.md` describes.
 */
function handleChatSendRoll(
  store: WorldStore,
  seatId: string,
  payload: { expression: string },
): ChatRollMessage {
  const parsed = parse(payload.expression);
  if (!parsed.ok) {
    throw new OperationRejected(`invalid roll expression: ${parsed.error.message}`);
  }
  const evaluated = evaluate(payload.expression, parsed.expression, {
    rng: cryptoRandomSource,
  });
  if (!evaluated.ok) {
    throw new OperationRejected(evaluated.error.message);
  }

  const now = new Date().toISOString();
  const message: ChatRollMessage = {
    id: crypto.randomUUID(),
    worldId: store.world.id,
    type: 'chatMessage',
    schemaVersion: 1,
    permissions: CHAT_MESSAGE_PERMISSIONS,
    createdAt: now,
    updatedAt: now,
    seatId,
    kind: 'roll',
    roll: evaluated.result,
  };
  store.putDocument(message);
  return message;
}

/** The seat this connection holds, or a rejection: creating or changing a document is attributed to someone. */
function requireSeat(store: WorldStore, socket: AppSocket): Seat {
  const seat = seatOf(store, socket);
  if (seat === undefined) {
    throw new OperationRejected('this connection has not claimed a seat');
  }
  return seat;
}

function assertNever(value: never): never {
  throw new OperationRejected(`unhandled operation type: ${JSON.stringify(value)}`);
}

interface DispatchResult {
  /** The seatId to stamp onto the AppliedOperation's envelope -- absent for seat.claim, see operation.ts's own TSDoc. */
  readonly seatId: string | undefined;
  readonly seats: Seat[];
  readonly documents: BaseDocument[];
  /** Bare envelopes of documents this operation deleted; absent means none. */
  readonly deleted?: BaseDocument[];
}

function dispatch(
  store: WorldStore,
  compendium: CompendiumIndex,
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
    case 'chat.sendMessage': {
      const { seatId } = socket.data;
      if (seatId === undefined) {
        throw new OperationRejected('this connection has not claimed a seat');
      }
      const message = handleChatSendMessage(store, seatId, operation.payload);
      return { seatId, seats: [], documents: [message] };
    }
    case 'chat.sendRoll': {
      const { seatId } = socket.data;
      if (seatId === undefined) {
        throw new OperationRejected('this connection has not claimed a seat');
      }
      const message = handleChatSendRoll(store, seatId, operation.payload);
      return { seatId, seats: [], documents: [message] };
    }
    case 'actor.create': {
      const seat = requireSeat(store, socket);
      const actor = createActor(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.update': {
      const seat = requireSeat(store, socket);
      const actor = updateActor(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.addItem': {
      const seat = requireSeat(store, socket);
      const actor = addItem(store, seat, compendium, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.updateItem': {
      const seat = requireSeat(store, socket);
      const actor = updateItem(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.removeItem': {
      const seat = requireSeat(store, socket);
      const actor = removeItem(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.addCondition': {
      const seat = requireSeat(store, socket);
      const actor = addConditionToActor(store, seat, compendium, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.setCondition': {
      const seat = requireSeat(store, socket);
      const actor = setConditionOnActor(store, seat, compendium, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.removeCondition': {
      const seat = requireSeat(store, socket);
      const actor = removeConditionFromActor(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [actor] };
    }
    case 'actor.delete': {
      const seat = requireSeat(store, socket);
      const { tombstone, party } = deleteActor(store, seat, operation.payload);
      return {
        seatId: seat.id,
        seats: [],
        documents: party === undefined ? [] : [party],
        deleted: [tombstone],
      };
    }
    case 'party.addMember': {
      const seat = requireSeat(store, socket);
      const party = addPartyMember(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [party] };
    }
    case 'party.removeMember': {
      const seat = requireSeat(store, socket);
      const party = removePartyMember(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: party === undefined ? [] : [party] };
    }
    case 'party.reorder': {
      const seat = requireSeat(store, socket);
      const party = reorderParty(store, seat, operation.payload);
      return { seatId: seat.id, seats: [], documents: [party] };
    }
    default:
      return assertNever(operation);
  }
}

/** The seat this connection currently holds, if any. */
function seatOf(store: WorldStore, socket: AppSocket): Seat | undefined {
  const { seatId } = socket.data;
  return seatId === undefined ? undefined : store.getSeat(seatId);
}

/**
 * Sends `broadcast` to every connected socket, each getting only what its
 * seat may see (`visibility.ts`). Every socket still receives a broadcast for
 * every operation, so sequence numbers stay gapless for all of them.
 */
function emitBroadcast(io: AppServer, store: WorldStore, broadcast: Broadcast): void {
  for (const socket of io.sockets.sockets.values()) {
    socket.emit('broadcast', broadcastFor(seatOf(store, socket), broadcast));
  }
}

function handleOperation(
  io: AppServer,
  activeWorld: ActiveWorldManager,
  compendium: CompendiumIndex,
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
    const { appliedOperation, seats, documents, deleted } = store.transaction(() => {
      const result = dispatch(store, compendium, deviceToken, socket, parsed.data);
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
      deleted: deleted ?? [],
      seats,
    };
    emitBroadcast(io, store, broadcast);
    ack({ ok: true });
  } catch (error) {
    const message = error instanceof OperationRejected ? error.message : 'internal error';
    ack({ ok: false, error: message });
  }
}

function handleSync(
  activeWorld: ActiveWorldManager,
  socket: AppSocket,
  rawPayload: unknown,
  ack: (response: SyncAck) => void,
): void {
  const parsed = syncRequestSchema.safeParse(rawPayload);
  const store = activeWorld.get();
  if (!parsed.success || store === undefined) {
    ack({ operations: [] });
    return;
  }
  const seat = seatOf(store, socket);
  ack({
    operations: operationsFor(seat, store.listOperationsSince(parsed.data.lastSequence)),
  });
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
  const compendium = options.compendium ?? emptyCompendium();
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
      handleOperation(io, activeWorld, compendium, socket, rawPayload, ack);
    });

    socket.on('sync', (rawPayload, ack) => {
      handleSync(activeWorld, socket, rawPayload, ack);
    });
  });

  activeWorld.onChange(() => {
    io.disconnectSockets(true);
  });

  return io;
}
