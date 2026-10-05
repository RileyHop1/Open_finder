<script setup lang="ts">
/**
 * The Rules drawer (milestone 6's encyclopedia, CLAUDE.md's north star):
 * the reference book's table of contents, and one search box across book
 * pages, compendium entries, and traits. Opened from `TableView`'s "Rules"
 * button or the `?` hotkey -- this component only renders what's inside;
 * the drawer shell, focus handling, and the hotkey all live there, the
 * same split `SceneManager.vue` and the character roster already use.
 *
 * A chosen book page's full text renders inline (`RulesText`) below
 * whatever's showing above it -- it's the long-form content a player
 * reads, not a hover tooltip. A compendium or trait search match instead
 * renders as its own `RulesTerm` chip: reusing the existing hover/focus/tap
 * popover rather than building a second way to show the same text. A
 * compendium match whose `kind` isn't one of the five `TermKind`s
 * `RulesTerm` understands (a weapon, an ancestry, ...) shows as a plain
 * name instead -- there is no tooltip for those yet, and a `RulesTerm` for
 * a kind it can't look up would just read "No details yet" uselessly.
 */
import { BOOK_PAGES, type BookPage } from '@hearthtable/pf2e';
import { TERM_KINDS, type TermKind } from '@hearthtable/core';
import { computed, ref, watch } from 'vue';

import {
  type EntrySummary,
  getCompendiumTraits,
  searchCompendium,
} from '../api/compendium.js';
import RulesText from './RulesText.vue';
import RulesTerm from './RulesTerm.vue';

/** How many matches to show per section -- a drawer, not a full search page. */
const RESULT_LIMIT = 8;

const TERM_KIND_SET: ReadonlySet<string> = new Set(TERM_KINDS);
function isTermKind(kind: string): kind is TermKind {
  return TERM_KIND_SET.has(kind);
}

const query = ref('');
const selectedSlug = ref<string>();
const compendiumResults = ref<EntrySummary[]>([]);
const traitResults = ref<{ readonly slug: string; readonly name: string }[]>([]);
const searching = ref(false);
const searchError = ref<string>();

/** Fetched once, the first time a search needs it -- `traits.json` is one flat list with no per-query route, so there's nothing to ask the server for per keystroke. */
let allTraits: { readonly slug: string; readonly name: string }[] | undefined;

const selectedPage = computed<BookPage | undefined>(() =>
  BOOK_PAGES.find((p) => p.slug === selectedSlug.value),
);

const matchingPages = computed<readonly BookPage[]>(() => {
  const q = query.value.trim().toLowerCase();
  return q === '' ? [] : BOOK_PAGES.filter((p) => p.title.toLowerCase().includes(q));
});

function choosePage(slug: string): void {
  selectedSlug.value = slug;
  query.value = '';
}

async function runSearch(): Promise<void> {
  const q = query.value.trim();
  if (q === '') {
    compendiumResults.value = [];
    traitResults.value = [];
    return;
  }
  searching.value = true;
  searchError.value = undefined;
  try {
    allTraits ??= await getCompendiumTraits();
    const lower = q.toLowerCase();
    traitResults.value = allTraits
      .filter((trait) => trait.name.toLowerCase().includes(lower))
      .slice(0, RESULT_LIMIT);
    compendiumResults.value = await searchCompendium({ q, limit: RESULT_LIMIT });
  } catch (caught) {
    searchError.value = caught instanceof Error ? caught.message : 'search failed';
    compendiumResults.value = [];
    traitResults.value = [];
  } finally {
    searching.value = false;
  }
}

// Clearing the box brings the table of contents straight back -- no stale
// results lingering once there's nothing left to search for.
watch(query, (value) => {
  if (value.trim() === '') {
    compendiumResults.value = [];
    traitResults.value = [];
    searchError.value = undefined;
  }
});
</script>

<template>
  <div class="rules-drawer">
    <form class="search" role="search" @submit.prevent="runSearch">
      <label for="rules-q"
        >Search pages, spells, feats, conditions, actions, and traits</label
      >
      <input id="rules-q" v-model="query" type="search" autocomplete="off" />
      <button type="submit">Search</button>
    </form>

    <nav v-if="query.trim() === ''" aria-label="Table of contents">
      <ul class="toc">
        <li v-for="p in BOOK_PAGES" :key="p.slug">
          <button
            type="button"
            :aria-pressed="p.slug === selectedSlug"
            @click="choosePage(p.slug)"
          >
            {{ p.title }}
          </button>
        </li>
      </ul>
    </nav>

    <template v-else>
      <p v-if="searchError" role="alert" class="status status-error">{{ searchError }}</p>
      <p v-else-if="searching" role="status">Searching…</p>
      <template v-else>
        <p
          v-if="
            matchingPages.length === 0 &&
            compendiumResults.length === 0 &&
            traitResults.length === 0
          "
          class="empty"
        >
          Nothing matches "{{ query }}".
        </p>
        <section v-if="matchingPages.length > 0" aria-labelledby="rules-pages-heading">
          <h3 id="rules-pages-heading">Pages</h3>
          <ul class="result-list">
            <li v-for="p in matchingPages" :key="p.slug">
              <button type="button" @click="choosePage(p.slug)">{{ p.title }}</button>
            </li>
          </ul>
        </section>
        <section
          v-if="compendiumResults.length > 0"
          aria-labelledby="rules-compendium-heading"
        >
          <h3 id="rules-compendium-heading">Compendium</h3>
          <ul class="result-list">
            <li v-for="entry in compendiumResults" :key="`${entry.packId}/${entry.slug}`">
              <RulesTerm
                v-if="isTermKind(entry.kind)"
                :term-kind="entry.kind"
                :slug="entry.slug"
                :label="entry.name"
              />
              <span v-else
                >{{ entry.name }} <span class="muted">({{ entry.kind }})</span></span
              >
            </li>
          </ul>
        </section>
        <section v-if="traitResults.length > 0" aria-labelledby="rules-traits-heading">
          <h3 id="rules-traits-heading">Traits</h3>
          <ul class="result-list">
            <li v-for="trait in traitResults" :key="trait.slug">
              <RulesTerm term-kind="trait" :slug="trait.slug" :label="trait.name" />
            </li>
          </ul>
        </section>
      </template>
    </template>

    <article v-if="selectedPage" class="page-body" :aria-label="selectedPage.title">
      <h3>{{ selectedPage.title }}</h3>
      <RulesText :nodes="selectedPage.text" />
    </article>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.search label {
  flex-basis: 100%;
}
.search input {
  flex: 1;
  min-width: 10rem;
}
.search input,
.search button {
  min-height: var(--touch-target-min);
}

.toc,
.result-list {
  list-style: none;
  margin: 0 0 var(--space-3);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.toc button,
.result-list button {
  min-height: var(--touch-target-min);
  width: 100%;
  text-align: left;
}
.toc button[aria-pressed='true'] {
  font-weight: 600;
}

.muted {
  color: var(--color-text-muted);
}

.empty {
  color: var(--color-text-muted);
}

.page-body {
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-border);
}
.page-body h3 {
  margin-top: 0;
}
</style>
