<script setup lang="ts">
/**
 * The lobby: shown once a campaign is active (App.vue's own switch).
 * Players "click a character to become them" (the milestone 1 user story)
 * by claiming a seat from the list; a claimed seat can be released to pick
 * a different one, matching ADR 0007's "unclick if you picked wrong." A GM
 * seat protected by a PIN asks for it inline before claiming rather than
 * claiming immediately -- see `startClaim` below. Also where a GM adds
 * seats to the roster in the first place; there is no separate "manage
 * seats" screen yet. Owns the one realtime connection this app makes
 * (`connectionStore`) -- `stores/lobby.ts` and `ChatLog`'s own
 * `stores/chat.ts` both react to it, but neither opens it.
 *
 * The GM's "Leave campaign" sends everyone at the table back to the
 * campaign list (the server disconnects every socket on deactivate) --
 * asked for with the same inline alertdialog the map's exit confirmation
 * uses, since it affects the whole table, not just this browser.
 */
import type { Seat } from '@hearthtable/core';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { type ConnectionStatus, useConnectionStore } from '../stores/connection.js';
import { useLobbyStore } from '../stores/lobby.js';
import { useWorldsStore } from '../stores/worlds.js';
import TableView from './TableView.vue';

const props = defineProps<{ worldId: string; worldName: string }>();

const connection = useConnectionStore();
const store = useLobbyStore();
const worldsStore = useWorldsStore();

const pinPromptSeatId = ref<string>();
const pinInput = ref('');

const confirmingLeave = ref(false);

async function leaveCampaign(): Promise<void> {
  confirmingLeave.value = false;
  await worldsStore.deactivate();
}

const newSeatName = ref('');
const newSeatIsGM = ref(false);
const newSeatPin = ref('');

onMounted(() => {
  connection.connect();
  store.loadForWorld(props.worldId);
});
onUnmounted(() => {
  connection.disconnect();
});

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Connection lost -- retrying…',
  disconnected: 'Disconnected',
};

const statusText = computed(() => STATUS_TEXT[connection.status]);

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
  <section aria-labelledby="lobby-heading">
    <h2 id="lobby-heading">{{ worldName }}</h2>
    <p role="status" class="connection-status">{{ statusText }}</p>
    <p v-if="store.error" role="alert" class="status status-error">{{ store.error }}</p>
    <p v-if="worldsStore.error" role="alert" class="status status-error">
      {{ worldsStore.error }}
    </p>

    <button
      v-if="store.mySeat?.isGM"
      type="button"
      class="leave-campaign"
      @click="confirmingLeave = true"
    >
      Back to campaigns
    </button>
    <div
      v-if="confirmingLeave"
      class="leave-confirm"
      role="alertdialog"
      aria-labelledby="leave-question"
      @keydown.esc.stop="confirmingLeave = false"
    >
      <p id="leave-question">
        Leave <strong>{{ worldName }}</strong
        >? Everyone at the table is disconnected and sent back to the campaign list.
      </p>
      <button type="button" @click="leaveCampaign">Leave campaign</button>
      <button type="button" @click="confirmingLeave = false">Cancel</button>
    </div>

    <TableView v-if="store.mySeat" :world-id="worldId" :seat-name="store.mySeat.name" />

    <!-- Seated players mostly don't need the roster, but the GM adds seats here, so it stays one click away. -->
    <details class="seat-manager" :open="store.mySeat === undefined">
      <summary>Seats</summary>
      <ul v-if="store.seats.length > 0" class="seat-list">
        <li v-for="seat in store.seats" :key="seat.id" class="seat-row">
          <span class="seat-name">{{ seat.name }}</span>
          <span v-if="seat.isGM" class="gm-badge">GM</span>

          <template v-if="store.mySeat?.id === seat.id">
            <span class="claimed-badge">You</span>
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
    </details>
  </section>
</template>

<style scoped>
.connection-status {
  color: var(--color-text-muted);
  font-size: 0.875rem;
}

.leave-campaign {
  margin-bottom: var(--space-2);
}

.leave-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: 4px;
}

.leave-confirm p {
  margin: 0;
  flex-basis: 100%;
}

.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.seat-manager {
  margin-top: var(--space-4);
}

.seat-list {
  list-style: none;
  padding: 0;
  margin: var(--space-3) 0;
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
.claimed-badge {
  padding: var(--space-1) var(--space-2);
  border-radius: 4px;
  font-size: 0.875rem;
}

.gm-badge {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.claimed-badge {
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
  margin-top: var(--space-4);
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
