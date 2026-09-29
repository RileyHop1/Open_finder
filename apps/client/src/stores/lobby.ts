/**
 * The lobby: every seat in the currently active campaign, which one (if
 * any) this browser holds, and the actions to create, claim, and release a
 * seat. Seats are fetched over REST on connect (and on every reconnect) for
 * a correct starting snapshot, then kept live by `broadcast` events over the
 * socket -- deliberately not by replaying the operation log via the `sync`
 * event: `AppliedOperation` never carries a device token (only a `Seat`'s
 * own `claimedByDeviceToken` does), so "which seat is mine" cannot be
 * reconstructed from the log alone. A REST refetch is simpler and already
 * fully correct, so that's what reconnect uses too.
 */

import type { Seat } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { createSeat as createSeatApi, listSeats } from '../api/seats.js';
import { getDeviceToken } from '../realtime/deviceToken.js';
import { type AppSocket, createSocket, emitOperation } from '../realtime/socket.js';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}

/** Replaces each seat in `current` that also appears in `changed`, by id; keeps every other seat as-is. A `Broadcast` only ever carries what changed, never a full snapshot. */
function mergeSeats(current: Seat[], changed: readonly Seat[]): Seat[] {
  const byId = new Map(current.map((seat) => [seat.id, seat]));
  for (const seat of changed) {
    byId.set(seat.id, seat);
  }
  return [...byId.values()];
}

export const useLobbyStore = defineStore('lobby', () => {
  const worldId = ref<string>();
  const seats = ref<Seat[]>([]);
  const status = ref<ConnectionStatus>('disconnected');
  const error = ref<string>();
  let socket: AppSocket | undefined;

  const deviceToken = getDeviceToken();
  const mySeat = computed(() =>
    seats.value.find((seat) => seat.claimedByDeviceToken === deviceToken),
  );

  async function refreshSeats(id: string): Promise<void> {
    try {
      seats.value = await listSeats(id);
    } catch (caught) {
      error.value = messageOf(caught, 'failed to load seats');
    }
  }

  /** Connects to `id`'s lobby: an immediate REST snapshot, then a live socket for everything after. Safe to call again for a different world -- the previous connection is torn down first. */
  function connect(id: string): void {
    socket?.disconnect();
    worldId.value = id;
    error.value = undefined;
    status.value = 'connecting';
    void refreshSeats(id);

    const next = createSocket();
    socket = next;

    next.on('connect', () => {
      status.value = 'connected';
      void refreshSeats(id);
    });
    next.on('connect_error', (connectError) => {
      status.value = 'error';
      error.value = connectError.message;
    });
    next.on('disconnect', () => {
      status.value = 'disconnected';
    });
    next.on('broadcast', (broadcast) => {
      if (broadcast.seats.length > 0) {
        seats.value = mergeSeats(seats.value, broadcast.seats);
      }
    });

    next.connect();
  }

  function disconnect(): void {
    socket?.disconnect();
    socket = undefined;
    status.value = 'disconnected';
  }

  async function claimSeat(seatId: string, pin?: string): Promise<void> {
    if (socket === undefined) {
      return;
    }
    error.value = undefined;
    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.claim',
      payload: pin === undefined ? { seatId } : { seatId, pin },
    });
    if (!ack.ok) {
      error.value = ack.error ?? 'failed to claim seat';
    }
  }

  async function releaseSeat(): Promise<void> {
    if (socket === undefined) {
      return;
    }
    error.value = undefined;
    const ack = await emitOperation(socket, {
      id: crypto.randomUUID(),
      type: 'seat.release',
      payload: {},
    });
    if (!ack.ok) {
      error.value = ack.error ?? 'failed to release seat';
    }
  }

  /** GM setup: adds a new, unclaimed seat to the roster. REST, not an operation -- see this module's own doc comment. */
  async function createSeat(name: string, isGM: boolean, pin?: string): Promise<void> {
    if (worldId.value === undefined) {
      return;
    }
    error.value = undefined;
    try {
      const seat = await createSeatApi(worldId.value, name, isGM, pin);
      seats.value = [...seats.value, seat];
    } catch (caught) {
      error.value = messageOf(caught, 'failed to create seat');
    }
  }

  return {
    worldId,
    seats,
    status,
    error,
    mySeat,
    connect,
    disconnect,
    claimSeat,
    releaseSeat,
    createSeat,
  };
});
