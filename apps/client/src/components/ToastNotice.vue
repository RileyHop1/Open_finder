<script setup lang="ts">
/**
 * A floating, dismissible notice over the map -- an operation rejection
 * (`kind: 'error'`) or a passive status note. Two things every such notice
 * on the map was missing before this existed: a way to close it by hand,
 * and a way for it to go away on its own. Without both, a rejected
 * `token.move` ("only N actions left") sits on screen forever and, if its
 * positioning collides with another floating note, can grow to cover the
 * whole map (see the removed `.map-note`/`.map-error` rule this replaced).
 *
 * The caller still owns *when* the notice appears and what it says --
 * this only owns dismissal. `autoDismissMs` of `0` turns auto-dismiss off
 * entirely, for a note that should stay until the caller clears it (e.g.
 * while a condition it describes is still true).
 */
import { onBeforeUnmount, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    message: string;
    kind?: 'error' | 'status';
    autoDismissMs?: number;
  }>(),
  { kind: 'error', autoDismissMs: 6000 },
);

const emit = defineEmits<{ dismiss: [] }>();

let timer: ReturnType<typeof globalThis.setTimeout> | undefined;

function clearTimer(): void {
  globalThis.clearTimeout(timer);
  timer = undefined;
}

function armTimer(): void {
  clearTimer();
  if (props.autoDismissMs > 0) {
    timer = globalThis.setTimeout(() => emit('dismiss'), props.autoDismissMs);
  }
}

// A new message (even the same text re-shown) restarts the clock, so a
// toast never disappears mid-read just because it happened to be shown a
// little earlier than this particular display of it.
watch(() => props.message, armTimer, { immediate: true });

onBeforeUnmount(clearTimer);
</script>

<template>
  <p
    class="toast-notice"
    :class="`toast-notice--${kind}`"
    :role="kind === 'error' ? 'alert' : 'status'"
  >
    <span>{{ message }}</span>
    <button
      type="button"
      class="toast-dismiss"
      aria-label="Dismiss"
      @click="emit('dismiss')"
    >
      &times;
    </button>
  </p>
</template>

<style scoped>
.toast-notice {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  right: auto;
  bottom: auto;
  z-index: var(--z-overlay);
  max-width: calc(100% - var(--space-4));
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--overlay-radius);
  box-shadow: var(--overlay-shadow);
}

.toast-notice--error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.toast-notice--status {
  background: var(--color-surface);
  color: var(--color-text);
}

.toast-dismiss {
  flex-shrink: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}
</style>
