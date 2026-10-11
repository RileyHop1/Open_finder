<script setup lang="ts">
/**
 * The feats step: the feats the character takes at creation, one picker per
 * open slot (an ancestry feat and a class feat at level 1). Each slot offers
 * the feats of its category that belong to the character's own ancestry or
 * class first, with prerequisites explained rather than hidden. Picks go in
 * `build.feats`; a pick replaces the one before it in the same slot.
 */
import type {
  AncestryEntry,
  BackgroundEntry,
  BuildRef,
  CharacterBuild,
  ClassEntry,
} from '@hearthtable/pf2e';
import { computed } from 'vue';

import FeatSlotPicker from './FeatSlotPicker.vue';
import { creationSlots, slotFilter, trainedSkillsOf } from './featPlan.js';

const props = defineProps<{
  build: CharacterBuild;
  ancestry: AncestryEntry | undefined;
  background: BackgroundEntry | undefined;
  classEntry: ClassEntry | undefined;
}>();
const emit = defineEmits<{
  pick: [slot: string, level: number, ref: BuildRef | undefined];
}>();

const slots = computed(() => creationSlots(props.classEntry));
const trained = computed(() =>
  trainedSkillsOf(props.classEntry, props.background, props.build.trainedSkills),
);
const pickedIn = (slot: string, level: number): BuildRef | undefined =>
  props.build.feats.find((f) => f.slot === slot && f.level === level)?.feat;
</script>

<template>
  <section class="feats-step" aria-labelledby="feats-step-title">
    <h3 id="feats-step-title">Feats</h3>

    <p v-if="ancestry === undefined || classEntry === undefined" class="note">
      Pick your
      {{
        [
          ancestry === undefined ? 'ancestry' : '',
          classEntry === undefined ? 'class' : '',
        ]
          .filter(Boolean)
          .join(' and ')
      }}
      first to see the feats that belong to it. Until then every feat of a kind is listed.
    </p>

    <FeatSlotPicker
      v-for="view in slots"
      :key="`${view.slot}-${view.level}`"
      :view="view"
      :filter="slotFilter(view, ancestry, classEntry)"
      :picked="pickedIn(view.slot, view.level)"
      :trained="trained"
      @pick="(ref) => emit('pick', view.slot, view.level, ref)"
    />
  </section>
</template>

<style scoped>
.feats-step {
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
</style>
