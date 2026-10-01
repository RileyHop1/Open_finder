<script setup lang="ts">
/**
 * Picks a proficiency rank. A native `<select>`, so it is keyboard- and
 * screen-reader-operable with no extra work, and the options are words
 * (Untrained ... Legendary), never colours. `label` is the accessible name.
 */
import type { ProficiencyRank } from '@hearthtable/pf2e';
import { PROFICIENCY_RANKS } from '@hearthtable/pf2e';
import { useId } from 'vue';

import { titleCase } from './format.js';

defineProps<{ label: string; value: ProficiencyRank }>();
const emit = defineEmits<{ commit: [rank: ProficiencyRank] }>();
const id = useId();

function onChange(event: Event): void {
  emit('commit', (event.target as HTMLSelectElement).value as ProficiencyRank);
}
</script>

<template>
  <select :id="id" :aria-label="label" :value="value" @change="onChange">
    <option v-for="rank in PROFICIENCY_RANKS" :key="rank" :value="rank">
      {{ titleCase(rank) }}
    </option>
  </select>
</template>

<style scoped>
select {
  min-height: var(--touch-target-min);
}
</style>
