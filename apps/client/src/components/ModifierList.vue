<script setup lang="ts">
/**
 * A `Statistic`'s modifier list (ADR 0008's "show the math"): the total,
 * then every modifier that went into it, each marked applied or struck
 * through and explained when it wasn't. Shared by `ChatRollCard.vue`'s
 * existing `<details>` disclosure and `StatBreakdown.vue`'s popover --
 * both show the exact same `Statistic` the resolver actually produced,
 * never a recomputation that could disagree with what was rolled or what
 * the sheet displays.
 */
import type { Statistic } from '@hearthtable/core';

import { signed, titleCase } from './sheet/format.js';

withDefaults(defineProps<{ statistic: Statistic; heading?: string }>(), {
  heading: 'Bonus',
});

/** Why a modifier did not count, in words. */
function whyNotApplied(modifier: { suppressedBy?: string | undefined }): string {
  return modifier.suppressedBy === undefined
    ? 'not applied'
    : `not applied: ${titleCase(modifier.suppressedBy)} is better`;
}
</script>

<template>
  <div class="modifier-list">
    <p class="modifiers-heading">{{ heading }} {{ signed(statistic.total) }}</p>
    <ul class="modifiers">
      <li
        v-for="modifier in statistic.modifiers"
        :key="modifier.slug"
        :class="{ unapplied: !modifier.applied }"
      >
        {{ signed(modifier.value) }} {{ modifier.label }}
        <span class="modifier-type">({{ modifier.type }})</span>
        <span v-if="!modifier.applied" class="modifier-note">
          — {{ whyNotApplied(modifier) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.modifiers-heading {
  margin: 0;
}

.modifiers {
  margin: var(--space-1) 0;
  padding-left: var(--space-4);
}

.modifier-type,
.modifier-note {
  color: var(--color-text-muted);
}

/* A suppressed modifier is struck through *and* says so in words. */
.unapplied {
  text-decoration: line-through;
}

.unapplied .modifier-note {
  text-decoration: none;
  display: inline-block;
}
</style>
