<script setup lang="ts">
/**
 * The GM's "Hand out loot" (ADR 0021, `docs/inventory.md`): pick who receives it
 * -- a party member or the party stash -- then either find an item in the
 * compendium and add it (with a stack size), or give coins. The server makes the
 * copy from its own compendium, so this only names an entry and a recipient.
 * The parent does the sending and reports back whether it was accepted, so the
 * status line only says "Gave ..." when it was; a refusal shows in the table's
 * usual alert instead.
 */
import { computed, onMounted, ref } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../api/compendium.js';
import type { Recipient } from './sheet/giveModel.js';

const DENOMINATIONS = ['pp', 'gp', 'sp', 'cp'] as const;
/** The kinds that can be carried and handed out. */
const KINDS = [
  { value: '', label: 'Any' },
  { value: 'weapon', label: 'Weapon' },
  { value: 'armor', label: 'Armor' },
  { value: 'gear', label: 'Gear' },
] as const;

const props = defineProps<{
  /** Party members, then the stash (`id: 'party'`). */
  recipients: readonly Recipient[];
  giveItem: (
    to: string,
    packId: string,
    slug: string,
    quantity: number,
  ) => Promise<boolean>;
  giveCoins: (
    to: string,
    coins: Partial<Record<(typeof DENOMINATIONS)[number], number>>,
  ) => Promise<boolean>;
}>();

/** The recipient the GM picked; until they pick, the first on the list (which may load after this mounts). */
const picked = ref<string>();
const to = computed({
  get: () =>
    props.recipients.some((r) => r.id === picked.value)
      ? (picked.value ?? '')
      : (props.recipients[0]?.id ?? ''),
  set: (id: string) => {
    picked.value = id;
  },
});
const quantity = ref(1);
const query = ref('');
const kind = ref('');
const results = ref<EntrySummary[]>();
const available = ref<boolean>();
const searching = ref(false);
const error = ref<string>();
const status = ref('');
const amounts = ref<Record<(typeof DENOMINATIONS)[number], number | undefined>>({
  pp: undefined,
  gp: undefined,
  sp: undefined,
  cp: undefined,
});

const recipientName = computed(
  () => props.recipients.find((r) => r.id === to.value)?.name ?? 'nobody',
);

onMounted(async () => {
  try {
    available.value = await isCompendiumAvailable();
    if (available.value) {
      await search();
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'search failed';
  }
});

async function search(): Promise<void> {
  searching.value = true;
  error.value = undefined;
  try {
    results.value = await searchCompendium({ q: query.value.trim(), kind: kind.value });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'search failed';
  } finally {
    searching.value = false;
  }
}

async function add(entry: EntrySummary): Promise<void> {
  const count = Number.isInteger(quantity.value)
    ? Math.min(9999, Math.max(1, quantity.value))
    : 1;
  const name = recipientName.value;
  if (
    to.value !== '' &&
    (await props.giveItem(to.value, entry.packId, entry.slug, count))
  ) {
    status.value = `Gave ${count > 1 ? `${count} × ` : ''}${entry.name} to ${name}.`;
  }
}

async function giveCoinsNow(): Promise<void> {
  const coins: Partial<Record<(typeof DENOMINATIONS)[number], number>> = {};
  for (const denomination of DENOMINATIONS) {
    const amount = amounts.value[denomination];
    if (amount !== undefined && Number.isInteger(amount) && amount > 0) {
      coins[denomination] = amount;
    }
  }
  if (to.value === '' || Object.keys(coins).length === 0) {
    return;
  }
  const name = recipientName.value;
  if (await props.giveCoins(to.value, coins)) {
    status.value = `Gave ${Object.entries(coins)
      .map(([d, n]) => `${n} ${d}`)
      .join(', ')} to ${name}.`;
    for (const denomination of DENOMINATIONS) {
      amounts.value[denomination] = undefined;
    }
  }
}
</script>

<template>
  <section class="loot" aria-labelledby="loot-heading">
    <h3 id="loot-heading">Hand out loot</h3>

    <label class="to">
      Give to
      <select v-model="to" aria-label="Give loot to">
        <option v-for="recipient in recipients" :key="recipient.id" :value="recipient.id">
          {{ recipient.name }}
        </option>
      </select>
    </label>

    <p v-if="status" role="status" class="status">{{ status }}</p>

    <h4>Coins</h4>
    <form class="coins" aria-label="Hand out coins" @submit.prevent="giveCoinsNow">
      <label v-for="denomination in DENOMINATIONS" :key="denomination">
        {{ denomination }}
        <input
          v-model.number="amounts[denomination]"
          type="number"
          min="0"
          step="1"
          :aria-label="`${denomination} to hand out`"
        />
      </label>
      <button type="submit">Give coins</button>
    </form>

    <h4>Item</h4>
    <p v-if="available === false" class="empty">
      No game content has been imported yet, so there is nothing to browse. Import it from
      the gear menu's Game content.
    </p>
    <template v-else>
      <form class="search" role="search" @submit.prevent="search">
        <label>
          Name
          <input
            v-model="query"
            type="search"
            autocomplete="off"
            aria-label="Item name"
          />
        </label>
        <label>
          Kind
          <select v-model="kind" aria-label="Item kind" @change="search">
            <option v-for="k in KINDS" :key="k.value" :value="k.value">
              {{ k.label }}
            </option>
          </select>
        </label>
        <label>
          How many
          <input
            v-model.number="quantity"
            type="number"
            min="1"
            max="9999"
            step="1"
            aria-label="How many to hand out"
          />
        </label>
        <button type="submit">Search</button>
      </form>

      <p v-if="error" role="alert" class="status status-error">{{ error }}</p>
      <p v-if="searching" role="status">Searching…</p>
      <p v-else-if="results && results.length === 0" class="empty">
        Nothing matches that.
      </p>
      <ul v-else-if="results" class="results">
        <li v-for="entry in results" :key="`${entry.packId}/${entry.slug}`">
          <span class="item-name">{{ entry.name }}</span>
          <button type="button" :aria-label="`Give ${entry.name}`" @click="add(entry)">
            Give
          </button>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.loot h3,
.loot h4 {
  margin: var(--space-2) 0 var(--space-1);
}
.to,
.coins label,
.search label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.coins,
.search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.coins input {
  width: 4.5rem;
}
.search input[type='number'] {
  width: 5rem;
}
.results {
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
  max-height: 16rem;
  overflow-y: auto;
}
.results li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.empty {
  color: var(--color-text-muted);
}
button {
  min-height: var(--touch-target-min);
}
</style>
