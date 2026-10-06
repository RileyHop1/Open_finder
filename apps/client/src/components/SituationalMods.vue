<script setup lang="ts">
/**
 * The situational modifiers, as a row of their own under the action bar (ADR
 * 0023: the player makes the rulings and adds their own numbers). Always
 * visible, no popover: each saved modifier is a chip -- "+2 Flanking" -- with a
 * checkbox that switches it on or off and a remove button, followed by a short
 * add group (value, optional label, Add; Enter adds too). Only switched-on ones
 * count toward a roll; the number leading the row is their sum. It only reports
 * the new list; the parent saves it on the actor so it follows the player to
 * another device.
 */
import type { SituationalModifier } from '@hearthtable/core';
import { MAX_SITUATIONAL_MODIFIERS } from '@hearthtable/core';
import { computed, ref, useTemplateRef } from 'vue';

import { modifierSum } from './actionBarModel.js';
import { signed } from './sheet/format.js';

const props = defineProps<{ modifiers: readonly SituationalModifier[] }>();
const emit = defineEmits<{ update: [modifiers: SituationalModifier[]] }>();

const value = ref<number>();
const label = ref('');
const open = ref(false);
const root = useTemplateRef<HTMLElement>('root');
const toggle = useTemplateRef<HTMLButtonElement>('toggle');

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

const total = computed(() => modifierSum(props.modifiers));
const full = computed(() => props.modifiers.length >= MAX_SITUATIONAL_MODIFIERS);

function setActive(index: number, active: boolean): void {
  emit(
    'update',
    props.modifiers.map((m, i) => (i === index ? { ...m, active } : m)),
  );
}

function remove(index: number): void {
  emit(
    'update',
    props.modifiers.filter((_, i) => i !== index),
  );
}

function add(): void {
  const amount = value.value;
  if (amount === undefined || !Number.isInteger(amount) || amount === 0 || full.value) {
    return;
  }
  const text = label.value.trim();
  emit('update', [
    ...props.modifiers,
    { value: amount, ...(text === '' ? {} : { label: text }), active: true },
  ]);
  value.value = undefined;
  label.value = '';
}

function describe(modifier: SituationalModifier): string {
  return `${signed(modifier.value)} ${modifier.label ?? 'Situational'}`;
}
</script>

<template>
  <div
    ref="root"
    class="mods"
    role="group"
    aria-label="Situational modifiers"
    @focusout="onFocusOut"
    @keydown.esc.stop="close(true)"
  >
    <span class="mods-total">Mods {{ signed(total) }}</span>
    <div class="mods-add">
      <input
        v-model.number="value"
        type="number"
        step="1"
        aria-label="Modifier value"
        placeholder="+2"
        @keydown.enter.prevent="add"
      />
      <input
        v-model="label"
        type="text"
        maxlength="40"
        aria-label="Modifier label"
        placeholder="Label (optional)"
        @keydown.enter.prevent="add"
      />
      <button type="button" :disabled="full" @click="add">Add</button>
    </div>
    <button
      ref="toggle"
      type="button"
      class="mods-toggle"
      aria-controls="mods-list"
      :aria-expanded="open"
      @click="open = !open"
    >
      Saved ({{ modifiers.length }}) ▾
    </button>
    <div v-if="open" id="mods-list" class="mods-panel">
      <p v-if="modifiers.length === 0" class="mods-empty">None saved.</p>
      <ul v-else class="mods-list">
        <li v-for="(modifier, index) in modifiers" :key="index" class="chip">
          <label>
            <input
              type="checkbox"
              :checked="modifier.active"
              @change="setActive(index, ($event.target as HTMLInputElement).checked)"
            />
            {{ describe(modifier) }}
          </label>
          <button
            type="button"
            :aria-label="`Remove ${describe(modifier)}`"
            @click="remove(index)"
          >
            ×
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* A fixed-size control: the saved modifiers live in the dropdown, so adding one
   never reshapes the row. */
.mods {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.mods-total {
  min-width: 5rem;
  font-weight: 600;
}
.mods-toggle {
  min-width: 8rem;
}
.mods-panel {
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: var(--z-popover);
  width: 16rem;
  max-height: 14rem;
  margin-bottom: var(--space-1);
  padding: var(--space-2);
  overflow-y: auto;
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
}
.mods-empty {
  margin: 0;
  color: var(--color-text-muted);
}
.mods-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
}
.chip label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
button {
  min-height: var(--touch-target-min);
}
.mods-add {
  display: flex;
  gap: var(--space-1);
}
.mods-add input[type='number'] {
  width: 4rem;
}
.mods-add input[type='text'] {
  width: 9rem;
}
</style>
