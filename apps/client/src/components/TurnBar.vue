<script setup lang="ts">
/**
 * The turn bar: the combatants in turn order across the top of the map, the one
 * with the action first and marked "Acting now" in words (never colour alone).
 * Each portrait is a button that selects and centres that token. It is an
 * ordinary list, so Tab, Enter, and a screen reader all work.
 *
 * It shows only what this seat can read. A creature the table cannot see taking
 * its turn appears as one line, "Someone is acting".
 *
 * **The GM's switch** (CLAUDE.md: combat only happens when the GM starts it)
 * lives here too, as `showControls`: with no active combat it is the only way
 * onto the wire ("Start combat"), plus a direct initiative override per
 * combatant (the manual path every automated roll gets) once one is running.
 * A player is never passed `showControls`, so these do not exist for them,
 * not merely hidden. Only turn *order* lives here -- ending a turn, ending
 * the combat, and the free-movement switch are `TurnControls.vue`'s, down
 * with the action bar, since those are things you do each turn rather than
 * facts about the order itself.
 */
import { reactive } from 'vue';

import type { TurnBarItem } from './turnBarModel.js';

defineProps<{
  items: readonly TurnBarItem[];
  round: number;
  unseenActing: boolean;
  /** Whether a combat is running (round/items apply) or there is none yet to show. */
  active: boolean;
  /** Whether this seat is the GM: shows "Start combat" and the initiative override. */
  showControls: boolean;
}>();
const emit = defineEmits<{
  focus: [tokenId: string];
  start: [];
  setInitiative: [combatantId: string, initiative: number];
}>();

/** The override field's own draft per combatant, kept apart from the rolled value until submitted. */
const overrides = reactive<Record<string, number | undefined>>({});

function submitOverride(combatantId: string): void {
  const value = overrides[combatantId];
  if (value !== undefined && Number.isFinite(value)) {
    emit('setInitiative', combatantId, value);
  }
}
</script>

<template>
  <section class="turn-bar" aria-label="Turn order" data-testid="turn-bar">
    <p v-if="!active && showControls" class="round">No combat is running.</p>
    <button v-if="!active && showControls" type="button" @click="emit('start')">
      Start combat
    </button>
    <template v-if="active">
      <p class="round">Round {{ round }}</p>
      <p v-if="unseenActing" class="unseen" role="status">Someone is acting</p>
    </template>
    <ol v-if="active">
      <li
        v-for="item in items"
        :key="item.id"
        :class="{ active: item.active }"
        :aria-current="item.active ? 'true' : undefined"
      >
        <button
          type="button"
          :disabled="item.tokenId === undefined"
          @click="item.tokenId !== undefined && emit('focus', item.tokenId)"
        >
          <img
            v-if="item.portraitUrl !== undefined"
            class="portrait"
            :src="item.portraitUrl"
            alt=""
          />
          <span v-else class="portrait placeholder" aria-hidden="true">{{
            item.initials
          }}</span>
          <span class="name">{{ item.label }}</span>
          <span class="initiative"
            >Initiative
            {{ item.initiative === undefined ? 'not rolled' : item.initiative }}</span
          >
          <span v-if="item.active" class="status">Taking their turn</span>
          <span v-if="item.defeated" class="status">(defeated)</span>
        </button>
        <form
          v-if="showControls"
          class="override"
          :aria-label="`Set ${item.label}'s initiative`"
          @submit.prevent="submitOverride(item.id)"
        >
          <label :for="`initiative-${item.id}`">Set initiative</label>
          <input
            :id="`initiative-${item.id}`"
            v-model.number="overrides[item.id]"
            type="number"
            step="1"
          />
          <button type="submit">Set</button>
        </form>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.turn-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  overflow-x: auto;
  padding: 0.25rem 0.5rem;
}
.round,
.unseen {
  margin: 0;
  font-weight: 600;
  white-space: nowrap;
}
ol {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
li button {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 5.5rem;
  min-height: 44px;
  padding: 0.25rem 0.5rem;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
li.active button {
  border-color: currentColor;
  font-weight: 600;
}
li button:disabled {
  cursor: default;
}
.portrait {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
}
.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
}
.initiative {
  font-size: 0.8em;
}
.status {
  font-size: 0.8em;
  font-style: italic;
}
.override {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75em;
}
.override input {
  width: 3.5rem;
}
.override label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
