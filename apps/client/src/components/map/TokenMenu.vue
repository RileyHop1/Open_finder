<script setup lang="ts">
/**
 * The GM's menu for one token: hide it from the players or show it, show or hide a
 * monster's HP bar, change its name or size, or take it off the map. It opens over the token from a right
 * click, or from the keyboard (the Menu key, or Shift+F10, with the token
 * selected), so nothing here needs a pointer. It only asks: `MapView` sends the
 * operations and says what happened.
 *
 * It is a plain `menu` (arrow keys, Home and End move between items, Escape or
 * Tab closes it) with one extra step: "Name and size" swaps the items for a small
 * form. Removing a token only takes it off this map, never the character or
 * monster behind it, so it can be placed again; it asks no confirmation.
 *
 * Like the token list it has no scroll container, which would leave a stale
 * rectangle over the WebGL canvas in Chromium.
 */
import { MAX_TOKEN_SIZE } from '@hearthtable/core';
import { nextTick, onMounted, ref, useTemplateRef } from 'vue';

import type { TokenView } from './tokenModel.js';

const props = withDefaults(
  defineProps<{
    token: TokenView;
    /** Where to open, in pixels from the map's top left corner. */
    x: number;
    y: number;
    /** Whether a combat is running that this token could join. Absent (or already joined) hides the item. */
    canJoinCombat?: boolean;
    /** Whether this token already has an out-of-turn movement grant. Absent (no active combat) hides the item. */
    movementGranted?: boolean | undefined;
  }>(),
  { movementGranted: undefined },
);

const emit = defineEmits<{
  close: [];
  toggleHidden: [];
  toggleHpBar: [];
  remove: [];
  addToCombat: [];
  toggleMovementGrant: [];
  /** Only the fields that changed; `name: null` goes back to the character's own name. */
  update: [changes: { name?: string | null; size?: number }];
}>();

const root = useTemplateRef<HTMLElement>('root');
const editing = ref(false);
const name = ref(props.token.label);
const size = ref(props.token.size);

onMounted(focusFirst);

async function focusFirst(): Promise<void> {
  await nextTick();
  root.value?.querySelector<HTMLElement>('button, input')?.focus();
}

function items(): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  if (event.key === 'Tab' && !editing.value) {
    emit('close');
    return;
  }
  const list = items();
  const at = list.findIndex((item) => item === item.ownerDocument.activeElement);
  const target: Record<string, number> = {
    ArrowDown: (at + 1) % list.length,
    ArrowUp: (at - 1 + list.length) % list.length,
    Home: 0,
    End: list.length - 1,
  };
  const next = target[event.key];
  if (!editing.value && next !== undefined) {
    event.preventDefault();
    list[next]?.focus();
  }
}

function startEditing(): void {
  editing.value = true;
  void focusFirst();
}

function save(): void {
  const changes: { name?: string | null; size?: number } = {};
  const trimmed = name.value.trim();
  if (trimmed !== props.token.label) {
    changes.name = trimmed === '' ? null : trimmed;
  }
  if (Number.isInteger(size.value) && size.value !== props.token.size) {
    changes.size = size.value;
  }
  if (Object.keys(changes).length > 0) {
    emit('update', changes);
  }
  emit('close');
}
</script>

<template>
  <div
    ref="root"
    class="token-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @keydown.stop="onKeyDown"
    @pointerdown.stop
    @contextmenu.prevent.stop
  >
    <ul v-if="!editing" role="menu" :aria-label="`Token: ${token.label}`">
      <li role="none">
        <button type="button" role="menuitem" @click="emit('toggleHidden')">
          {{ token.hidden ? 'Show to players' : 'Hide from players' }}
        </button>
      </li>
      <li v-if="token.npc" role="none">
        <button type="button" role="menuitem" @click="emit('toggleHpBar')">
          {{ token.showHpBar ? 'Hide HP bar from players' : 'Show HP bar to players' }}
        </button>
      </li>
      <li role="none">
        <button type="button" role="menuitem" @click="startEditing">Name and size</button>
      </li>
      <li v-if="canJoinCombat === true" role="none">
        <button type="button" role="menuitem" @click="emit('addToCombat')">
          Add to combat
        </button>
      </li>
      <li v-if="movementGranted !== undefined" role="none">
        <button type="button" role="menuitem" @click="emit('toggleMovementGrant')">
          {{ movementGranted ? 'Revoke movement' : 'Let this token move' }}
        </button>
      </li>
      <li role="none">
        <button type="button" role="menuitem" @click="emit('remove')">
          Remove from map
        </button>
      </li>
    </ul>
    <form
      v-else
      role="group"
      :aria-label="`Name and size of ${token.label}`"
      @submit.prevent="save"
    >
      <p>
        <label for="token-name">Name on the map</label>
        <input id="token-name" v-model="name" type="text" maxlength="100" />
      </p>
      <p>
        <label for="token-size">Size in squares</label>
        <input
          id="token-size"
          v-model.number="size"
          type="number"
          min="1"
          :max="MAX_TOKEN_SIZE"
          step="1"
          required
        />
      </p>
      <p class="buttons">
        <button type="submit">Save</button>
        <button type="button" @click="emit('close')">Cancel</button>
      </p>
    </form>
  </div>
</template>

<style scoped>
.token-menu {
  position: absolute;
  z-index: var(--z-overlay);
  min-width: 12rem;
  padding: var(--space-1);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--overlay-shadow);
}

ul {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

p {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: var(--space-1);
}

p.buttons {
  flex-direction: row;
}

button,
input {
  min-height: var(--touch-target-min);
}

[role='menuitem'] {
  width: 100%;
  text-align: left;
}
</style>
