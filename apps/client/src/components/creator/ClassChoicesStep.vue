<script setup lang="ts">
/**
 * The class choices step: the picks a class asks for at level 1 (a Barbarian's
 * instinct, a Rogue's racket, a Ranger's Hunter's Edge, an Investigator's
 * methodology...). Each is a group of options with what it gives shown before
 * committing. Nothing is refused (ADR 0023): a choice left open is only
 * flagged, and a choice this app cannot offer yet is listed so the table can
 * settle it by hand.
 */
import type { CharacterBuild, ClassEntry, ClassFeatureEntry } from '@hearthtable/pf2e';
import { computed } from 'vue';

import RulesText from '../RulesText.vue';
import { choicesDue } from './classChoices.js';

const props = defineProps<{
  build: CharacterBuild;
  classEntry: ClassEntry | undefined;
  /** The class's level 1 features, once loaded; `undefined` while loading. */
  features: readonly ClassFeatureEntry[] | undefined;
}>();
const emit = defineEmits<{ pick: [choice: string, value: string] }>();

const due = computed(() => choicesDue(props.features ?? [], props.build.classChoices));
const loading = computed(
  () => props.build.class !== undefined && props.features === undefined,
);
</script>

<template>
  <section class="class-choices" aria-labelledby="class-choices-title">
    <h3 id="class-choices-title">Class choices</h3>

    <p v-if="build.class === undefined" class="note">
      Pick a class first; its choices appear here.
    </p>
    <p v-else-if="loading" class="note" role="status">Loading the class's choices…</p>
    <p v-else-if="due.choices.length === 0 && due.unautomated.length === 0" class="note">
      {{ classEntry?.name ?? 'This class' }} has no choices to make at level 1.
    </p>

    <fieldset v-for="c in due.choices" :key="c.element.rollOptionPrefix" class="choice">
      <legend>
        {{ c.element.prompt }}
        <span v-if="c.chosen === undefined" class="open">(not chosen yet)</span>
      </legend>
      <label
        v-for="o in c.options"
        :key="o.value"
        class="option"
        :class="{ chosen: c.chosen === o.value }"
      >
        <input
          type="radio"
          :name="`choice-${c.element.rollOptionPrefix}`"
          :checked="c.chosen === o.value"
          @change="emit('pick', c.element.rollOptionPrefix, o.value)"
        />
        <span class="label">{{ o.label }}</span>
        <span v-if="o.feature?.text && o.feature.text.length > 0" class="text">
          <RulesText :nodes="o.feature.text" />
        </span>
      </label>
      <p
        v-if="c.chosen !== undefined && !c.options.some((o) => o.value === c.chosen)"
        class="warning"
        role="note"
      >
        {{ c.chosen }} is not one of the options this class offers. It is kept, and the GM
        can rule on it.
      </p>
    </fieldset>

    <p v-if="due.unautomated.length > 0" class="warning" role="note">
      {{ due.unautomated.join(', ') }}
      {{ due.unautomated.length === 1 ? 'asks' : 'ask' }} for a choice this app cannot
      offer yet. Note it down and settle it with your GM.
    </p>
  </section>
</template>

<style scoped>
.class-choices {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3 {
  margin: 0;
}

.note {
  color: var(--color-text-muted);
}

.choice {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.open {
  color: var(--color-text-muted);
  font-weight: 400;
}

.option {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: var(--space-2);
  align-items: start;
  min-height: var(--touch-target-min);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

/* The chosen option is marked by weight and an outline, never colour alone. */
.option.chosen {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

.label {
  font-weight: 700;
}

.text {
  grid-column: 2;
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
