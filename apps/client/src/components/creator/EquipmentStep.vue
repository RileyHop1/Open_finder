<script setup lang="ts">
/**
 * The equipment step: spend the starting purse on gear from the compendium.
 * A list to browse (by kind and name), a shopping list with quantities, and a
 * running total against the purse. Spending more than the purse is a warning,
 * never a block (ADR 0023): the GM may have granted extra funds.
 */
import { computed, onMounted, ref, watch } from 'vue';

import { type EntrySummary, searchCompendium } from '../../api/compendium.js';
import {
  type EquipmentLine,
  STARTING_COPPER,
  changeCopper,
  formatCopper,
  lineCost,
  overBudgetBy,
  totalCost,
  unpriced,
} from './equipmentPlan.js';

const props = defineProps<{ lines: readonly EquipmentLine[] }>();
const emit = defineEmits<{
  add: [item: Omit<EquipmentLine, 'quantity'>];
  quantity: [packId: string, slug: string, quantity: number];
}>();

const KINDS = [
  { id: 'weapon', label: 'Weapons' },
  { id: 'armor', label: 'Armor' },
  { id: 'gear', label: 'Gear' },
] as const;
const LIMIT = 60;

const kind = ref<(typeof KINDS)[number]['id']>('weapon');
const query = ref('');
const results = ref<EntrySummary[]>([]);
const error = ref<string>();

let latest = 0;
async function load(): Promise<void> {
  const mine = ++latest;
  try {
    const found = await searchCompendium({
      kind: kind.value,
      limit: LIMIT,
      ...(query.value === '' ? {} : { q: query.value }),
    });
    if (mine === latest) {
      results.value = found;
      error.value = undefined;
    }
  } catch (caught) {
    if (mine === latest) {
      error.value = caught instanceof Error ? caught.message : 'could not load equipment';
    }
  }
}
onMounted(() => void load());
watch([kind, query], () => void load());

const total = computed(() => totalCost(props.lines));
const over = computed(() => overBudgetBy(props.lines));
const missingPrice = computed(() => unpriced(props.lines));
</script>

<template>
  <section class="equipment-step" aria-labelledby="equipment-step-title">
    <h3 id="equipment-step-title">Equipment</h3>

    <p class="budget" role="status">
      Spent <strong>{{ formatCopper(total) }}</strong> of
      <strong>{{ formatCopper(STARTING_COPPER) }}</strong
      >. You keep <strong>{{ formatCopper(changeCopper(lines)) }}</strong
      >.
    </p>
    <p v-if="over > 0" class="warning" role="note">
      That is {{ formatCopper(over) }} over the starting purse. It is allowed, so check
      with your GM that you were given extra.
    </p>
    <p v-if="missingPrice.length > 0" class="warning" role="note">
      No price is known for {{ missingPrice.map((l) => l.name).join(', ') }}, so the total
      may be low.
    </p>

    <section class="cart" aria-label="Your equipment">
      <h4>Your equipment</h4>
      <p v-if="lines.length === 0" class="note">Nothing bought yet.</p>
      <ul v-else>
        <li v-for="l in lines" :key="l.packId + l.slug">
          <span class="name">{{ l.name }}</span>
          <span class="price">{{ formatCopper(lineCost(l)) }}</span>
          <button
            type="button"
            :aria-label="`One fewer ${l.name}`"
            @click="emit('quantity', l.packId, l.slug, l.quantity - 1)"
          >
            −
          </button>
          <span class="quantity" aria-label="Quantity">{{ l.quantity }}</span>
          <button
            type="button"
            :aria-label="`One more ${l.name}`"
            @click="emit('quantity', l.packId, l.slug, l.quantity + 1)"
          >
            +
          </button>
          <button
            type="button"
            :aria-label="`Remove ${l.name}`"
            @click="emit('quantity', l.packId, l.slug, 0)"
          >
            Remove
          </button>
        </li>
      </ul>
    </section>

    <section class="shop" aria-label="Browse equipment">
      <h4>Browse</h4>
      <div class="controls">
        <div role="group" aria-label="Kind of equipment" class="kinds">
          <button
            v-for="k in KINDS"
            :key="k.id"
            type="button"
            :aria-pressed="kind === k.id"
            @click="kind = k.id"
          >
            {{ k.label }}
          </button>
        </div>
        <label>
          Search
          <input v-model="query" type="search" autocomplete="off" />
        </label>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-else-if="results.length === 0" class="note">Nothing found.</p>
      <p v-if="results.length >= LIMIT" class="note">
        Showing the first {{ LIMIT }}. Search to narrow the list.
      </p>
      <ul v-if="results.length > 0" class="results">
        <li v-for="e in results" :key="e.packId + e.slug">
          <span class="name">{{ e.name }}</span>
          <span class="price">{{
            e.priceInCopper === undefined
              ? 'price unknown'
              : formatCopper(e.priceInCopper)
          }}</span>
          <button
            type="button"
            :aria-label="`Add ${e.name}`"
            @click="
              emit('add', {
                packId: e.packId,
                slug: e.slug,
                name: e.name,
                ...(e.priceInCopper === undefined
                  ? {}
                  : { priceInCopper: e.priceInCopper }),
              })
            "
          >
            Add
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.equipment-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
h4 {
  margin: 0;
}

.note {
  color: var(--color-text-muted);
}

.budget {
  margin: 0;
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.results {
  max-height: 22rem;
  overflow-y: auto;
}

li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

.name {
  flex: 1 1 auto;
  font-weight: 700;
}

.price {
  color: var(--color-text-muted);
}

.quantity {
  min-width: 2ch;
  text-align: center;
}

button,
input[type='search'] {
  min-height: var(--touch-target-min);
  min-width: var(--touch-target-min);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-3);
}

.controls label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.kinds {
  display: flex;
  gap: var(--space-1);
}

/* The chosen kind is marked by weight and an outline, never colour alone. */
.kinds button[aria-pressed='true'] {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

.warning {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  font-weight: 600;
}
</style>
