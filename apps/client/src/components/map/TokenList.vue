<script setup lang="ts">
/**
 * The tokens on the map, as a list a keyboard and a screen reader can use: the
 * canvas is a picture, so this is how a person without a pointer reaches a
 * token. Each row has a button to select it (then the arrow keys move it, if
 * this seat may) and, where there is a sheet to open, a second to open it. It reads the same `TokenView`s
 * the canvas draws, so the two cannot disagree.
 *
 * It stays out of the way until it is wanted: visually hidden while nothing in
 * it has focus, and shown as a small panel over the map's corner while one of
 * its buttons does, so a sighted keyboard user sees where they are. A token
 * whose actor this seat cannot open (a monster, for a player) has no sheet
 * button, since there is nothing to open.
 *
 * The GM's exits are listed here too, after the tokens, each a button that asks
 * to move the party through it: the keyboard route to what a click on the exit's
 * marker does.
 */
import { describeExit, type ExitView } from './exitModel.js';
import { describeToken, type TokenView } from './tokenModel.js';

withDefaults(
  defineProps<{ views: readonly TokenView[]; exits?: readonly ExitView[] }>(),
  {
    exits: () => [],
  },
);
const emit = defineEmits<{
  select: [tokenId: string];
  open: [actorId: string];
  exit: [exitId: string];
}>();
</script>

<template>
  <section
    v-if="views.length > 0 || exits.length > 0"
    class="token-list"
    :aria-label="exits.length > 0 ? 'Tokens and exits on the map' : 'Tokens on the map'"
  >
    <ul>
      <li v-for="view in views" :key="view.id">
        <button
          type="button"
          :aria-pressed="view.selected"
          :title="view.movable ? 'Select, then the arrow keys move it' : 'Select'"
          @click="emit('select', view.id)"
        >
          {{ describeToken(view) }}
        </button>
        <button
          v-if="view.openable"
          type="button"
          class="sheet"
          :aria-label="`Open the sheet of ${describeToken(view)}`"
          @click="emit('open', view.actorId)"
        >
          Sheet
        </button>
      </li>
      <li v-for="exit in exits" :key="exit.id">
        <button
          type="button"
          title="Move the party through this exit"
          @click="emit('exit', exit.id)"
        >
          {{ describeExit(exit) }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/*
 * Always in the same place and the same size, and only transparent until something in
 * it has focus: it stays in the tab order and the accessibility tree.
 *
 * It deliberately has no scroll container. A scrolling element over the WebGL canvas
 * left a stale rectangle painted over the map in Chromium (found in a real-browser
 * check), so a long list wraps into rows instead.
 */
.token-list {
  position: absolute;
  left: var(--space-2);
  bottom: var(--space-2);
  max-width: calc(100% - 2 * var(--space-2));
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  opacity: 0;
  pointer-events: none;
}

.token-list:focus-within {
  opacity: 1;
  pointer-events: auto;
}

ul {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex: 0 1 14rem;
  gap: var(--space-1);
  min-width: 10rem;
}

button {
  min-height: var(--touch-target-min);
  flex: 1;
  text-align: left;
  cursor: pointer;
}

button.sheet {
  flex: 0 0 auto;
}

button[aria-pressed='true'] {
  font-weight: bold;
  outline: 2px solid var(--color-accent);
}
</style>
