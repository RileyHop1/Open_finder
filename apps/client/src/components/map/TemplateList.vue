<script setup lang="ts">
/**
 * The area templates placed on the shown scene (M5 C.9a), as a list a
 * keyboard and a screen reader can use -- there is no drag-only way to
 * remove one, so this is also the *only* route, not just an alternative.
 * Every seat sees every template (`docs/template.md`); only the GM or the
 * seat that placed it may remove it.
 */
import type { Template } from '@hearthtable/core';

import { titleCase } from '../sheet/format.js';

const props = withDefaults(
  defineProps<{
    templates: readonly Template[];
    mySeatId?: string | undefined;
    isGm?: boolean;
  }>(),
  { mySeatId: undefined, isGm: false },
);
const emit = defineEmits<{ remove: [templateId: string] }>();

/** "Fireball (Burst 20 ft)", or just "Burst 20 ft" with no label. */
function describeTemplate(template: Template): string {
  const shape = `${titleCase(template.shape)} ${template.feet} ft`;
  return template.label === undefined ? shape : `${template.label} (${shape})`;
}

function canRemove(template: Template): boolean {
  return props.isGm || template.placedBy === props.mySeatId;
}
</script>

<template>
  <section
    v-if="templates.length > 0"
    class="template-list"
    aria-label="Templates on the map"
  >
    <ul>
      <li v-for="template in templates" :key="template.id">
        <span class="label">{{ describeTemplate(template) }}</span>
        <button
          v-if="canRemove(template)"
          type="button"
          :aria-label="`Remove ${describeTemplate(template)}`"
          @click="emit('remove', template.id)"
        >
          Remove
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* Positioned by the parent `.right-stack` (MapView.vue), not by this component. */
.template-list {
  max-width: 100%;
  padding: var(--space-2);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--overlay-bg);
  color: var(--color-text);
  box-shadow: var(--overlay-shadow);
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
  align-items: center;
  gap: var(--space-1);
  min-height: var(--touch-target-min);
}

button {
  min-height: var(--touch-target-min);
  cursor: pointer;
}
</style>
