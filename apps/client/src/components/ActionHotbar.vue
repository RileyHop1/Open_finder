<script setup lang="ts">
/**
 * The hotbar, a bar of its own under the action bar (ADR 0023): ten slots on keys
 * 1 to 9 then 0, each a saved action. A slot shows only its key and the player's
 * name for it, cut to a fixed width when long, so every slot is the same size
 * however long a name is. Clicking it loads the action into the action form (the
 * action bar fills it, so this time's modifiers can be added before spending).
 *
 * Everything else about a slot is in a dropdown beside it (▾): what it does, its
 * cost and dice, and the controls to **Rename** it, **Remove** it, or **move it to
 * another key** (an occupied key trades places). With something in the action form,
 * an empty slot offers a "+" that saves the form there, named from its text.
 * Escape or leaving the dropdown closes it; nothing is hover-only.
 */
import type { HotbarAction } from '@hearthtable/core';
import { nextTick, ref } from 'vue';

import { costGlyph, slotKey } from './hotbarModel.js';

defineProps<{
  slots: readonly (HotbarAction | null)[];
  /** Whether the action form has something to save: an empty slot then offers "Save to slot N". */
  canSave?: boolean;
}>();
const emit = defineEmits<{
  load: [index: number];
  remove: [index: number];
  saveTo: [index: number];
  rename: [index: number, name: string];
  /** Move slot `from` to key position `to`, trading places if it is taken. */
  move: [from: number, to: number];
}>();

/** The slot whose dropdown is open, and whether its name is being edited. */
const openSlot = ref<number>();
const renaming = ref(false);
const draft = ref('');
const nameInput = ref<HTMLInputElement[]>([]);
const toggles = ref<HTMLButtonElement[]>([]);

function toggle(index: number): void {
  openSlot.value = openSlot.value === index ? undefined : index;
  renaming.value = false;
}

function close(index: number, returnFocus: boolean): void {
  openSlot.value = undefined;
  renaming.value = false;
  if (returnFocus) {
    void nextTick(() =>
      toggles.value.find((t) => t.dataset['slot'] === String(index))?.focus(),
    );
  }
}

function onFocusOut(event: FocusEvent, index: number): void {
  const next = event.relatedTarget;
  const holder = (event.currentTarget as HTMLElement | null) ?? undefined;
  if (openSlot.value === index && next instanceof Node && !holder?.contains(next)) {
    close(index, false);
  }
}

async function startRename(name: string): Promise<void> {
  renaming.value = true;
  draft.value = name;
  await nextTick();
  nameInput.value[0]?.focus();
  nameInput.value[0]?.select();
}

function finishRename(index: number): void {
  const name = draft.value.trim();
  renaming.value = false;
  if (name !== '') {
    emit('rename', index, name.slice(0, 24));
  }
}

function remove(index: number): void {
  close(index, false);
  emit('remove', index);
}

function moveTo(index: number, event: Event): void {
  const to = Number((event.target as HTMLSelectElement).value);
  close(index, true);
  if (Number.isInteger(to) && to !== index) {
    emit('move', index, to);
  }
}

function describe(slot: HotbarAction): string {
  return (
    [slot.text, slot.dice]
      .filter((part) => part !== undefined && part !== '')
      .join(' · ') || 'No description'
  );
}
</script>

<template>
  <ul class="hotbar" aria-label="Saved actions">
    <li
      v-for="(slot, index) in slots"
      :key="index"
      class="slot"
      :class="{ empty: !slot }"
      @focusout="onFocusOut($event, index)"
      @keydown.esc.stop="slot && close(index, true)"
    >
      <span class="key" aria-hidden="true">{{ slotKey(index) }}</span>
      <template v-if="slot">
        <button
          type="button"
          class="load"
          :aria-label="`Load ${slot.name}, slot ${slotKey(index)}`"
          :title="slot.name"
          @click="emit('load', index)"
        >
          <span class="name">{{ slot.name }}</span>
        </button>
        <button
          :ref="
            (el) => {
              if (el) toggles[index] = el as HTMLButtonElement;
            }
          "
          type="button"
          class="details-toggle"
          :data-slot="index"
          :aria-label="`Details for ${slot.name}, slot ${slotKey(index)}`"
          :aria-expanded="openSlot === index"
          @click="toggle(index)"
        >
          ▾
        </button>
        <div
          v-if="openSlot === index"
          class="details"
          role="group"
          :aria-label="`${slot.name} details`"
        >
          <p class="detail-line">{{ describe(slot) }}</p>
          <p class="detail-line">
            Cost: {{ costGlyph(slot.cost) || 'Free'
            }}{{ slot.cost === 'reaction' ? ' Reaction' : '' }}
          </p>
          <label class="detail-key">
            Hotkey
            <select
              :aria-label="`Hotkey for ${slot.name}`"
              :value="index"
              @change="moveTo(index, $event)"
            >
              <option v-for="(_, key) in slots" :key="key" :value="key">
                {{ slotKey(key)
                }}{{
                  slots[key] && key !== index ? ` (swap with ${slots[key]!.name})` : ''
                }}
              </option>
            </select>
          </label>
          <div class="detail-actions">
            <input
              v-if="renaming"
              ref="nameInput"
              v-model="draft"
              type="text"
              maxlength="24"
              :aria-label="`Name for slot ${slotKey(index)}`"
              @keydown.enter.prevent="finishRename(index)"
              @keydown.esc.stop.prevent="renaming = false"
            />
            <button v-else type="button" @click="startRename(slot.name)">Rename</button>
            <button type="button" @click="remove(index)">Remove</button>
          </div>
        </div>
      </template>
      <button
        v-else-if="canSave"
        type="button"
        class="save-here"
        :aria-label="`Save to slot ${slotKey(index)}`"
        title="Save the action form to this slot"
        @click="emit('saveTo', index)"
      >
        +
      </button>
    </li>
  </ul>
</template>

<style scoped>
/* Its own bar under the action bar. A grid of equal slots (wrapping to more rows
   when the dock is narrow); a slot shows only a fixed-width name, so saving,
   renaming or clearing one never reshapes it. */
.hotbar {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: var(--space-1);
  list-style: none;
  margin: 0;
  padding: var(--space-1);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}
.slot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}
.slot.empty {
  opacity: 0.45;
}
.slot.empty:has(.save-here) {
  opacity: 1;
}
.save-here {
  flex: 1;
}
.key {
  font-size: 0.75em;
  color: var(--color-text-muted);
}
.slot button {
  min-height: var(--touch-target-min);
}
.load {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.details {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 14rem;
  margin-bottom: var(--space-1);
  padding: var(--space-2);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
}
.detail-line {
  margin: 0;
  overflow-wrap: anywhere;
}
.detail-key {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.detail-actions {
  display: flex;
  gap: var(--space-1);
}
.detail-actions input {
  flex: 1;
  min-width: 0;
}
</style>
