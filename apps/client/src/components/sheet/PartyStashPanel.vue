<script setup lang="ts">
/**
 * The party's shared stash (ADR 0021, `docs/inventory.md`): the purse and the
 * items nobody is carrying yet. Everyone at the table can see it; players put
 * things in with the Give… menu on their own sheet ("Party stash" is a
 * recipient). Taking things out is the GM's call, as with every stash change
 * (the server refuses anyone else): the GM can give an item or coins to any
 * party member, or **split the coins evenly** among them (the remainder stays
 * in the stash). It only reports the choice; `TableView` sends the transfers.
 */
import { coinsToCopper, type PartyStash } from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

import { formatPrice } from './format.js';
import GiveMenu from './GiveMenu.vue';
import type { GiveChoice, Recipient } from './giveModel.js';
import { evenShare } from './stashModel.js';

const props = defineProps<{
  stash: PartyStash;
  isGm: boolean;
  /** The party members the GM can give to. */
  recipients: readonly Recipient[];
}>();
const emit = defineEmits<{
  take: [itemId: string, to: string, quantity?: number];
  takeCoins: [to: string, coins: Partial<Record<'pp' | 'gp' | 'sp' | 'cp', number>>];
  split: [share: NonNullable<ReturnType<typeof evenShare>>];
}>();

const DENOMINATIONS = ['pp', 'gp', 'sp', 'cp'] as const;
/** The item whose Give form is open, or `'coins'`: one at a time. */
const giving = ref<string>();

const share = computed(() => evenShare(props.stash.coins, props.recipients.length));

function onGive(itemId: string, choice: GiveChoice): void {
  giving.value = undefined;
  emit('take', itemId, choice.to, choice.quantity);
}

function onGiveCoins(choice: GiveChoice): void {
  giving.value = undefined;
  if (choice.coins !== undefined) {
    emit('takeCoins', choice.to, choice.coins);
  }
}
</script>

<template>
  <section class="stash" aria-labelledby="stash-heading">
    <h4 id="stash-heading">Party stash</h4>

    <dl class="purse">
      <div v-for="denomination in DENOMINATIONS" :key="denomination" class="coin">
        <dt>{{ denomination }}</dt>
        <dd>{{ stash.coins[denomination] }}</dd>
      </div>
    </dl>
    <p v-if="isGm && recipients.length > 0" class="coin-actions">
      <button
        type="button"
        :aria-expanded="giving === 'coins'"
        @click="giving = giving === 'coins' ? undefined : 'coins'"
      >
        Give coins…
      </button>
      <button
        type="button"
        :disabled="share === undefined"
        :title="
          share === undefined
            ? 'Nothing to split'
            : `Each of ${recipients.length} gets ${formatPrice(coinsToCopper(share))}`
        "
        @click="share && emit('split', share)"
      >
        Split evenly
      </button>
    </p>
    <GiveMenu
      v-if="isGm && giving === 'coins'"
      :recipients="recipients"
      coins
      label="stash coins"
      @give="onGiveCoins"
      @cancel="giving = undefined"
    />

    <p v-if="stash.items.length === 0" class="empty">No items.</p>
    <ul v-else class="items">
      <li v-for="item in stash.items" :key="item.id" class="item">
        <span class="item-name">{{ item.entry.name }}</span>
        <span v-if="item.quantity > 1" class="quantity">×{{ item.quantity }}</span>
        <button
          v-if="isGm && recipients.length > 0"
          type="button"
          :aria-label="`Give ${item.entry.name}`"
          :aria-expanded="giving === item.id"
          @click="giving = giving === item.id ? undefined : item.id"
        >
          Give…
        </button>
        <GiveMenu
          v-if="isGm && giving === item.id"
          :recipients="recipients"
          :max-quantity="item.quantity"
          :label="item.entry.name"
          @give="(choice) => onGive(item.id, choice)"
          @cancel="giving = undefined"
        />
      </li>
    </ul>
    <p v-if="!isGm" class="hint">
      Use Give… on your own items to put them here. The GM hands things out.
    </p>
  </section>
</template>

<style scoped>
.stash h4 {
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
.coin-actions {
  display: flex;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
}
.items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.empty,
.hint {
  margin: 0;
  color: var(--color-text-muted);
}
button {
  min-height: var(--touch-target-min);
}
</style>
