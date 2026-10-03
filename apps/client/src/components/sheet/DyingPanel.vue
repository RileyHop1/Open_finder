<script setup lang="ts">
/**
 * A prominent override for the dying chain (M5 C.8b), shown right beside the
 * HP controls rather than buried in the full condition list. It only shows
 * once dying, wounded, doomed, unconscious or dead is actually set -- getting
 * the first one is still the dying chain itself (HP damage) or the ordinary
 * add-condition form.
 *
 * An owner or the GM can set a valued slug directly or remove any of the
 * five by hand (reviving a `dead` character included), the same override
 * `ConditionsPanel` already offers every condition, just surfaced here where
 * CLAUDE.md's "every automated result has a GM override path" asks for it to
 * be found.
 *
 * The GM alone can roll a recovery check -- `actor.rollRecovery` already
 * runs it automatically at the start of a dying character's turn; this is
 * the manual re-roll/override on that automated result. Only a dying
 * *character* makes one (`apps/server/src/hitPoints.ts`), never a monster or
 * someone already dead.
 */
import type { Actor } from '@hearthtable/core';
import {
  characterDataSchema,
  dyingStateOf,
  npcDataSchema,
  type AppliedCondition,
} from '@hearthtable/pf2e';
import { computed } from 'vue';

import { describeDyingChain } from './dyingChain.js';
import { titleCase } from './format.js';
import NumberField from './NumberField.vue';

const props = defineProps<{ actor: Actor; editable?: boolean; isGm?: boolean }>();
const emit = defineEmits<{
  set: [slug: string, value: number];
  remove: [slug: string];
  rollRecovery: [];
}>();

const VALUED_SLUGS = ['dying', 'wounded', 'doomed'];
const ALL_SLUGS = [...VALUED_SLUGS, 'unconscious', 'dead'];

const conditions = computed<readonly AppliedCondition[]>(() => {
  const parsed = (
    props.actor.kind === 'npc' ? npcDataSchema : characterDataSchema
  ).safeParse(props.actor.system);
  return parsed.success ? parsed.data.conditions : [];
});

const present = computed(() =>
  conditions.value.filter((c) => ALL_SLUGS.includes(c.slug)),
);

const status = computed(() => describeDyingChain(conditions.value));

const canRollRecovery = computed(
  () =>
    props.isGm === true &&
    props.actor.kind === 'character' &&
    dyingStateOf(conditions.value).dying > 0 &&
    !conditions.value.some((c) => c.slug === 'dead'),
);
</script>

<template>
  <section v-if="status" class="dying-panel" aria-labelledby="dying-heading">
    <h4 id="dying-heading">Dying chain</h4>
    <p class="status">{{ status }}</p>

    <ul v-if="editable" class="dying-list">
      <li v-for="condition in present" :key="condition.slug" class="dying-condition">
        <NumberField
          v-if="condition.value !== undefined"
          :label="`Value of ${titleCase(condition.slug)}`"
          :value="condition.value"
          :min="0"
          :max="99"
          @commit="(n) => emit('set', condition.slug, n)"
        />
        <span v-else class="name">{{ titleCase(condition.slug) }}</span>
        <button
          type="button"
          :aria-label="`Remove ${titleCase(condition.slug)}`"
          @click="emit('remove', condition.slug)"
        >
          Remove
        </button>
      </li>
    </ul>

    <button
      v-if="canRollRecovery"
      type="button"
      class="roll-recovery"
      @click="emit('rollRecovery')"
    >
      Roll recovery check
    </button>
  </section>
</template>

<style scoped>
h4,
p {
  margin: 0;
}

.dying-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-danger);
  border-radius: 4px;
}

.status {
  font-weight: 700;
}

.dying-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.dying-condition {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.name {
  font-weight: 600;
}

.dying-condition button,
.roll-recovery {
  min-height: var(--touch-target-min);
}
</style>
