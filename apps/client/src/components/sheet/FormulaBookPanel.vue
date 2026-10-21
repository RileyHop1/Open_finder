<script setup lang="ts">
/**
 * A character's formula book (`docs/class-resources.md`): the alchemical items it knows
 * how to make, by level, with Remove, and a search to add more. For an Alchemist it
 * counts the book against the PF2e system's `formulaBookSize` (8 at level 1, 2 more each
 * level), as a guide, never a limit (ADR 0023): a formula above the character's level
 * can still be added, with a note. The whole list is saved with `actor.update`
 * (`system.formulas`); the search finds alchemical items in the compendium.
 */
import type { Actor } from '@hearthtable/core';
import { characterDataSchema, formulaBookSize, type Formula } from '@hearthtable/pf2e';
import { computed, ref, useId } from 'vue';

import { type EntrySummary, searchCompendium } from '../../api/compendium.js';

const props = defineProps<{ actor: Actor; editable: boolean }>();
const emit = defineEmits<{ change: [changes: Record<string, unknown>] }>();

const id = useId();
const data = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});
const formulas = computed(() =>
  [...(data.value?.formulas ?? [])].sort(
    (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name),
  ),
);
const size = computed(() =>
  data.value === undefined ? undefined : formulaBookSize(data.value),
);
const level = computed(() => data.value?.level ?? 1);
const visible = computed(() => size.value !== undefined || formulas.value.length > 0);

const key = (f: { source: { packId: string; slug: string } }) =>
  `${f.source.packId}/${f.source.slug}`;
const known = computed(() => new Set(formulas.value.map(key)));

function save(next: readonly Formula[]): void {
  emit('change', { 'system.formulas': next });
}

function remove(formula: Formula): void {
  save((data.value?.formulas ?? []).filter((f) => key(f) !== key(formula)));
}

function add(summary: EntrySummary): void {
  const formula: Formula = {
    source: { packId: summary.packId, slug: summary.slug },
    name: summary.name,
    ...(summary.level === undefined ? {} : { level: summary.level }),
  };
  if (!known.value.has(key(formula))) {
    save([...(data.value?.formulas ?? []), formula]);
  }
}

const query = ref('');
const results = ref<EntrySummary[]>([]);
const searching = ref(false);
const searchError = ref<string>();

async function search(): Promise<void> {
  searching.value = true;
  searchError.value = undefined;
  try {
    results.value = await searchCompendium({
      q: query.value.trim(),
      trait: 'alchemical',
      limit: 50,
    });
  } catch (caught) {
    searchError.value = caught instanceof Error ? caught.message : 'search failed';
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <section v-if="visible" class="formula-book" :aria-labelledby="`${id}-title`">
    <h4 :id="`${id}-title`">Formula book</h4>
    <p v-if="size !== undefined" class="count" :class="{ over: formulas.length > size }">
      {{ formulas.length }} of {{ size }} formulas{{
        formulas.length > size
          ? ` (${formulas.length - size} more than you start with)`
          : ''
      }}. You start with 8 (4 from Alchemical Crafting, 2 from your research field, 2 of
      your own) and add 2 each level.
    </p>

    <p v-if="formulas.length === 0" class="note">No formulas yet.</p>
    <ul v-else>
      <li v-for="formula in formulas" :key="key(formula)">
        <span class="name">{{ formula.name }}</span>
        <span v-if="formula.level !== undefined" class="level">
          level {{ formula.level }}
        </span>
        <button
          v-if="editable"
          type="button"
          :aria-label="`Remove the formula for ${formula.name}`"
          @click="remove(formula)"
        >
          Remove
        </button>
      </li>
    </ul>

    <form v-if="editable" class="add" role="search" @submit.prevent="search">
      <label :for="`${id}-query`">Add a formula</label>
      <input
        :id="`${id}-query`"
        v-model="query"
        type="search"
        placeholder="Alchemical item name"
      />
      <button type="submit" :disabled="searching">Search</button>
    </form>
    <p v-if="searchError" role="alert">{{ searchError }}</p>
    <ul
      v-if="editable && results.length > 0"
      class="results"
      aria-label="Alchemical items"
    >
      <li v-for="item in results" :key="key({ source: item })">
        <span class="name">{{ item.name }}</span>
        <span v-if="item.level !== undefined" class="level">level {{ item.level }}</span>
        <span
          v-if="item.level !== undefined && item.level > level"
          class="warning"
          role="note"
        >
          above your level; check with your GM
        </span>
        <button
          type="button"
          :disabled="known.has(key({ source: item }))"
          :aria-label="`Add the formula for ${item.name}`"
          @click="add(item)"
        >
          {{ known.has(key({ source: item })) ? 'In your book' : 'Add' }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.formula-book {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

h4,
p {
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

li,
.add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.level,
.note {
  color: var(--color-text-muted);
}

.count.over,
.warning {
  font-weight: bold;
}

button,
input {
  min-height: var(--touch-target-min);
}
</style>
