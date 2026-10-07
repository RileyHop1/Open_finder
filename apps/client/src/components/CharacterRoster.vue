<script setup lang="ts">
/**
 * The Characters drawer's list: every actor the seat can see, a way to open one,
 * the GM's "Place on map" (and its pointer-only drag handle), the GM's monster
 * picker, and the "New character" form. Pulled out of `TableView.vue` so the
 * sheet that opens beside it can become its own screen (milestone 8).
 *
 * It never talks to the server: it reports what was asked (`select`, `place`,
 * `addMonster`) and the parent does the sending. Creating a character is a prop
 * (`create`) rather than an event so the name field can clear only once the server
 * accepted it, the same way `LootHandout` reports back.
 */
import type { Actor } from '@hearthtable/core';
import { ref } from 'vue';

import MonsterPicker from './scenes/MonsterPicker.vue';

const props = defineProps<{
  actors: readonly Actor[];
  selectedId: string | undefined;
  isGm: boolean;
  /** Whether a scene is on the map, so "Place on map" has somewhere to go. */
  hasScene: boolean;
  /** Bumped when an import finishes, so the monster picker looks again. */
  contentVersion: number;
  /** Makes a character with this name; resolves to whether the server accepted it. */
  create: (name: string) => Promise<boolean>;
}>();
const emit = defineEmits<{
  select: [actorId: string];
  place: [actorId: string];
  dragStart: [event: DragEvent, actorId: string];
  dragEnd: [];
  addMonster: [packId: string, slug: string];
}>();

const newName = ref('');

async function submit(): Promise<void> {
  const name = newName.value.trim();
  if (name.length === 0) {
    return;
  }
  if (await props.create(name)) {
    newName.value = '';
  }
}
</script>

<template>
  <div class="character-roster">
    <ul v-if="actors.length > 0" class="roster">
      <li v-for="actor in actors" :key="actor.id">
        <span
          v-if="isGm"
          class="drag-handle"
          draggable="true"
          aria-hidden="true"
          title="Drag onto the map to place a token"
          @dragstart="emit('dragStart', $event, actor.id)"
          @dragend="emit('dragEnd')"
          >⠿</span
        >
        <button
          type="button"
          :aria-pressed="actor.id === selectedId"
          @click="emit('select', actor.id)"
        >
          {{ actor.name }}
          <span class="kind">({{ actor.kind }})</span>
        </button>
        <button
          v-if="isGm"
          type="button"
          :disabled="!hasScene"
          :aria-label="`Place ${actor.name} on the map`"
          @click="emit('place', actor.id)"
        >
          Place on map
        </button>
      </li>
    </ul>
    <p v-else class="empty">No characters yet. Make one below.</p>
    <p v-if="isGm && !hasScene" class="empty">
      Make a scene and move the party to it (the Scenes button) to place tokens.
    </p>

    <MonsterPicker
      v-if="isGm"
      :key="`monsters-${contentVersion}`"
      :can-place="hasScene"
      @add="(packId, slug) => emit('addMonster', packId, slug)"
    />

    <form class="new-character" @submit.prevent="submit">
      <label for="new-character-name">New character name</label>
      <input
        id="new-character-name"
        v-model="newName"
        type="text"
        required
        autocomplete="off"
      />
      <button type="submit">Create character</button>
    </form>
  </div>
</template>

<style scoped>
.roster {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.roster li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.roster button {
  min-height: var(--touch-target-min);
}

/* Pointer-only: the "Place on map" button is the keyboard route to the same thing. */
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  min-height: var(--touch-target-min);
  color: var(--color-text-muted);
  cursor: grab;
  user-select: none;
}

button[aria-pressed='true'] {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.kind,
.empty {
  color: var(--color-text-muted);
}

.new-character {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-3) 0;
}
</style>
