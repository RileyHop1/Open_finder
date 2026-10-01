<script setup lang="ts">
/**
 * The tokens on the map, as a list a keyboard and a screen reader can use: the
 * canvas is a picture, so this is how a person without a pointer reaches a
 * token (Tab to it, Enter to open its sheet). It reads the same `TokenView`s
 * the canvas draws, so the two cannot disagree.
 *
 * It stays out of the way until it is wanted: visually hidden while nothing in
 * it has focus, and shown as a small panel over the map's corner while one of
 * its buttons does, so a sighted keyboard user sees where they are. A token
 * whose actor this seat cannot open (a monster, for a player) is listed by name
 * only, since there is nothing to open.
 */
import { describeToken, type TokenView } from './tokenModel.js';

defineProps<{ views: readonly TokenView[] }>();
const emit = defineEmits<{ open: [actorId: string] }>();
</script>

<template>
  <section v-if="views.length > 0" class="token-list" aria-label="Tokens on the map">
    <ul>
      <li v-for="view in views" :key="view.id">
        <button v-if="view.openable" type="button" @click="emit('open', view.actorId)">
          {{ describeToken(view) }}
        </button>
        <span v-else>{{ describeToken(view) }}</span>
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
  flex: 0 1 10rem;
  min-width: 8rem;
}

li > span {
  display: block;
  padding: var(--space-2);
}

button {
  min-height: var(--touch-target-min);
  width: 100%;
  text-align: left;
  cursor: pointer;
}
</style>
