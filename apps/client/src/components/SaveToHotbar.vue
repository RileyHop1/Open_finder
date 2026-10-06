<script setup lang="ts">
/**
 * "Save" next to Spend: opens a small popover to save the action form's current
 * action to a hotbar slot. The player names it (offered: the action's text cut to
 * 24 characters) and picks one of the ten slots, each labelled with its key and
 * what is in it now, so overwriting is never a surprise. Escape closes it and
 * returns focus to the button; so does leaving it.
 */
import type { HotbarAction } from '@hearthtable/core';
import { nextTick, ref, useTemplateRef } from 'vue';

import { slotKey } from './hotbarModel.js';

const props = defineProps<{
  slots: readonly (HotbarAction | null)[];
  /** The name to offer, from the form's current text. */
  suggestedName: string;
  /** Whether the form has anything to save (an action or dice). */
  canSave: boolean;
}>();
const emit = defineEmits<{ save: [index: number, name: string] }>();

const open = ref(false);
const name = ref('');
const root = useTemplateRef<HTMLElement>('root');
const toggle = useTemplateRef<HTMLButtonElement>('toggle');
const nameInput = useTemplateRef<HTMLInputElement>('nameInput');

async function show(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    name.value = props.suggestedName;
    await nextTick();
    nameInput.value?.focus();
    nameInput.value?.select();
  }
}

function close(returnFocus: boolean): void {
  open.value = false;
  if (returnFocus) {
    toggle.value?.focus();
  }
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget;
  if (open.value && next instanceof Node && !root.value?.contains(next)) {
    close(false);
  }
}

/** Enter in the name field: the first empty slot, or slot 1 when the bar is full. */
function chooseFirstEmpty(): void {
  const empty = props.slots.findIndex((slot) => slot === null);
  choose(empty === -1 ? 0 : empty);
}

function choose(index: number): void {
  const text = name.value.trim();
  if (text === '') {
    nameInput.value?.focus();
    return;
  }
  emit('save', index, text.slice(0, 24));
  close(true);
}
</script>

<template>
  <div ref="root" class="save" @focusout="onFocusOut" @keydown.esc.stop="close(true)">
    <button
      ref="toggle"
      type="button"
      class="save-toggle"
      aria-controls="save-panel"
      :aria-expanded="open"
      :disabled="!canSave"
      @click="show"
    >
      Save
    </button>
    <div
      v-if="open"
      id="save-panel"
      class="save-panel"
      role="group"
      aria-label="Save to hotbar"
    >
      <input
        ref="nameInput"
        v-model="name"
        type="text"
        maxlength="24"
        aria-label="Name"
        placeholder="Name"
        @keydown.enter.prevent="chooseFirstEmpty"
      />
      <ul class="save-slots">
        <li v-for="(slot, index) in slots" :key="index">
          <button
            type="button"
            :aria-label="
              slot
                ? `Slot ${slotKey(index)}: replace ${slot.name}`
                : `Slot ${slotKey(index)}: empty`
            "
            :title="slot ? `Replaces ${slot.name}` : 'Empty'"
            @click="choose(index)"
          >
            <span class="key">{{ slotKey(index) }}</span>
            <span class="what">{{ slot ? slot.name : '—' }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.save {
  position: relative;
}
button {
  min-height: var(--touch-target-min);
}
.save-panel {
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: var(--z-popover);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 14rem;
  margin-bottom: var(--space-1);
  padding: var(--space-2);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
}
.save-slots {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1);
  list-style: none;
  margin: 0;
  padding: 0;
}
.save-slots button {
  display: flex;
  gap: var(--space-1);
  width: 100%;
  text-align: left;
}
.key {
  color: var(--color-text-muted);
}
.what {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
