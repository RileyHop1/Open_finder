<script setup lang="ts">
/**
 * The seat list and "add a seat" form: who is at the table, who holds which
 * seat, and the GM's way to add more. Extracted from `CampaignLobby.vue` so
 * it can be mounted both there (while unseated) and from the table's gear
 * menu (`TableView.vue`, "Seats") -- a GM adding a player mid-session, or
 * anyone checking who else is seated, no longer has to release their own
 * seat first to see the roster.
 *
 * Reads and writes `stores/lobby.ts` directly rather than taking props: both
 * callers already sit inside the same Pinia instance, and a seat roster has
 * nothing of its own to receive from a parent.
 */
import type { Seat } from '@hearthtable/core';
import { ref } from 'vue';

import { useLobbyStore } from '../stores/lobby.js';

const store = useLobbyStore();

const pinPromptSeatId = ref<string>();
const pinInput = ref('');

function startClaim(seat: Seat): void {
  if (seat.pin === undefined) {
    void store.claimSeat(seat.id);
    return;
  }
  pinPromptSeatId.value = seat.id;
  pinInput.value = '';
}

async function confirmPinClaim(): Promise<void> {
  if (pinPromptSeatId.value === undefined) {
    return;
  }
  await store.claimSeat(pinPromptSeatId.value, pinInput.value);
  pinPromptSeatId.value = undefined;
}

const newSeatName = ref('');
const newSeatIsGM = ref(false);
const newSeatPin = ref('');

async function handleCreateSeat(): Promise<void> {
  const name = newSeatName.value.trim();
  if (name.length === 0) {
    return;
  }
  const pin = newSeatPin.value.trim();
  await store.createSeat(name, newSeatIsGM.value, pin.length === 0 ? undefined : pin);
  newSeatName.value = '';
  newSeatIsGM.value = false;
  newSeatPin.value = '';
}
</script>

<template>
  <div class="seat-roster">
    <p v-if="store.error" role="alert" class="status status-error">{{ store.error }}</p>
    <ul v-if="store.seats.length > 0" class="seat-list">
      <li v-for="seat in store.seats" :key="seat.id" class="seat-row">
        <span class="seat-name">{{ seat.name }}</span>
        <span v-if="seat.isGM" class="gm-badge">GM</span>

        <template v-if="seat.id === store.mySeat?.id">
          <span class="you-badge">You</span>
          <button type="button" @click="store.releaseSeat()">Release</button>
        </template>
        <template v-else-if="seat.claimedByDeviceToken !== undefined">
          <span class="claimed-badge">Claimed</span>
        </template>
        <form
          v-else-if="pinPromptSeatId === seat.id"
          class="pin-form"
          @submit.prevent="confirmPinClaim"
        >
          <label :for="`pin-${seat.id}`">PIN</label>
          <input
            :id="`pin-${seat.id}`"
            v-model="pinInput"
            type="password"
            autocomplete="off"
          />
          <button type="submit">Confirm</button>
        </form>
        <button v-else type="button" @click="startClaim(seat)">Claim</button>
      </li>
    </ul>
    <p v-else>No seats yet. Add one below.</p>

    <form class="create-seat" @submit.prevent="handleCreateSeat">
      <label for="new-seat-name">Character name</label>
      <input
        id="new-seat-name"
        v-model="newSeatName"
        type="text"
        name="name"
        required
        autocomplete="off"
      />
      <label class="checkbox-label">
        <input v-model="newSeatIsGM" type="checkbox" />
        GM seat
      </label>
      <label for="new-seat-pin">PIN (optional)</label>
      <input id="new-seat-pin" v-model="newSeatPin" type="text" autocomplete="off" />
      <button type="submit">Add seat</button>
    </form>
  </div>
</template>

<style scoped>
.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.seat-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.seat-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.seat-name {
  flex: 1;
  font-weight: 600;
}

.gm-badge,
.claimed-badge,
.you-badge {
  padding: var(--space-1) var(--space-2);
  border-radius: 4px;
  font-size: 0.875rem;
}

.gm-badge {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.claimed-badge,
.you-badge {
  background: var(--color-success);
  color: var(--color-accent-contrast);
}

.pin-form {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.create-seat {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
