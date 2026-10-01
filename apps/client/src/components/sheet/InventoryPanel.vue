<script setup lang="ts">
/**
 * A character's items: what they carry, whether it is equipped, how many, and
 * (for an owner or the GM) a searchable picker that adds more from the
 * compendium. Like the sheet, it never talks to the server: it emits what the
 * user asked for and `TableView` sends the operation, so the server stays the
 * only thing that copies compendium content onto a character (ADR 0015).
 *
 * An item whose rules we could not automate is flagged "Automation not applied"
 * (ADR 0004: unsupported automation imports inert and visible, never silently
 * dropped), because the GM may need to apply its effect by hand. Equipping is a
 * real choice here: only equipped weapons, armor, and gear affect the numbers.
 */
import type { Actor } from '@hearthtable/core';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';
import { titleCase } from './format.js';
import NumberField from './NumberField.vue';

const props = defineProps<{ actor: Actor; editable?: boolean }>();
const emit = defineEmits<{
  add: [packId: string, slug: string];
  equip: [itemId: string, equipped: boolean];
  quantity: [itemId: string, quantity: number];
  remove: [itemId: string];
}>();

/** The kinds a character can carry, for the picker's filter. */
const KINDS = ['weapon', 'armor', 'gear', 'feat', 'classFeature', 'spell', 'action'];
/** Kinds where "equipped" means something: they are what changes AC, strikes, and bonuses. */
const WORN = new Set(['weapon', 'armor', 'gear']);
const KIND_LABELS: Readonly<Record<string, string>> = { classFeature: 'Class feature' };

const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? titleCase(kind);

const data = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});

const inert = computed(() => {
  if (data.value === undefined) {
    return new Map<string, number>();
  }
  return new Map(
    prepareCharacter(data.value).inertItems.map((i) => [i.itemId, i.inertCount]),
  );
});

// --- the picker -----------------------------------------------------------

const query = ref('');
const kind = ref('');
const results = ref<EntrySummary[]>();
const available = ref<boolean>();
const searching = ref(false);
const pickerError = ref<string>();

async function open(event: Event): Promise<void> {
  if (!(event.target as HTMLDetailsElement).open || available.value !== undefined) {
    return;
  }
  try {
    available.value = await isCompendiumAvailable();
    if (available.value) {
      await search();
    }
  } catch (caught) {
    pickerError.value = caught instanceof Error ? caught.message : 'search failed';
  }
}

async function search(): Promise<void> {
  searching.value = true;
  pickerError.value = undefined;
  try {
    results.value = await searchCompendium({ q: query.value.trim(), kind: kind.value });
  } catch (caught) {
    pickerError.value = caught instanceof Error ? caught.message : 'search failed';
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <section v-if="data" class="inventory" aria-labelledby="inventory-heading">
    <h4 id="inventory-heading">Items</h4>

    <p v-if="data.items.length === 0" class="empty">Carrying nothing.</p>
    <ul v-else class="items">
      <li v-for="item in data.items" :key="item.id" class="item">
        <span class="item-name">{{ item.entry.name }}</span>
        <span class="item-kind">{{ kindLabel(item.entry.kind) }}</span>
        <span v-if="inert.has(item.id)" class="inert-flag">
          Automation not applied
          <span class="inert-detail"
            >({{ inert.get(item.id) }} effect{{ inert.get(item.id) === 1 ? '' : 's' }} to
            apply by hand)</span
          >
        </span>

        <template v-if="editable">
          <label v-if="WORN.has(item.entry.kind)" class="equip">
            <input
              type="checkbox"
              :aria-label="`Equip ${item.entry.name}`"
              :checked="item.equipped"
              @change="
                (e) => emit('equip', item.id, (e.target as HTMLInputElement).checked)
              "
            />
            Equipped
          </label>
          <NumberField
            :label="`Quantity of ${item.entry.name}`"
            :value="item.quantity"
            :min="1"
            :max="9999"
            hide-label
            @commit="(n) => emit('quantity', item.id, n)"
          />
          <button
            type="button"
            :aria-label="`Remove ${item.entry.name}`"
            @click="emit('remove', item.id)"
          >
            Remove
          </button>
        </template>
        <template v-else>
          <span v-if="WORN.has(item.entry.kind)" class="equip-state">
            {{ item.equipped ? 'Equipped' : 'Not equipped' }}
          </span>
          <span v-if="item.quantity > 1" class="quantity">×{{ item.quantity }}</span>
        </template>
      </li>
    </ul>

    <details v-if="editable" class="picker" @toggle="open">
      <summary>Add an item from the compendium</summary>

      <p v-if="available === false" class="empty">
        No content has been imported yet, so there is nothing to browse. The server needs
        the importer run once (see the importer docs).
      </p>
      <template v-else>
        <form class="search" role="search" @submit.prevent="search">
          <label for="compendium-q">Name</label>
          <input id="compendium-q" v-model="query" type="search" autocomplete="off" />
          <label for="compendium-kind">Kind</label>
          <select id="compendium-kind" v-model="kind" @change="search">
            <option value="">Any</option>
            <option v-for="k in KINDS" :key="k" :value="k">{{ kindLabel(k) }}</option>
          </select>
          <button type="submit">Search</button>
        </form>

        <p v-if="pickerError" role="alert" class="status status-error">
          {{ pickerError }}
        </p>
        <p v-if="searching" role="status">Searching…</p>
        <p v-else-if="results && results.length === 0" class="empty">
          Nothing matches that.
        </p>
        <ul v-else-if="results" class="results">
          <li v-for="entry in results" :key="`${entry.packId}/${entry.slug}`">
            <span class="item-name">{{ entry.name }}</span>
            <span class="item-kind">{{ kindLabel(entry.kind) }}</span>
            <button
              type="button"
              :aria-label="`Add ${entry.name}`"
              @click="emit('add', entry.packId, entry.slug)"
            >
              Add
            </button>
          </li>
        </ul>
      </template>
    </details>
  </section>
</template>

<style scoped>
.inventory {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

h4 {
  margin: 0;
}

.items,
.results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.item,
.results li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.item-name {
  font-weight: 600;
}

.item-kind,
.empty,
.equip-state,
.quantity,
.inert-detail {
  color: var(--color-text-muted);
}

/* Said in words and with a marker, never colour alone. */
.inert-flag {
  padding: 0 var(--space-2);
  border: 1px dashed var(--color-danger);
  border-radius: 4px;
}

.item button,
.results button,
.search input,
.search select,
.search button,
.equip {
  min-height: var(--touch-target-min);
}

.equip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}
</style>
