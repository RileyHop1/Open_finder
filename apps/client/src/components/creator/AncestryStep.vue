<script setup lang="ts">
/**
 * The ancestry step: pick an ancestry, see what it gives (Hit Points, size,
 * speed, boosts, languages, traits), then pick a heritage, this ancestry's own
 * first and the versatile ones after. A pick is only a choice in the draft;
 * nothing is checked and nothing blocks Next (ADR 0023). The numbers an
 * ancestry's boosts add arrive in the Attributes step.
 *
 * It lists from the compendium. With nothing imported yet it says so, and the
 * step can still be skipped.
 */
import type { AncestryEntry, BuildRef, CharacterBuild } from '@hearthtable/pf2e';
import { computed, onMounted, ref, watch } from 'vue';

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
  /** The chosen ancestry's full entry, once loaded. */
  ancestry: AncestryEntry | undefined;
}>();
const emit = defineEmits<{
  pickAncestry: [ref: BuildRef | undefined];
  pickHeritage: [ref: BuildRef | undefined];
}>();

const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const available = ref<boolean>();
const ancestries = ref<EntrySummary[]>([]);
const ownHeritages = ref<EntrySummary[]>([]);
const versatileHeritages = ref<EntrySummary[]>([]);
const error = ref<string>();

const same = (a: BuildRef | undefined, b: EntrySummary): boolean =>
  a !== undefined && a.packId === b.packId && a.slug === b.slug;

async function load<T>(work: () => Promise<T>): Promise<T | undefined> {
  try {
    error.value = undefined;
    return await work();
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : 'could not load the compendium';
    return undefined;
  }
}

onMounted(async () => {
  available.value = await load(isCompendiumAvailable);
  if (available.value === true) {
    ancestries.value =
      (await load(() => searchCompendium({ kind: 'ancestry', limit: 200 }))) ?? [];
    versatileHeritages.value = (
      (await load(() => searchCompendium({ kind: 'heritage', limit: 200 }))) ?? []
    ).filter((h) => h.ancestrySlug === undefined);
  }
});

watch(
  () => props.build.ancestry?.slug,
  async (slug) => {
    ownHeritages.value =
      slug === undefined
        ? []
        : ((await load(() =>
            searchCompendium({ kind: 'heritage', ancestrySlug: slug, limit: 200 }),
          )) ?? []);
  },
  { immediate: true },
);

const boostsText = computed(() => {
  const a = props.ancestry;
  if (a === undefined) {
    return '';
  }
  const fixed = a.boosts.map((b) => ATTRIBUTE_NAMES[b] ?? b);
  const free = a.freeBoosts > 0 ? [`${a.freeBoosts} free`] : [];
  return [...fixed, ...free].join(', ');
});

const initial = (name: string): string => name.slice(0, 1).toUpperCase();
</script>

<template>
  <section class="ancestry-step" aria-labelledby="ancestry-step-title">
    <h3 id="ancestry-step-title">Ancestry</h3>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="available === false" class="note">
      No game content has been imported yet, so there is nothing to choose from. The GM
      can import it from the table, or you can skip this step.
    </p>

    <fieldset v-if="ancestries.length > 0" class="cards">
      <legend>Choose an ancestry</legend>
      <label v-for="a in ancestries" :key="a.slug" class="card">
        <input
          type="radio"
          name="ancestry"
          :checked="same(build.ancestry, a)"
          @change="emit('pickAncestry', { packId: a.packId, slug: a.slug })"
        />
        <span class="art" aria-hidden="true">{{ initial(a.name) }}</span>
        <span class="name">{{ a.name }}</span>
      </label>
    </fieldset>

    <section v-if="ancestry" class="details" aria-label="What this ancestry gives">
      <h4>{{ ancestry.name }}</h4>
      <dl>
        <dt>Hit Points</dt>
        <dd>{{ ancestry.hp }}</dd>
        <dt>Size</dt>
        <dd>{{ titleCase(ancestry.size) }}</dd>
        <dt>Speed</dt>
        <dd>{{ ancestry.speed }} feet</dd>
        <dt>Attribute boosts</dt>
        <dd>{{ boostsText || 'None' }}</dd>
        <template v-if="ancestry.flaws.length > 0">
          <dt>Attribute flaws</dt>
          <dd>{{ ancestry.flaws.map((f) => ATTRIBUTE_NAMES[f] ?? f).join(', ') }}</dd>
        </template>
        <template v-if="ancestry.languages.length > 0">
          <dt>Languages</dt>
          <dd>{{ ancestry.languages.map(titleCase).join(', ') }}</dd>
        </template>
        <template v-if="ancestry.traits.length > 0">
          <dt>Traits</dt>
          <dd class="traits">
            <RulesTerm
              v-for="trait in ancestry.traits"
              :key="trait"
              term-kind="trait"
              :slug="trait"
              :label="titleCase(trait)"
            />
          </dd>
        </template>
      </dl>
      <div v-if="ancestry.text && ancestry.text.length > 0" class="description">
        <RulesText :nodes="ancestry.text" />
      </div>
    </section>

    <fieldset
      v-if="build.ancestry && (ownHeritages.length > 0 || versatileHeritages.length > 0)"
    >
      <legend>Choose a heritage</legend>
      <label v-for="h in ownHeritages" :key="h.slug" class="row">
        <input
          type="radio"
          name="heritage"
          :checked="same(build.heritage, h)"
          @change="emit('pickHeritage', { packId: h.packId, slug: h.slug })"
        />
        {{ h.name }}
      </label>
      <details v-if="versatileHeritages.length > 0" class="versatile">
        <summary>Versatile heritages</summary>
        <label v-for="h in versatileHeritages" :key="h.slug" class="row">
          <input
            type="radio"
            name="heritage"
            :checked="same(build.heritage, h)"
            @change="emit('pickHeritage', { packId: h.packId, slug: h.slug })"
          />
          {{ h.name }}
        </label>
      </details>
    </fieldset>
  </section>
</template>

<style scoped>
.ancestry-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
h4 {
  margin: 0;
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
}

.cards legend {
  grid-column: 1 / -1;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--touch-target-min);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

/* The chosen card is marked by weight and an outline, never colour alone. */
.card:has(input:checked) {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

/* An art slot: the ancestry's initial until real art is wired in. */
.art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  font-size: 1.5rem;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target-min);
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

.traits {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.note {
  color: var(--color-text-muted);
}
</style>
