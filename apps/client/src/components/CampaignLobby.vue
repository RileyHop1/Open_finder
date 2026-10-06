<script setup lang="ts">
/**
 * The lobby: shown once a campaign is active (App.vue's own switch).
 * Players "click a character to become them" (the milestone 1 user story)
 * by claiming a seat from the list (`SeatRoster.vue`); a claimed seat can be
 * released to pick a different one, matching ADR 0007's "unclick if you
 * picked wrong." Owns the one realtime connection this app makes
 * (`connectionStore`) -- `stores/lobby.ts` and `ChatLog`'s own
 * `stores/chat.ts` both react to it, but neither opens it.
 *
 * Map-first (ADR 0022): once seated, `TableView` is the whole page, so this
 * screen's own chrome -- the roster, and the GM's "Back to campaigns" --
 * only ever renders in the `v-else` below. Both stay reachable while seated
 * too, from the table's gear menu (`TableView.vue`'s "Seats" and "Back to
 * campaigns" items) rather than floating over the map.
 */
import { computed, onMounted, onUnmounted } from 'vue';

import { type ConnectionStatus, useConnectionStore } from '../stores/connection.js';
import { useLobbyStore } from '../stores/lobby.js';
import { useWorldsStore } from '../stores/worlds.js';
import SeatRoster from './SeatRoster.vue';
import TableView from './TableView.vue';

const props = defineProps<{ worldId: string; worldName: string }>();

const connection = useConnectionStore();
const store = useLobbyStore();
const worldsStore = useWorldsStore();

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
</script>

<template>
  <TableView v-if="store.mySeat" :world-id="worldId" :seat-name="store.mySeat.name" />

  <!--
    Map-first (ADR 0022): everything below is this screen's own chrome
    before a seat is claimed. TableView fills the whole viewport on its
    own once one is, and the gear menu's "Seats" and "Back to campaigns"
    items reach the same roster and leave-flow from there.
  -->
  <section v-else aria-labelledby="lobby-heading">
    <h2 id="lobby-heading">{{ worldName }}</h2>
    <p role="status" class="connection-status">{{ statusText }}</p>
    <p v-if="worldsStore.error" role="alert" class="status status-error">
      {{ worldsStore.error }}
    </p>

    <details class="seat-manager" open>
      <summary>Seats</summary>
      <SeatRoster />
    </details>
  </section>
</template>

<style scoped>
.connection-status {
  color: var(--color-text-muted);
  font-size: 0.875rem;
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
</style>
