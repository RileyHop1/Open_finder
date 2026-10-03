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
.template-list {
  position: absolute;
  right: var(--space-2);
  bottom: var(--space-2);
  max-width: calc(100% - 2 * var(--space-2));
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
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
