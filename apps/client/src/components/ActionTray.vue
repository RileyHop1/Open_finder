<script setup lang="ts">
/**
 * The action tray: the acting combatant's actions as ◆ diamonds and the
 * reaction as ↺, both with a text label so nothing relies on the icon alone.
 * Spending is **warned, never blocked** (docs/action-economy.md): overspending
 * shows an inline warning in text and an icon rather than refusing the click.
 * Shown only while a combat is active (the parent's `v-if`); control buttons
 * only for the combatant's owner or the GM.
 */
import { computed } from 'vue';

import type { ActionTrayView } from './actionTrayModel.js';

const props = defineProps<{
  view: ActionTrayView;
  label: string;
  canControl: boolean;
}>();
const emit = defineEmits<{
  spend: [actions: number];
  setReaction: [used: boolean];
}>();

const diamonds = computed<boolean[]>(() =>
  Array.from({ length: props.view.capacity.total }, (_, i) => i < props.view.spent),
);
</script>

<template>
  <section class="action-tray" :aria-label="`${label}'s action tray`">
    <span class="actions" aria-hidden="true">
      <span v-for="(used, i) in diamonds" :key="i" class="diamond" :class="{ used }"
        >◆</span
      >
      <span v-if="view.capacity.quickenedExtra" class="restricted">◆</span>
      <span class="reaction" :class="{ used: view.reactionUsed }">↺</span>
    </span>
    <p class="count">
      {{ view.spent }} of {{ view.capacity.total }} action{{
        view.capacity.total === 1 ? '' : 's'
      }}
      spent<template v-if="view.capacity.quickenedExtra">, plus a restricted one</template
      >.
      {{ view.reactionUsed ? 'Reaction used.' : 'Reaction available.' }}
    </p>
    <p v-if="view.overspent > 0" class="warning" role="status">
      ⚠ {{ view.overspent }} action{{ view.overspent === 1 ? '' : 's' }} over.
    </p>
    <template v-if="canControl">
      <button type="button" @click="emit('spend', 1)">Spend an action</button>
      <button type="button" :disabled="view.spent <= 0" @click="emit('spend', -1)">
        Undo an action
      </button>
      <button
        type="button"
        :disabled="view.reactionUsed"
        @click="emit('setReaction', true)"
      >
        Spend reaction
      </button>
      <button
        type="button"
        :disabled="!view.reactionUsed"
        @click="emit('setReaction', false)"
      >
        Give back reaction
      </button>
    </template>
  </section>
</template>

<style scoped>
.action-tray {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
}
.actions {
  display: inline-flex;
  gap: 0.15em;
  font-size: 1.25rem;
}
.diamond {
  opacity: 0.35;
}
.diamond.used {
  opacity: 1;
}
.restricted {
  opacity: 0.6;
  font-style: italic;
}
.reaction {
  margin-left: 0.5em;
  opacity: 0.35;
}
.reaction.used {
  opacity: 1;
}
.count,
.warning {
  margin: 0;
  font-size: 0.85em;
}
.warning {
  font-weight: 700;
}
</style>
