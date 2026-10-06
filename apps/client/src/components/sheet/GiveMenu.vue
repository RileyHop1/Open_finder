<script setup lang="ts">
/**
 * "Give to…": a small inline form that hands an item, or some coins, to another
 * character or the party stash (ADR 0021, `inventory.transfer`). The player picks
 * a recipient and, for a stack of two or more, how many; for coins, how much of
 * each denomination. It only reports the choice -- the server moves it, refusing
 * anything the giver does not actually have. Giving needs no consent from the
 * recipient. Escape cancels. A real form, so it is all reachable by keyboard.
 */
import { onMounted, ref, useTemplateRef } from 'vue';

import type { GiveChoice, Recipient } from './giveModel.js';

const DENOMINATIONS = ['pp', 'gp', 'sp', 'cp'] as const;

const props = defineProps<{
  recipients: readonly Recipient[];
  /** The stack size when giving an item; the quantity field shows for 2 or more. */
  maxQuantity?: number;
  /** Give coins (four denominations) instead of an item. */
  coins?: boolean;
  /** Names the thing being given, for the form's label. */
  label: string;
}>();
const emit = defineEmits<{ give: [choice: GiveChoice]; cancel: [] }>();

const to = ref(props.recipients[0]?.id ?? '');
const quantity = ref<number>(props.maxQuantity ?? 1);
const amounts = ref<Record<(typeof DENOMINATIONS)[number], number | undefined>>({
  pp: undefined,
  gp: undefined,
  sp: undefined,
  cp: undefined,
});
const select = useTemplateRef<HTMLSelectElement>('select');
onMounted(() => select.value?.focus());

function submit(): void {
  if (to.value === '') {
    return;
  }
  if (props.coins === true) {
    const coins: Partial<Record<(typeof DENOMINATIONS)[number], number>> = {};
    for (const denomination of DENOMINATIONS) {
      const amount = amounts.value[denomination];
      if (amount !== undefined && Number.isInteger(amount) && amount > 0) {
        coins[denomination] = amount;
      }
    }
    if (Object.keys(coins).length === 0) {
      return;
    }
    emit('give', { to: to.value, coins });
    return;
  }
  const max = props.maxQuantity ?? 1;
  const count = Number.isInteger(quantity.value)
    ? Math.min(max, Math.max(1, quantity.value))
    : max;
  emit('give', { to: to.value, ...(max > 1 ? { quantity: count } : {}) });
}
</script>

<template>
  <form
    class="give"
    :aria-label="`Give ${label}`"
    @submit.prevent="submit"
    @keydown.esc.stop="emit('cancel')"
  >
    <label>
      To
      <select ref="select" v-model="to" aria-label="Give to">
        <option v-for="recipient in recipients" :key="recipient.id" :value="recipient.id">
          {{ recipient.name }}
        </option>
      </select>
    </label>
    <template v-if="coins">
      <label v-for="denomination in DENOMINATIONS" :key="denomination">
        {{ denomination }}
        <input
          v-model.number="amounts[denomination]"
          type="number"
          min="0"
          step="1"
          :aria-label="`${denomination} to give`"
        />
      </label>
    </template>
    <label v-else-if="(maxQuantity ?? 1) > 1">
      How many
      <input
        v-model.number="quantity"
        type="number"
        min="1"
        :max="maxQuantity"
        step="1"
        aria-label="How many to give"
      />
    </label>
    <button type="submit" :disabled="to === ''">Give</button>
    <button type="button" @click="emit('cancel')">Cancel</button>
  </form>
</template>

<style scoped>
.give {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-1);
}
.give label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.give input[type='number'] {
  width: 4.5rem;
}
button {
  min-height: var(--touch-target-min);
}
</style>
