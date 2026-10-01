<script setup lang="ts">
/** A text input that saves on commit (Enter or leaving the field), with a real label. */
import { useId } from 'vue';

const props = defineProps<{ label: string; value: string; required?: boolean }>();
const emit = defineEmits<{ commit: [value: string] }>();
const id = useId();

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const text = input.value.trim();
  if (props.required === true && text.length === 0) {
    input.value = props.value;
    return;
  }
  if (text !== props.value) {
    emit('commit', text);
  }
}
</script>

<template>
  <span class="text-field">
    <label :for="id">{{ label }}</label>
    <input :id="id" type="text" autocomplete="off" :value="value" @change="onChange" />
  </span>
</template>

<style scoped>
.text-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

input {
  min-height: var(--touch-target-min);
}
</style>
