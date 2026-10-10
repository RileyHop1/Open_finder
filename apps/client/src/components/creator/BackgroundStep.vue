<script setup lang="ts">
/**
 * The background step: pick a background and see what it gives before
 * committing -- the attribute boost it offers a choice of, the skill it
 * trains, and the skill feat it grants. A pick is only a choice in the draft;
 * nothing is checked and nothing blocks Next (ADR 0023). Its boosts are
 * applied in the Attributes step and its skill appears on the preview now.
 *
 * Backgrounds are many, so the list has a name search.
 */
import type { BackgroundEntry, BuildRef, CharacterBuild } from '@hearthtable/pf2e';
import { computed, onMounted, ref } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';
import RulesText from '../RulesText.vue';
import RulesTerm from '../RulesTerm.vue';
import { titleCase } from '../sheet/format.js';

const props = defineProps<{
  build: CharacterBuild;
  /** The chosen background's full entry, once loaded. */
  background: BackgroundEntry | undefined;
}>();
const emit = defineEmits<{ pickBackground: [ref: BuildRef | undefined] }>();

const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const available = ref<boolean>();
const query = ref('');
const results = ref<EntrySummary[]>([]);
const searching = ref(false);
const error = ref<string>();

async function search(): Promise<void> {
  searching.value = true;
  try {
    error.value = undefined;
    results.value = await searchCompendium({
      kind: 'background',
      q: query.value.trim(),
      limit: 200,
    });
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : 'could not load the compendium';
  } finally {
    searching.value = false;
  }
}

onMounted(async () => {
  try {
    available.value = await isCompendiumAvailable();
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : 'could not load the compendium';
    return;
  }
  if (available.value) {
    await search();
  }
});

const chosen = (b: EntrySummary): boolean =>
  props.build.background?.packId === b.packId && props.build.background.slug === b.slug;

const boostText = computed(() => {
  const options = props.background?.boostOptions ?? [];
  return `${options.map((o) => ATTRIBUTE_NAMES[o] ?? o).join(' or ')}, plus one free`;
});

/** The feats this background grants, by slug (`grantItem` rule elements). */
const grantedFeats = computed(() =>
  (props.background?.ruleElements ?? []).flatMap((element) =>
    element.kind === 'grantItem' ? [element.slug] : [],
  ),
);
</script>

<template>
  <section class="background-step" aria-labelledby="background-step-title">
    <h3 id="background-step-title">Background</h3>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="available === false" class="note">
      No game content has been imported yet, so there is nothing to choose from. The GM
      can import it from the table, or you can skip this step.
    </p>

    <template v-if="available">
      <form class="search" role="search" @submit.prevent="search">
        <label for="background-q">Search backgrounds</label>
        <input id="background-q" v-model="query" type="search" autocomplete="off" />
        <button type="submit">Search</button>
      </form>

      <p v-if="searching" role="status">Searching…</p>
      <p v-else-if="results.length === 0" class="note">Nothing matches that.</p>
      <fieldset v-else class="list">
        <legend>Choose a background</legend>
        <label v-for="b in results" :key="b.slug" class="row">
          <input
            type="radio"
            name="background"
            :checked="chosen(b)"
            @change="emit('pickBackground', { packId: b.packId, slug: b.slug })"
          />
          {{ b.name }}
        </label>
      </fieldset>
    </template>

    <section v-if="background" class="details" aria-label="What this background gives">
      <h4>{{ background.name }}</h4>
      <dl>
        <dt>Attribute boost</dt>
        <dd>{{ boostText }}</dd>
        <dt>Trained skills</dt>
        <dd>{{ background.trainedSkills.map(titleCase).join(', ') }}</dd>
        <template v-if="grantedFeats.length > 0">
          <dt>Skill feat</dt>
          <dd class="feats">
            <RulesTerm
              v-for="slug in grantedFeats"
              :key="slug"
              term-kind="feat"
              :slug="slug"
              :label="titleCase(slug)"
            />
          </dd>
        </template>
      </dl>
      <div v-if="background.text && background.text.length > 0" class="description">
        <RulesText :nodes="background.text" />
      </div>
    </section>
  </section>
</template>

<style scoped>
.background-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
h4 {
  margin: 0;
}

.search {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.search input,
.search button {
  min-height: var(--touch-target-min);
}

fieldset {
  display: flex;
  flex-direction: column;
  max-height: 18rem;
  margin: 0;
  padding: var(--space-2);
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target-min);
}

/* The chosen row is marked by weight, never colour alone. */
.row:has(input:checked) {
  font-weight: 700;
}

.details {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0 0;
}

dt {
  color: var(--color-text-muted);
}

dd {
  margin: 0;
}

.feats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.note {
  color: var(--color-text-muted);
}
</style>
