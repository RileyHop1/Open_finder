<script setup lang="ts">
/**
 * A character's purse as four denominations, and (for an owner or the GM) a
 * small form to add or spend coins (ADR 0021, `docs/inventory.md`). The player
 * types what moved in any denomination and chooses **Add** or **Spend**; it
 * only reports the signed change, and the server makes change (it converts to
 * copper and reassembles), so spending 3 sp from a lone gold piece just works.
 * A spend the purse cannot cover is refused by the server with a message in the
 * table's usual alert -- it is arithmetic, not a ruling -- so nothing here
 * pre-judges it.
 */
import type { Coins } from '@hearthtable/pf2e';
import { ref } from 'vue';

import GiveMenu from './GiveMenu.vue';
import type { GiveChoice, Recipient } from './giveModel.js';

const DENOMINATIONS = ['pp', 'gp', 'sp', 'cp'] as const;
type Denomination = (typeof DENOMINATIONS)[number];

withDefaults(
  defineProps<{
    coins: Coins;
    editable?: boolean;
    recipients?: readonly Recipient[] | undefined;
  }>(),
  { editable: false, recipients: () => [] },
);
const emit = defineEmits<{
  adjust: [delta: Partial<Record<Denomination, number>>];
  give: [to: string, coins: Partial<Record<Denomination, number>>];
}>();

const giving = ref(false);

function onGive(choice: GiveChoice): void {
  giving.value = false;
  if (choice.coins !== undefined) {
    emit('give', choice.to, choice.coins);
  }
}

const amounts = ref<Record<Denomination, number | undefined>>({
  pp: undefined,
  gp: undefined,
  sp: undefined,
  cp: undefined,
});

/** Sends the typed amounts, negated for a spend, and clears the form. Does nothing when every field is empty or zero. */
function submit(sign: 1 | -1): void {
  const delta: Partial<Record<Denomination, number>> = {};
  for (const denomination of DENOMINATIONS) {
    const amount = amounts.value[denomination];
    if (amount !== undefined && Number.isInteger(amount) && amount > 0) {
      delta[denomination] = sign * amount;
    }
  }
  if (Object.keys(delta).length === 0) {
    return;
  }
  emit('adjust', delta);
  for (const denomination of DENOMINATIONS) {
    amounts.value[denomination] = undefined;
  }
}
</script>

<template>
  <section class="coins" aria-labelledby="coins-heading">
    <h4 id="coins-heading">Coins</h4>
    <dl class="purse">
      <div v-for="denomination in DENOMINATIONS" :key="denomination" class="coin">
        <dt>{{ denomination }}</dt>
        <dd>{{ coins[denomination] }}</dd>
      </div>
    </dl>
    <form v-if="editable" class="adjust" aria-label="Add or spend coins" @submit.prevent>
      <label v-for="denomination in DENOMINATIONS" :key="denomination">
        <span class="denomination">{{ denomination }}</span>
        <input
          v-model.number="amounts[denomination]"
          type="number"
          min="0"
          step="1"
          :aria-label="`${denomination} to add or spend`"
        />
      </label>
      <button type="button" @click="submit(1)">Add</button>
      <button type="button" @click="submit(-1)">Spend</button>
      <button
        v-if="recipients.length > 0"
        type="button"
        :aria-expanded="giving"
        @click="giving = !giving"
      >
        Give…
      </button>
    </form>
    <GiveMenu
      v-if="editable && giving"
      :recipients="recipients"
      coins
      label="coins"
      @give="onGive"
      @cancel="giving = false"
    />
  </section>
</template>

<style scoped>
.coins h4 {
  margin: 0 0 var(--space-1);
}
.purse {
  display: flex;
  gap: var(--space-3);
  margin: 0 0 var(--space-2);
}
.coin {
  display: flex;
  gap: var(--space-1);
}
.coin dt {
  color: var(--color-text-muted);
}
.coin dd {
  margin: 0;
  font-weight: 600;
}
.adjust {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.adjust label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.adjust input {
  width: 4.5rem;
}
button {
  min-height: var(--touch-target-min);
}
</style>
