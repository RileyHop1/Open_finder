<script setup lang="ts">
/**
 * A sheet number's own breakdown popover (ADR 0008's "show the math",
 * CLAUDE.md's Player experience section): wraps whatever the sheet already
 * shows for a statistic (its total, as the slot content) in a trigger that
 * opens a `ModifierList` on click, Enter, or tap -- a native `<button>`
 * already answers "click, Enter, or tap" without any extra key handling,
 * the same way it does for every other button in this app.
 *
 * Deliberately **not** `RulesTerm.vue`'s pattern: no hover-open (a number
 * on the sheet isn't a term with a resolvable fetch; its `Statistic` is
 * already in hand, passed in by the caller), and no nesting concern (a
 * modifier's own label is never itself a `RulesTerm`-style link here). What
 * it does share with `RulesTerm.vue`: Escape closes it, and focus leaving
 * both the trigger and the popover closes it too.
 */
import { ref } from 'vue';

import type { Statistic } from '@hearthtable/core';

import ModifierList from './ModifierList.vue';

defineProps<{
  /** What this number is ("Armor Class", "Fortitude save", ...), used in the popover's heading and the trigger's aria-label. */
  label: string;
  statistic: Statistic;
}>();

const isOpen = ref(false);
const root = ref<HTMLElement>();

function close(): void {
  isOpen.value = false;
}

function toggle(): void {
  isOpen.value = !isOpen.value;
}

/** Closes when focus leaves the trigger *and* the popover both -- tabbing from the trigger into something inside the popover must not close it. */
function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (root.value !== undefined && (next === null || !root.value.contains(next))) {
    close();
  }
}
</script>

<template>
  <span
    ref="root"
    class="stat-breakdown"
    @focusout="onFocusOut"
    @keydown.escape.stop="close"
  >
    <button
      type="button"
      class="stat-trigger"
      :aria-label="`${label}: show breakdown`"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <slot />
    </button>
    <span
      v-if="isOpen"
      class="stat-popover"
      role="dialog"
      :aria-label="`${label} breakdown`"
    >
      <button type="button" class="stat-popover-close" aria-label="Close" @click="close">
        ×
      </button>
      <h4>{{ label }}</h4>
      <ModifierList :statistic="statistic" />
    </span>
  </span>
</template>

<style scoped>
.stat-breakdown {
  position: relative;
  display: inline-block;
}

.stat-trigger {
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-decoration: underline dotted;
  text-decoration-thickness: 1px;
}

.stat-popover {
  position: absolute;
  z-index: var(--z-tooltip);
  top: 100%;
  left: 0;
  display: block;
  min-width: 14rem;
  max-width: 24rem;
  margin-top: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  box-shadow: 0 2px 8px rgb(0 0 0 / 20%);
  text-align: left;
  white-space: normal;
}

.stat-popover h4 {
  margin: 0;
}

.stat-popover-close {
  float: right;
  line-height: 1;
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
}
</style>
