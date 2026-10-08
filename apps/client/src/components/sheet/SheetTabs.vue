<script setup lang="ts">
/**
 * An accessible tab strip (WAI-ARIA tabs, automatic activation): Left/Right
 * move between tabs and select them, Home/End jump to the ends, and only the
 * selected tab is in the Tab order. This renders the strip only; the parent
 * renders each panel with `role="tabpanel"`, `id` = `panelId(tab)` and
 * `aria-labelledby` = `tabId(tab)`, so a panel can hold anything.
 */
import { nextTick, useTemplateRef } from 'vue';

const props = defineProps<{
  tabs: readonly { id: string; label: string }[];
  modelValue: string;
  /** Prefix for the tab and panel ids, unique per sheet (several can exist). */
  idPrefix: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [id: string] }>();

const buttons = useTemplateRef<HTMLButtonElement[]>('buttons');

async function select(index: number): Promise<void> {
  const tab = props.tabs[(index + props.tabs.length) % props.tabs.length];
  if (tab === undefined) {
    return;
  }
  emit('update:modelValue', tab.id);
  await nextTick();
  buttons.value?.find((b) => b.id === `${props.idPrefix}-tab-${tab.id}`)?.focus();
}

function onKeydown(event: KeyboardEvent, index: number): void {
  const target =
    event.key === 'ArrowRight'
      ? index + 1
      : event.key === 'ArrowLeft'
        ? index - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? props.tabs.length - 1
            : undefined;
  if (target === undefined) {
    return;
  }
  event.preventDefault();
  void select(target);
}
</script>

<template>
  <div class="tab-strip" role="tablist">
    <button
      v-for="(tab, index) in tabs"
      :id="`${idPrefix}-tab-${tab.id}`"
      ref="buttons"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="tab.id === modelValue"
      :aria-controls="`${idPrefix}-panel-${tab.id}`"
      :tabindex="tab.id === modelValue ? 0 : -1"
      @click="emit('update:modelValue', tab.id)"
      @keydown="onKeydown($event, index)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>

<style scoped>
.tab-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

button {
  min-height: var(--touch-target-min);
  padding: 0 var(--space-3);
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: var(--color-text);
}

/* The selected tab is marked by weight and an underline, never colour alone. */
button[aria-selected='true'] {
  border-color: var(--color-border);
  background: var(--color-surface);
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 0.3em;
}
</style>
