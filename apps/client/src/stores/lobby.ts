/**
 * Every seat in the currently active campaign, and which one (if any) this
 * browser holds. Shares `apps/client`'s one Socket.IO connection
 * (`stores/connection.ts`) rather than owning one itself -- chat needs the
 * exact same connection. Seats are fetched over REST on load and on every
 * reconnect for a correct starting snapshot, then kept live by watching
 * `connectionStore`'s `lastBroadcast` -- deliberately not by replaying the
 * operation log via the `sync` event: `AppliedOperation` never carries a
 * device token (only a `Seat`'s own `claimedByDeviceToken` does), so "which
 * seat is mine" cannot be reconstructed from the log alone. A REST refetch
 * is simpler and already fully correct, so that's what reconnect uses too.
 */

import type { Seat } from '@hearthtable/core';
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { createSeat as createSeatApi, listSeats } from '../api/seats.js';
import { getDeviceToken } from '../realtime/deviceToken.js';
import { useConnectionStore } from './connection.js';

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
  const connection = useConnectionStore();
  const worldId = ref<string>();
  const seats = ref<Seat[]>([]);
  const error = ref<string>();

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

  /** Loads the current seat list for `id` and stays subscribed to live updates for it. Call once, when the lobby for this world mounts. */
  function loadForWorld(id: string): void {
    worldId.value = id;
    error.value = undefined;
    void refreshSeats(id);
  }

  watch(
    () => connection.status,
    (status) => {
      if (status === 'connected' && worldId.value !== undefined) {
        void refreshSeats(worldId.value);
      }
    },
  );

  watch(
    () => connection.lastBroadcast,
    (broadcast) => {
      if (broadcast !== undefined && broadcast.seats.length > 0) {
        seats.value = mergeSeats(seats.value, broadcast.seats);
      }
    },
  );

  async function claimSeat(seatId: string, pin?: string): Promise<void> {
    error.value = undefined;
    const ack = await connection.sendOperation(
      crypto.randomUUID(),
      'seat.claim',
      pin === undefined ? { seatId } : { seatId, pin },
    );
    if (!ack.ok) {
      error.value = ack.error ?? 'failed to claim seat';
    }
  }

  async function releaseSeat(): Promise<void> {
    error.value = undefined;
    const ack = await connection.sendOperation(crypto.randomUUID(), 'seat.release', {});
    if (!ack.ok) {
      error.value = ack.error ?? 'failed to release seat';
    }
  }

  /** GM setup: adds a new, unclaimed seat to the roster. REST, not an operation -- see `api/seats.ts`. */
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
    error,
    mySeat,
    loadForWorld,
    claimSeat,
    releaseSeat,
    createSeat,
  };
});
