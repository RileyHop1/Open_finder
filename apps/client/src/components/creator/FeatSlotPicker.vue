<script setup lang="ts">
/**
 * One feat slot: the feats the character may take in it, valid ones first,
 * each with its prerequisites in words. The list is the slot's category
 * narrowed to the character's ancestry or class; "Show every ... feat" lifts
 * the narrowing. Nothing is refused (ADR 0023): a feat from outside the
 * narrowed list, or with a prerequisite that reads as unmet, can be taken, and
 * says so.
 */
import type { BuildRef } from '@hearthtable/pf2e';
import { computed, ref, watch } from 'vue';

import { type EntrySummary, searchCompendium } from '../../api/compendium.js';
import { titleCase } from '../sheet/format.js';
import {
  STATUS_ORDER,
  type PrerequisiteStatus,
  type SlotFilter,
  type SlotView,
  featStatus,
  prerequisiteStatus,
} from './featPlan.js';

const props = defineProps<{
  view: SlotView;
  filter: SlotFilter;
  /** The feat chosen for this slot, if any. */
  picked: BuildRef | undefined;
  trained: ReadonlySet<string>;
}>();
const emit = defineEmits<{ pick: [ref: BuildRef | undefined] }>();

const LIMIT = 100;
const query = ref('');
const showAll = ref(false);
const results = ref<EntrySummary[]>([]);
const error = ref<string>();
const chosen = ref<EntrySummary>();

let latest = 0;
async function load(): Promise<void> {
  const mine = ++latest;
  try {
    const found = await searchCompendium({
      kind: 'feat',
      category: props.filter.category,
      maxLevel: props.filter.maxLevel,
      limit: LIMIT,
      ...(query.value === '' ? {} : { q: query.value }),
      ...(showAll.value || props.filter.trait === undefined
        ? {}
        : { trait: props.filter.trait }),
    });
    if (mine === latest) {
      results.value = found;
      error.value = undefined;
    }
  } catch (caught) {
    if (mine === latest) {
      error.value = caught instanceof Error ? caught.message : 'could not load feats';
    }
  }
}

watch(
  () => [
    props.filter.category,
    props.filter.trait,
    props.filter.maxLevel,
    showAll.value,
    query.value,
  ],
  () => void load(),
  { immediate: true },
);

const ordered = computed(() =>
  [...results.value].sort(
    (a, b) =>
      STATUS_ORDER[featStatus(a.prerequisites ?? [], props.trained)] -
        STATUS_ORDER[featStatus(b.prerequisites ?? [], props.trained)] ||
      a.name.localeCompare(b.name),
  ),
);

const isPicked = (e: EntrySummary): boolean =>
  props.picked?.packId === e.packId && props.picked.slug === e.slug;

function choose(e: EntrySummary): void {
  chosen.value = e;
  emit('pick', { packId: e.packId, slug: e.slug });
}

/** What is off about the chosen feat, when it is one this list has seen. */
const notes = computed(() => {
  const feat = chosen.value;
  if (feat === undefined || !isPicked(feat)) {
    return [];
  }
  const out: string[] = [];
  const trait = props.filter.trait;
  if (trait !== undefined && !feat.traits.includes(trait)) {
    out.push(
      `${feat.name} is not a ${titleCase(trait)} feat. It is kept; the GM can rule on it.`,
    );
  }
  if (featStatus(feat.prerequisites ?? [], props.trained) === 'unmet') {
    out.push(
      `${feat.name} has a prerequisite you do not meet yet. It is kept; the GM can rule on it.`,
    );
  }
  return out;
});

const MARK: Readonly<Record<PrerequisiteStatus, string>> = {
  met: '✓ met',
  unmet: '✗ not met',
  unknown: '? check with your GM',
};
</script>

<template>
  <fieldset class="slot">
    <legend>
      {{ view.label }} <span class="level">(level {{ view.level }})</span>
    </legend>

    <p class="current">
      <template v-if="picked">
        Chosen:
        <strong>{{
          chosen && isPicked(chosen) ? chosen.name : titleCase(picked.slug)
        }}</strong>
        <button type="button" class="clear" @click="emit('pick', undefined)">
          Clear
        </button>
      </template>
      <template v-else>Nothing chosen yet.</template>
    </p>

    <div class="controls">
      <label>
        Search {{ view.label.toLowerCase() }}s
        <input v-model="query" type="search" autocomplete="off" />
      </label>
      <label v-if="filter.trait !== undefined" class="all">
        <input v-model="showAll" type="checkbox" />
        Show every {{ filter.category }} feat, not just {{ titleCase(filter.trait) }} ones
      </label>
    </div>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="results.length === 0" class="note">No feats found.</p>
    <p v-if="results.length >= LIMIT" class="note">
      Showing the first {{ LIMIT }}. Search to narrow the list.
    </p>

    <ul v-if="ordered.length > 0" class="feats">
      <li v-for="e in ordered" :key="e.packId + e.slug">
        <label class="feat" :class="{ chosen: isPicked(e) }">
          <input
            type="radio"
            :name="`feat-${view.slot}-${view.level}`"
            :checked="isPicked(e)"
            @change="choose(e)"
          />
          <span class="name">{{ e.name }}</span>
          <span class="meta">Level {{ e.level }}</span>
          <span v-if="(e.prerequisites ?? []).length > 0" class="prereqs">
            Prerequisites:
            <template v-for="(p, i) in e.prerequisites" :key="p">
              {{ i > 0 ? '; ' : '' }}{{ p }} ({{ MARK[prerequisiteStatus(p, trained)] }})
            </template>
          </span>
        </label>
      </li>
    </ul>

    <p v-for="note in notes" :key="note" class="warning" role="note">{{ note }}</p>
  </fieldset>
</template>

<style scoped>
.slot {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.level,
.note,
.meta {
  color: var(--color-text-muted);
  font-weight: 400;
}

.current {
  margin: 0;
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

.controls .all {
  flex-direction: row;
  align-items: center;
  min-height: var(--touch-target-min);
}

input[type='search'],
.clear {
  min-height: var(--touch-target-min);
}

.feats {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 24rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.feat {
  display: grid;
  grid-template-columns: auto 1fr auto;
  column-gap: var(--space-2);
  align-items: start;
  min-height: var(--touch-target-min);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

/* The chosen feat is marked by weight and an outline, never colour alone. */
.feat.chosen {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

.name {
  font-weight: 700;
}

.prereqs {
  grid-column: 2 / -1;
  font-size: 0.85rem;
  font-weight: 400;
  color: var(--color-text-muted);
}

.warning {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  font-weight: 600;
}
</style>
