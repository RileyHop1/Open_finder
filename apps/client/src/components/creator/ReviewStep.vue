<script setup lang="ts">
/**
 * The review step: the whole character in words, every warning the rules
 * raised, and the button that creates it. Nothing here blocks creating
 * (ADR 0023): warnings are for reading, and every number can still be changed
 * on the sheet afterwards.
 */
import type { Attribute, DeriveWarning } from '@hearthtable/pf2e';
import { ATTRIBUTES } from '@hearthtable/pf2e';
import { computed } from 'vue';

import type { Actor } from '@hearthtable/core';
import { titleCase } from '../sheet/format.js';
import { ATTRIBUTE_NAMES } from './boostPlan.js';
import type { CreatorDraft } from './creatorModel.js';
import { formatCopper, totalCost } from './equipmentPlan.js';
import { warningLines } from './reviewModel.js';

const props = defineProps<{
  draft: CreatorDraft;
  warnings: readonly DeriveWarning[];
  /** The previewed character, for its derived attribute modifiers. */
  actor: Actor;
  /** The names of the picked entries, once loaded. */
  names: {
    ancestry?: string | undefined;
    heritage?: string | undefined;
    background?: string | undefined;
    class?: string | undefined;
  };
  creating: boolean;
  /** Why the last attempt failed, in words. */
  failure: string | undefined;
}>();
const emit = defineEmits<{ create: [] }>();

const pickedName = (
  ref: { slug: string } | undefined,
  name: string | undefined,
): string => (ref === undefined ? 'Not chosen yet' : (name ?? titleCase(ref.slug)));

const lines = computed(() => [
  ['Ancestry', pickedName(props.draft.build.ancestry, props.names.ancestry)],
  ['Heritage', pickedName(props.draft.build.heritage, props.names.heritage)],
  ['Background', pickedName(props.draft.build.background, props.names.background)],
  ['Class', pickedName(props.draft.build.class, props.names.class)],
]);

const attributes = computed(() => {
  const sheet = props.actor.system as { attributes?: Partial<Record<Attribute, number>> };
  return ATTRIBUTES.map((a) => {
    const value = sheet.attributes?.[a] ?? 0;
    return `${ATTRIBUTE_NAMES[a]} ${value >= 0 ? '+' : ''}${value}`;
  });
});

const feats = computed(() =>
  props.draft.build.feats.map((f) => `${titleCase(f.slot)}: ${titleCase(f.feat.slug)}`),
);
const choices = computed(() =>
  Object.entries(props.draft.build.classChoices).map(
    ([choice, value]) => `${titleCase(choice)}: ${titleCase(value)}`,
  ),
);
const skills = computed(() => props.draft.build.trainedSkills.map(titleCase));
const gear = computed(() =>
  props.draft.equipment.map((l) => `${l.name}${l.quantity > 1 ? ` ×${l.quantity}` : ''}`),
);
const notes = computed(() => warningLines(props.warnings));
</script>

<template>
  <section class="review-step" aria-labelledby="review-step-title">
    <h3 id="review-step-title">Review</h3>

    <p v-if="draft.name.trim() === ''" class="warning" role="note">
      The character has no name yet. It will be called “New character”; you can rename it
      on the sheet.
    </p>

    <dl class="summary">
      <template v-for="[label, value] in lines" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </template>
      <dt>Attributes</dt>
      <dd>{{ attributes.join(', ') }}</dd>
      <dt>Class choices</dt>
      <dd>{{ choices.length > 0 ? choices.join('; ') : 'None' }}</dd>
      <dt>Extra trained skills</dt>
      <dd>{{ skills.length > 0 ? skills.join(', ') : 'None' }}</dd>
      <dt>Feats</dt>
      <dd>{{ feats.length > 0 ? feats.join('; ') : 'None' }}</dd>
      <dt>Equipment</dt>
      <dd>
        {{ gear.length > 0 ? gear.join(', ') : 'None' }}
        <template v-if="draft.equipment.length > 0">
          (spent {{ formatCopper(totalCost(draft.equipment)) }})
        </template>
      </dd>
    </dl>

    <section v-if="notes.length > 0" class="notes" aria-label="Things to check">
      <h4>Things to check</h4>
      <p class="hint">
        None of these stop you. The GM can rule on any of them, and every number can be
        changed on the sheet.
      </p>
      <ul>
        <li v-for="n in notes" :key="n">{{ n }}</li>
      </ul>
    </section>

    <p v-if="failure" class="warning" role="alert">{{ failure }}</p>

    <button type="button" class="create" :disabled="creating" @click="emit('create')">
      {{ creating ? 'Creating…' : 'Create character' }}
    </button>
  </section>
</template>

<style scoped>
.review-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
h4 {
  margin: 0;
}

.summary {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: 0;
}

.summary dt {
  font-weight: 700;
}

.summary dd {
  margin: 0;
}

.hint {
  margin: 0;
  color: var(--color-text-muted);
}

.notes ul {
  margin: var(--space-1) 0 0;
  padding-left: var(--space-4);
}

.create {
  align-self: flex-start;
  min-height: var(--touch-target-min);
  padding: 0 var(--space-4);
  font-weight: 700;
}

.warning {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  font-weight: 600;
}
</style>
