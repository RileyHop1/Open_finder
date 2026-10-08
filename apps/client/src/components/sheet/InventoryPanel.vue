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
 *
 * A consumable (potion, scroll, wand...) has a **Use** button for an owner or the GM: it
 * asks the server to spend one use (or one of the stack) and post a chat card with the
 * item's text and any dice rolled; what the roll should *do* is the table's call.
 * The purse sits above the items (`CoinsRow.vue`): four denominations, and for an
 * owner or the GM a form to add or spend coins.
 *
 * Price and Bulk (ADR 0021, `docs/inventory.md`) show on every weapon, armor,
 * and gear item -- the only kinds carrying those fields -- and the panel
 * totals carried value and Bulk, reusing `prepareCharacter`'s own
 * `encumbrance` (ADR 0008: Bulk is computed, never stored) rather than
 * re-deriving it here.
 */
import type { Actor } from '@hearthtable/core';
import {
  type CharacterItem,
  characterDataSchema,
  prepareCharacter,
} from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

import { GEAR_KINDS } from './featsModel.js';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';
import { formatItemBulk, formatPrice, formatTotalBulk, titleCase } from './format.js';
import CoinsRow from './CoinsRow.vue';
import GiveMenu from './GiveMenu.vue';
import type { GiveChoice, Recipient } from './giveModel.js';
import NumberField from './NumberField.vue';

const props = defineProps<{
  actor: Actor;
  editable?: boolean;
  /** Who an item or coins can be given to: other characters and the party stash. */
  recipients?: readonly Recipient[] | undefined;
}>();
const emit = defineEmits<{
  add: [packId: string, slug: string];
  equip: [itemId: string, equipped: boolean];
  quantity: [itemId: string, quantity: number];
  remove: [itemId: string];
  /** A signed change to the purse, by denomination (negative spends). */
  coins: [delta: { pp?: number; gp?: number; sp?: number; cp?: number }];
  /** Give an item (or part of a stack) to `to`: a character's id, or `'party'` for the stash. */
  give: [itemId: string, to: string, quantity?: number];
  /** Use a consumable: the server spends one use (or one of the stack) and posts the chat card. */
  use: [itemId: string];
  /** Give coins to `to`. */
  giveCoins: [to: string, coins: { pp?: number; gp?: number; sp?: number; cp?: number }];
}>();

/** The item whose Give form is open: one at a time. */
const giving = ref<string>();

function onGive(itemId: string, choice: GiveChoice): void {
  giving.value = undefined;
  emit('give', itemId, choice.to, choice.quantity);
}

/** The kinds a character can carry, for the picker's filter: feats and spells live on their own tabs. */
const KINDS = GEAR_KINDS;
/** Kinds where "equipped" means something: they are what changes AC, strikes, and bonuses. */
const WORN = new Set(['weapon', 'armor', 'gear']);
const KIND_LABELS: Readonly<Record<string, string>> = { classFeature: 'Class feature' };

const kindLabel = (kind: string): string => KIND_LABELS[kind] ?? titleCase(kind);

/** The consumable part of an item, or `undefined` for anything that is not one (there is no Use button for it). */
function consumableOf(entry: CharacterItem['entry']) {
  return entry.kind === 'gear' ? entry.consumable : undefined;
}

/** Whether a consumable has nothing left to use: a multi-use item at 0 uses. A single-use one is removed when used. */
function spent(entry: CharacterItem['entry']): boolean {
  const uses = consumableOf(entry)?.uses;
  return uses !== undefined && uses.current <= 0;
}

/** `undefined` for any kind without a price field, or one the importer could not read. */
function priceOf(entry: CharacterItem['entry']): number | undefined {
  return entry.kind === 'weapon' || entry.kind === 'armor' || entry.kind === 'gear'
    ? entry.priceInCopper
    : undefined;
}

/** `undefined` for a kind that never carries Bulk (feat, spell, ...); `0` is a real, negligible value, not "none". */
function bulkOf(entry: CharacterItem['entry']): number | undefined {
  return entry.kind === 'weapon' || entry.kind === 'armor' || entry.kind === 'gear'
    ? (entry.bulk ?? 0)
    : undefined;
}

const data = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});

const prepared = computed(() => (data.value ? prepareCharacter(data.value) : undefined));

/** What is carried: weapons, armor, and gear (feats and spells have their own tabs). */
const carried = computed(() =>
  (data.value?.items ?? []).filter((i) => GEAR_KINDS.includes(i.entry.kind)),
);

const inert = computed(() => {
  if (prepared.value === undefined) {
    return new Map<string, number>();
  }
  return new Map(prepared.value.inertItems.map((i) => [i.itemId, i.inertCount]));
});

const encumbrance = computed(() => prepared.value?.encumbrance);

/** Total carried value, summed only across items whose entry has a price at all. */
const totalPriceCopper = computed(() => {
  if (data.value === undefined) {
    return undefined;
  }
  let total: number | undefined;
  for (const item of data.value.items) {
    const price = priceOf(item.entry);
    if (price !== undefined) {
      total = (total ?? 0) + price * item.quantity;
    }
  }
  return total;
});

// --- the picker -----------------------------------------------------------

const query = ref('');
const kind = ref('');
const results = ref<EntrySummary[]>();
const available = ref<boolean>();
const searching = ref(false);
const pickerError = ref<string>();

async function open(event: Event): Promise<void> {
  if (!(event.target as HTMLDetailsElement).open || available.value === true) {
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
    <CoinsRow
      :coins="data.coins"
      :editable="editable"
      :recipients="recipients"
      @adjust="emit('coins', $event)"
      @give="(to, coins) => emit('giveCoins', to, coins)"
    />

    <h4 id="inventory-heading">Items</h4>

    <p v-if="encumbrance" class="totals">
      <span>{{ formatTotalBulk(encumbrance.totalBulk) }} Bulk carried</span>
      <span v-if="totalPriceCopper !== undefined"
        >{{ formatPrice(totalPriceCopper) }} total value</span
      >
    </p>
    <p
      v-if="encumbrance?.isEncumbered"
      class="encumbrance-flag"
      :class="{ 'encumbrance-max': encumbrance.exceedsMax }"
    >
      {{ encumbrance.exceedsMax ? 'Over carrying capacity' : 'Encumbered' }}
      <span class="encumbrance-detail">
        ({{ formatTotalBulk(encumbrance.totalBulk) }} of
        {{ encumbrance.exceedsMax ? encumbrance.maxBulk : encumbrance.encumberedAt }}
        Bulk)
      </span>
    </p>

    <p v-if="carried.length === 0" class="empty">Carrying nothing.</p>
    <ul v-else class="items">
      <li v-for="item in carried" :key="item.id" class="item">
        <span class="item-name">{{ item.entry.name }}</span>
        <span class="item-kind">{{
          consumableOf(item.entry) === undefined
            ? kindLabel(item.entry.kind)
            : titleCase(consumableOf(item.entry)!.category)
        }}</span>
        <span v-if="consumableOf(item.entry)?.uses" class="item-uses">
          {{ consumableOf(item.entry)!.uses!.current }}/{{
            consumableOf(item.entry)!.uses!.max
          }}
          uses
        </span>
        <span v-if="priceOf(item.entry) !== undefined" class="item-price">
          {{ formatPrice(priceOf(item.entry)!) }}
        </span>
        <span v-if="bulkOf(item.entry) !== undefined" class="item-bulk">
          {{ formatItemBulk(bulkOf(item.entry)!) }} Bulk
        </span>
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
            v-if="consumableOf(item.entry) !== undefined"
            type="button"
            :aria-label="`Use ${item.entry.name}`"
            :disabled="spent(item.entry)"
            :title="spent(item.entry) ? 'No uses left' : undefined"
            @click="emit('use', item.id)"
          >
            Use
          </button>
          <button
            v-if="recipients && recipients.length > 0"
            type="button"
            :aria-label="`Give ${item.entry.name}`"
            :aria-expanded="giving === item.id"
            @click="giving = giving === item.id ? undefined : item.id"
          >
            Give…
          </button>
          <button
            type="button"
            :aria-label="`Remove ${item.entry.name}`"
            @click="emit('remove', item.id)"
          >
            Remove
          </button>
          <GiveMenu
            v-if="giving === item.id && recipients"
            :recipients="recipients"
            :max-quantity="item.quantity"
            :label="item.entry.name"
            @give="(choice) => onGive(item.id, choice)"
            @cancel="giving = undefined"
          />
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
        No game content has been imported yet, so there is nothing to browse. The GM can
        import it from the table.
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
.inert-detail,
.item-price,
.item-bulk,
.encumbrance-detail {
  color: var(--color-text-muted);
}

/* Said in words and with a marker, never colour alone. */
.inert-flag {
  padding: 0 var(--space-2);
  border: 1px dashed var(--color-danger);
  border-radius: 4px;
}

.totals {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin: 0;
}

/* Said in words ("Encumbered" / "Over carrying capacity") and with a marker, never colour alone. */
.encumbrance-flag {
  margin: 0;
  padding: 0 var(--space-2);
  border: 1px dashed var(--color-danger);
  border-radius: 4px;
  font-weight: 600;
}

.encumbrance-max {
  border-style: solid;
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
