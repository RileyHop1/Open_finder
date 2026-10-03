<script setup lang="ts">
/**
 * The turn bar: the combatants in turn order across the top of the map, the one
 * with the action first and marked "Acting now" in words (never colour alone).
 * Each portrait is a button that selects and centres that token. It is an
 * ordinary list, so Tab, Enter, and a screen reader all work.
 *
 * It shows only what this seat can read. A creature the table cannot see taking
 * its turn appears as one line, "Someone is acting".
 */
import type { TurnBarItem } from './turnBarModel.js';

defineProps<{
  items: readonly TurnBarItem[];
  round: number;
  unseenActing: boolean;
}>();
const emit = defineEmits<{ focus: [tokenId: string] }>();
</script>

<template>
  <section class="turn-bar" aria-label="Turn order" data-testid="turn-bar">
    <p class="round">Round {{ round }}</p>
    <p v-if="unseenActing" class="unseen" role="status">Someone is acting</p>
    <ol>
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
</style>
