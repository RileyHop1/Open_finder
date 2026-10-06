<script setup lang="ts">
/**
 * The action row's situational modifiers (ADR 0023: the player makes the
 * rulings and adds their own numbers). A "Mods +3" button opens a small list of
 * saved modifiers -- "+2 Flanking" -- each with an on/off checkbox and a remove
 * button, plus a row to add one. Only the switched-on ones count toward a roll;
 * the number on the button is their sum. It only reports the new list; the
 * parent saves it on the actor so it follows the player to another device.
 * Closes on Escape (focus returns to the button) or when focus leaves it.
 */
import type { SituationalModifier } from '@hearthtable/core';
import { MAX_SITUATIONAL_MODIFIERS } from '@hearthtable/core';
import { computed, nextTick, ref, useTemplateRef } from 'vue';

import { modifierSum } from './actionBarModel.js';
import { signed } from './sheet/format.js';

const props = defineProps<{ modifiers: readonly SituationalModifier[] }>();
const emit = defineEmits<{ update: [modifiers: SituationalModifier[]] }>();

const open = ref(false);
const value = ref<number>();
const label = ref('');
const root = useTemplateRef<HTMLElement>('root');
const toggle = useTemplateRef<HTMLButtonElement>('toggle');
const valueInput = useTemplateRef<HTMLInputElement>('valueInput');

const total = computed(() => modifierSum(props.modifiers));
const full = computed(() => props.modifiers.length >= MAX_SITUATIONAL_MODIFIERS);

async function show(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    valueInput.value?.focus();
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
  <div ref="root" class="mods" @focusout="onFocusOut" @keydown.esc.stop="close(true)">
    <button
      ref="toggle"
      type="button"
      class="mods-toggle"
      aria-controls="mods-panel"
      :aria-expanded="open"
      @click="show"
    >
      Mods {{ signed(total) }}
    </button>
    <div
      v-if="open"
      id="mods-panel"
      class="mods-panel"
      role="group"
      aria-label="Modifiers"
    >
      <ul v-if="modifiers.length > 0" class="mods-list">
        <li v-for="(modifier, index) in modifiers" :key="index">
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
      <p v-else class="mods-empty">None saved.</p>
      <div class="mods-add">
        <input
          ref="valueInput"
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
    </div>
  </div>
</template>

<style scoped>
.mods {
  position: relative;
}
button {
  min-height: var(--touch-target-min);
}
.mods-panel {
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: var(--z-popover);
  min-width: 16rem;
  margin-bottom: var(--space-1);
  padding: var(--space-2);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
}
.mods-list {
  list-style: none;
  margin: 0 0 var(--space-2);
  padding: 0;
}
.mods-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.mods-list label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.mods-empty {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
}
.mods-add {
  display: flex;
  gap: var(--space-1);
}
.mods-add input[type='number'] {
  width: 4rem;
}
</style>
