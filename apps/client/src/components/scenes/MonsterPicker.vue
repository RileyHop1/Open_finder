<script setup lang="ts">
/**
 * The GM's way to bring a monster to the table: search the imported creatures
 * (Monster Core) by name and press "Add to map". It only asks: it emits the
 * entry's `packId` and `slug`, and `TableView` has the server make the actor
 * from its own compendium copy and then places its token, so a client never
 * supplies a monster's stats (ADR 0015).
 *
 * With nothing imported yet it says so in words rather than showing an empty
 * list, and with no scene to put the token on the buttons are off and say why.
 */
import { ref } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';

defineProps<{
  /** Whether there is a scene to place the monster on. */
  canPlace: boolean;
}>();
const emit = defineEmits<{ add: [packId: string, slug: string] }>();

/** How many matches to list: a name search narrows it, and the list never needs to scroll. */
const LIMIT = 12;

const query = ref('');
const results = ref<EntrySummary[]>();
const available = ref<boolean>();
const searching = ref(false);
const error = ref<string>();

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
    error.value = caught instanceof Error ? caught.message : 'search failed';
  }
}

async function search(): Promise<void> {
  searching.value = true;
  error.value = undefined;
  try {
    results.value = await searchCompendium({
      q: query.value.trim(),
      kind: 'creature',
      limit: LIMIT,
    });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'search failed';
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <details class="monster-picker" @toggle="open">
    <summary>Add a monster</summary>

    <p v-if="available === false" class="empty">
      No game content has been imported yet, so there are no monsters to browse. Use
      "Import game content" at the top of the table.
    </p>
    <template v-else>
      <p v-if="!canPlace" class="empty">
        Make a scene and move the party to it (the Scenes button) to add monsters.
      </p>
      <form class="search" role="search" @submit.prevent="search">
        <label for="monster-q">Monster name</label>
        <input id="monster-q" v-model="query" type="search" autocomplete="off" />
        <button type="submit">Search</button>
      </form>

      <p v-if="error" role="alert" class="status status-error">{{ error }}</p>
      <p v-if="searching" role="status">Searching…</p>
      <p v-else-if="results && results.length === 0" class="empty">
        No monster matches that.
      </p>
      <ul v-else-if="results" class="results">
        <li v-for="entry in results" :key="`${entry.packId}/${entry.slug}`">
          <span class="name">{{ entry.name }}</span>
          <span class="traits">{{ entry.traits.slice(0, 4).join(', ') }}</span>
          <button
            type="button"
            :disabled="!canPlace"
            :aria-label="`Add ${entry.name} to the map`"
            @click="emit('add', entry.packId, entry.slug)"
          >
            Add to map
          </button>
        </li>
      </ul>
    </template>
  </details>
</template>

<style scoped>
.monster-picker {
  margin: var(--space-3) 0;
}

summary {
  min-height: var(--touch-target-min);
  cursor: pointer;
}

.search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.results {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.results li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.name {
  font-weight: 600;
}

.traits,
.empty {
  color: var(--color-text-muted);
}

.results button,
.search input,
.search button {
  min-height: var(--touch-target-min);
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
