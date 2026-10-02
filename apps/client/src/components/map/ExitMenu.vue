<script setup lang="ts">
/**
 * The GM's pop-up for exits, in two forms. **Add**: opened on empty ground (a right
 * click, or the Menu key / Shift+F10 with no token selected, which uses the middle
 * of what is on screen), it asks for a label and which scene the exit leads to.
 * **Remove**: opened on an exit's marker, it offers to take that exit away. It only
 * asks: `MapView` sends the operations and says what happened.
 *
 * An exit cannot lead to the scene it is on, so the choices are the other scenes;
 * with none, it says to make another scene first instead of showing an empty list.
 * (The scene settings have the same two actions as a form, for the keyboard.)
 *
 * Like the other pop-ups over the canvas it has no scroll container.
 */
import { nextTick, onMounted, ref, useTemplateRef } from 'vue';

import type { ExitView } from './exitModel.js';

const props = defineProps<{
  mode: 'add' | 'remove';
  /** Where to open, in pixels from the map's top left corner. */
  x: number;
  y: number;
  /** The scenes an exit could lead to: every scene but this one. */
  targets: readonly { id: string; name: string }[];
  /** The exit being removed, for `remove`. */
  exit?: ExitView | undefined;
}>();

const emit = defineEmits<{
  close: [];
  add: [label: string, targetSceneId: string];
  remove: [];
}>();

const root = useTemplateRef<HTMLElement>('root');
const label = ref('');
const target = ref(props.targets[0]?.id ?? '');

onMounted(async () => {
  await nextTick();
  root.value?.querySelector<HTMLElement>('input, button')?.focus();
});

function submit(): void {
  const trimmed = label.value.trim();
  if (trimmed !== '' && target.value !== '') {
    emit('add', trimmed, target.value);
  }
}
</script>

<template>
  <div
    ref="root"
    class="exit-menu"
    role="group"
    :aria-label="mode === 'add' ? 'Add an exit here' : `Exit: ${exit?.label ?? ''}`"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @keydown.esc.stop.prevent="emit('close')"
    @keydown.stop
    @pointerdown.stop
    @contextmenu.prevent.stop
  >
    <template v-if="mode === 'add'">
      <p v-if="targets.length === 0" class="note">
        Make another scene first: an exit leads to a different scene.
      </p>
      <form v-else @submit.prevent="submit">
        <p>
          <label for="exit-label">Label</label>
          <input id="exit-label" v-model="label" type="text" maxlength="100" required />
        </p>
        <p>
          <label for="exit-target">Leads to</label>
          <select id="exit-target" v-model="target">
            <option v-for="scene in targets" :key="scene.id" :value="scene.id">
              {{ scene.name }}
            </option>
          </select>
        </p>
        <p class="buttons">
          <button type="submit">Add exit</button>
          <button type="button" @click="emit('close')">Cancel</button>
        </p>
      </form>
      <p v-if="targets.length === 0" class="buttons">
        <button type="button" @click="emit('close')">Close</button>
      </p>
    </template>
    <template v-else>
      <p class="note">
        <strong>{{ exit?.label }}</strong> leads to
        {{ exit?.targetName ?? 'a scene that is gone' }}.
      </p>
      <p class="buttons">
        <button type="button" @click="emit('remove')">Remove exit</button>
        <button type="button" @click="emit('close')">Cancel</button>
      </p>
    </template>
  </div>
</template>

<style scoped>
.exit-menu {
  position: absolute;
  z-index: 5;
  min-width: 14rem;
  max-width: 20rem;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.3);
}

p {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: var(--space-1) 0;
}

p.buttons {
  flex-direction: row;
}

.note {
  color: var(--color-text);
}

button,
input,
select {
  min-height: var(--touch-target-min);
}
</style>
