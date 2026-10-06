<script setup lang="ts">
/**
 * The action tray: the acting combatant's actions as ◆ diamonds and the
 * reaction as ↺, with a short text count so nothing relies on the icon alone.
 * Spending is **warned, never blocked** (docs/action-economy.md): overspending
 * shows "⚠ +1 over" rather than refusing anything. Shown only while a combat
 * is active (the parent's `v-if`); its two buttons only for the combatant's
 * owner or the GM.
 *
 * Actions are spent from the action bar's Spend button, so the tray has no
 * spend of its own. "Reaction" marks the reaction used. "Undo" sends
 * `combat.undo` (ADR 0019): it restores whatever the current turn's most
 * recent step touched, which is also how a wrong spend or reaction is taken
 * back. It is always shown -- there is no client-side check for whether
 * anything is undoable; a refusal shows through the usual `combat.error` line.
 */
import { computed } from 'vue';

import type { ActionTrayView } from './actionTrayModel.js';

const props = defineProps<{
  view: ActionTrayView;
  label: string;
  canControl: boolean;
}>();
const emit = defineEmits<{
  setReaction: [used: boolean];
  undo: [];
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
    <span class="count">
      {{ view.spent }}/{{ view.capacity.total }} actions<template
        v-if="view.capacity.quickenedExtra"
        >, +1 restricted</template
      >
      · reaction {{ view.reactionUsed ? 'used' : 'ready' }}
    </span>
    <span v-if="view.overspent > 0" class="warning" role="status">
      ⚠ +{{ view.overspent }} over
    </span>
    <template v-if="canControl">
      <button
        type="button"
        :disabled="view.reactionUsed"
        @click="emit('setReaction', true)"
      >
        Reaction
      </button>
      <button type="button" @click="emit('undo')">Undo</button>
    </template>
  </section>
</template>

<style scoped>
.action-tray {
  display: flex;
  flex-wrap: nowrap;
  white-space: nowrap;
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
  font-size: 0.85em;
}
.warning {
  font-weight: 700;
}
</style>
