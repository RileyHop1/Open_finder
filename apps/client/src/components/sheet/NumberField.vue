<script setup lang="ts">
/**
 * A whole-number input that saves when the value is committed (Enter or
 * leaving the field), not on every keystroke, so a half-typed number is never
 * sent. A value that is not a whole number puts the old value back; one outside
 * `min`/`max` is clamped to it. The label is real (`<label for>`); `hideLabel`
 * hides it visually only, for use inside a table whose column already names it.
 */
import { useId } from 'vue';

const props = defineProps<{
  label: string;
  value: number;
  min?: number;
  max?: number;
  hideLabel?: boolean;
}>();
const emit = defineEmits<{ commit: [value: number] }>();
const id = useId();

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const typed = input.valueAsNumber;
  if (!Number.isInteger(typed)) {
    input.value = String(props.value);
    return;
  }
  const clamped = Math.min(
    props.max ?? Infinity,
    Math.max(props.min ?? -Infinity, typed),
  );
  input.value = String(clamped);
  if (clamped !== props.value) {
    emit('commit', clamped);
  }
}
</script>

<template>
  <span class="number-field">
    <label :for="id" :class="{ 'visually-hidden': hideLabel }">{{ label }}</label>
    <input
      :id="id"
      type="number"
      step="1"
      :min="min"
      :max="max"
      :value="value"
      @change="onChange"
    />
  </span>
</template>

<style scoped>
.number-field {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

input {
  width: 5rem;
  min-height: var(--touch-target-min);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
