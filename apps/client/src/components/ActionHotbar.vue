<script setup lang="ts">
/**
 * The hotbar under the action bar (ADR 0023): ten slots on keys 1 to 9 then 0,
 * each a saved action the player can load into the action form. A filled slot
 * shows its key, the player's name for it, and its cost; an empty one is faint
 * but still there, so the bar is discoverable and a key always means the same
 * slot. Choosing a slot only *reports* it (`load`); the action bar fills its form,
 * so the player can add this time's modifiers before spending.
 *
 * Each filled slot has a remove button, and can be renamed in place with F2 or a
 * double click (Enter saves, Escape cancels). Nothing here is hover-only.
 */
import type { HotbarAction } from '@hearthtable/core';
import { nextTick, ref } from 'vue';

import { costGlyph, slotKey } from './hotbarModel.js';

defineProps<{ slots: readonly (HotbarAction | null)[] }>();
const emit = defineEmits<{
  load: [index: number];
  remove: [index: number];
  rename: [index: number, name: string];
}>();

const renaming = ref<number>();
const draft = ref('');
const renameInput = ref<HTMLInputElement[]>([]);

async function startRename(index: number, name: string): Promise<void> {
  renaming.value = index;
  draft.value = name;
  await nextTick();
  renameInput.value[0]?.focus();
  renameInput.value[0]?.select();
}

function finishRename(index: number): void {
  const name = draft.value.trim();
  renaming.value = undefined;
  if (name !== '') {
    emit('rename', index, name.slice(0, 24));
  }
}
</script>

<template>
  <ul class="hotbar" aria-label="Saved actions">
    <li
      v-for="(slot, index) in slots"
      :key="index"
      class="slot"
      :class="{ empty: !slot }"
    >
      <span class="key" aria-hidden="true">{{ slotKey(index) }}</span>
      <template v-if="slot">
        <input
          v-if="renaming === index"
          ref="renameInput"
          v-model="draft"
          type="text"
          maxlength="24"
          :aria-label="`Name for slot ${slotKey(index)}`"
          @keydown.enter.prevent="finishRename(index)"
          @keydown.esc.stop.prevent="renaming = undefined"
          @blur="renaming === index && finishRename(index)"
        />
        <button
          v-else
          type="button"
          class="load"
          :aria-label="`Load ${slot.name}, slot ${slotKey(index)}`"
          :title="`${slot.text || slot.dice || slot.name} · F2 renames`"
          @click="emit('load', index)"
          @dblclick="startRename(index, slot.name)"
          @keydown.f2.prevent="startRename(index, slot.name)"
        >
          <span class="name">{{ slot.name }}</span>
          <span class="cost" aria-hidden="true">{{ costGlyph(slot.cost) }}</span>
        </button>
        <button
          type="button"
          class="remove"
          :aria-label="`Remove ${slot.name} from slot ${slotKey(index)}`"
          @click="emit('remove', index)"
        >
          ×
        </button>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.hotbar {
  display: flex;
  gap: var(--space-1);
  list-style: none;
  margin: 0;
  padding: 0;
}
.slot {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 2.25rem;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}
.slot.empty {
  opacity: 0.45;
}
.key {
  font-size: 0.75em;
  color: var(--color-text-muted);
}
.slot button {
  min-height: var(--touch-target-min);
}
.load {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 9rem;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot input {
  width: 7rem;
}
</style>
