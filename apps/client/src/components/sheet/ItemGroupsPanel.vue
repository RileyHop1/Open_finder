<script setup lang="ts">
/**
 * A tab of grouped, non-gear items: feats and features, or spells. Each name
 * is a `RulesTerm` where the item has a tooltip kind, so its rules text is
 * one hover away (CLAUDE.md "Hover to learn"). An owner or the GM can remove
 * an item and add one from the compendium (limited to `kinds`); adding is an
 * ordinary `actor.addItem`, never gated on prerequisites (ADR 0023: the
 * table rules, the sheet only shows).
 */
import { ref } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';
import RulesTerm from '../RulesTerm.vue';
import { termKindOf } from './featsModel.js';
import type { ItemGroup } from './featsModel.js';

const props = defineProps<{
  title: string;
  groups: readonly ItemGroup[];
  /** Compendium kinds the "add" search may return. */
  kinds: readonly string[];
  emptyText: string;
  editable?: boolean;
}>();
const emit = defineEmits<{
  add: [packId: string, slug: string];
  remove: [itemId: string];
}>();

const query = ref('');
const results = ref<EntrySummary[]>();
const available = ref<boolean>();
const searching = ref(false);
const pickerError = ref<string>();

async function search(): Promise<void> {
  searching.value = true;
  pickerError.value = undefined;
  try {
    const found = await Promise.all(
      props.kinds.map((kind) => searchCompendium({ q: query.value.trim(), kind })),
    );
    results.value = found.flat();
  } catch (caught) {
    pickerError.value = caught instanceof Error ? caught.message : 'search failed';
  } finally {
    searching.value = false;
  }
}

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
</script>

<template>
  <section class="item-groups" :aria-label="title">
    <p v-if="groups.length === 0" class="empty">{{ emptyText }}</p>
    <section v-for="g in groups" :key="g.heading" class="group">
      <h4>{{ g.heading }}</h4>
      <ul>
        <li v-for="item in g.items" :key="item.id">
          <RulesTerm
            v-if="termKindOf(item.entry.kind) !== undefined"
            :term-kind="termKindOf(item.entry.kind)!"
            :slug="item.entry.slug"
            :label="item.entry.name"
          />
          <span v-else>{{ item.entry.name }}</span>
          <span v-if="'level' in item.entry" class="level"
            >Level {{ item.entry.level }}</span
          >
          <button
            v-if="editable"
            type="button"
            :aria-label="`Remove ${item.entry.name}`"
            @click="emit('remove', item.id)"
          >
            Remove
          </button>
        </li>
      </ul>
    </section>

    <details v-if="editable" class="picker" @toggle="open">
      <summary>Add from the compendium</summary>
      <p v-if="available === false" class="empty">
        No game content has been imported yet, so there is nothing to browse.
      </p>
      <template v-else>
        <form class="search" role="search" @submit.prevent="search">
          <label :for="`${title}-q`">Name</label>
          <input :id="`${title}-q`" v-model="query" type="search" autocomplete="off" />
          <button type="submit">Search</button>
        </form>
        <p v-if="pickerError" role="alert">{{ pickerError }}</p>
        <p v-if="searching" role="status">Searching…</p>
        <p v-else-if="results && results.length === 0" class="empty">
          Nothing matches that.
        </p>
        <ul v-else-if="results" class="results">
          <li v-for="entry in results" :key="`${entry.packId}/${entry.slug}`">
            <span>{{ entry.name }}</span>
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
.item-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h4 {
  margin: 0 0 var(--space-1);
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.level,
.empty {
  color: var(--color-text-muted);
}

.search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

button,
.search input {
  min-height: var(--touch-target-min);
}
</style>
