<script setup lang="ts">
/**
 * The attributes step: where the level 1 boosts go. Each source (ancestry,
 * background, free) is a row of six toggles; the ancestry's fixed boosts and
 * the class's key attribute are shown already on. A table beside them shows
 * every modifier as it would be, live, including a boost that is only a
 * partial one past +4. Nothing is refused (ADR 0023): choosing more or fewer
 * than a source allows, or an attribute the background does not offer, is
 * noted in words and still applied.
 */
import type { Attribute } from '@hearthtable/pf2e';
import { ATTRIBUTES, PARTIAL_BOOST_FROM, applyBoosts } from '@hearthtable/pf2e';
import { computed } from 'vue';

import {
  ATTRIBUTE_NAMES,
  type BoostEntries,
  type BoostPicks,
  type BoostSectionId,
  boostSections,
  composeBoosts,
  keyBoost,
  remaining,
  sectionNotes,
} from './boostPlan.js';

const props = defineProps<{
  entries: BoostEntries;
  picks: BoostPicks;
  keyAttribute: Attribute | undefined;
}>();
const emit = defineEmits<{ toggle: [section: BoostSectionId, attribute: Attribute] }>();

const sections = computed(() => boostSections(props.entries, props.picks));
const key = computed(() => keyBoost(props.entries.class, props.keyAttribute));
const result = computed(() => {
  const { boosts, flaws } = composeBoosts(props.entries, props.picks, props.keyAttribute);
  return applyBoosts(boosts, flaws, 1);
});

const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
</script>

<template>
  <section class="attributes-step" aria-labelledby="attributes-step-title">
    <h3 id="attributes-step-title">Attributes</h3>

    <p
      v-if="entries.ancestry === undefined || entries.background === undefined"
      class="note"
    >
      Pick your
      {{
        [
          entries.ancestry === undefined ? 'ancestry' : '',
          entries.background === undefined ? 'background' : '',
        ]
          .filter(Boolean)
          .join(' and ')
      }}
      to see their boosts here. You can place the free boosts now.
    </p>

    <div class="layout">
      <div class="sections">
        <fieldset v-for="section in sections" :key="section.id" class="section">
          <legend>
            {{ section.label }}
            <span v-if="section.count > 0" class="count">
              {{ section.picked.length }} of {{ section.count }}
              <template v-if="remaining(section) > 0"
                >, {{ remaining(section) }} to choose</template
              >
            </span>
          </legend>
          <div class="buttons">
            <template v-for="a in ATTRIBUTES" :key="a">
              <span v-if="section.fixed.includes(a)" class="fixed">
                {{ ATTRIBUTE_NAMES[a] }} (fixed)
              </span>
              <button
                v-else-if="section.options.includes(a) || section.picked.includes(a)"
                type="button"
                class="toggle"
                :aria-pressed="section.picked.includes(a)"
                @click="emit('toggle', section.id, a)"
              >
                {{ ATTRIBUTE_NAMES[a] }}
              </button>
            </template>
          </div>
          <p
            v-for="note in sectionNotes(section)"
            :key="note"
            class="warning"
            role="note"
          >
            {{ note }}
          </p>
        </fieldset>

        <p v-if="entries.class !== undefined" class="key-note">
          Your class boosts
          <strong>{{ key !== undefined ? ATTRIBUTE_NAMES[key] : '' }}</strong> (its key
          attribute, chosen in the Class step).
        </p>
        <p v-else class="note">Pick a class to add its key attribute boost.</p>
      </div>

      <table class="modifiers">
        <caption>
          Modifiers
        </caption>
        <tbody>
          <tr v-for="a in ATTRIBUTES" :key="a">
            <th scope="row">{{ ATTRIBUTE_NAMES[a] }}</th>
            <td>
              <strong>{{ signed(result.attributes[a]) }}</strong>
              <span v-if="result.partial[a]" class="partial">
                one partial boost toward the next +1
              </span>
              <span
                v-else-if="result.attributes[a] >= PARTIAL_BOOST_FROM"
                class="partial"
              >
                further boosts are partial
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p
      v-for="w in result.warnings.filter((x) => x.kind === 'duplicate-boost')"
      :key="`${w.source}-${w.kind === 'duplicate-boost' ? w.attribute : ''}`"
      class="warning"
      role="note"
    >
      {{ w.kind === 'duplicate-boost' ? ATTRIBUTE_NAMES[w.attribute] : '' }} is boosted
      twice from the same source ({{ w.source }}).
    </p>
  </section>
</template>

<style scoped>
.attributes-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3 {
  margin: 0;
}

.note,
.count {
  color: var(--color-text-muted);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(12rem, 16rem);
  gap: var(--space-3);
  align-items: start;
}

.sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.section {
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.count {
  font-weight: 400;
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.toggle,
.fixed {
  display: inline-flex;
  align-items: center;
  min-height: var(--touch-target-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  color: var(--color-text);
}

/* A boosted attribute is marked by weight, an outline and a check, never colour alone. */
.toggle[aria-pressed='true'] {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

.toggle[aria-pressed='true']::before {
  content: '✓ ';
}

.fixed {
  font-weight: 700;
  border-style: dashed;
}

.fixed::before {
  content: '✓ ';
}

.modifiers {
  border-collapse: collapse;
}

.modifiers th,
.modifiers td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.partial {
  display: block;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.warning {
  margin: var(--space-2) 0 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  font-weight: 600;
}
</style>
