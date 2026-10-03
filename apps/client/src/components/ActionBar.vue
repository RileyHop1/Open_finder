<script setup lang="ts">
/**
 * The action bar: the selected token's strikes (three MAP variants each,
 * precomputed) and the basic actions, across the bottom of the map
 * (Owlcat-style). Only shown by the parent for a token this seat controls
 * (the GM, any; a player, one they own). Clicking a strike variant rolls it
 * and -- while a combat is active -- spends 1 action; a basic action only
 * spends, and is hidden with no combatant to spend against. The GM alone
 * gets "Other action", a free-text entry for whatever the table asks for
 * that the system doesn't model, spending its chosen cost and naming it in
 * chat. Hovering or focusing a strike's attack button highlights its range
 * on the map (never only on hover, so a keyboard user gets it from focus
 * too); losing hover or focus clears it.
 */
import { ref } from 'vue';

import type { ActionBarView } from './actionBarModel.js';

defineProps<{
  view: ActionBarView;
  label: string;
  /** Whether this seat is the GM: only the GM gets "Other action". */
  gm: boolean;
  /** Whether this turn has a recorded spend left to undo. */
  canUndo: boolean;
}>();
const emit = defineEmits<{
  strike: [target: { itemId: string } | { strikeKey: string }, attackNumber: 1 | 2 | 3];
  basicAction: [slug: string, cost: number];
  freeform: [label: string, cost: number];
  undo: [];
  hoverStrike: [strike: ActionBarView['strikes'][number]];
  unhoverStrike: [];
}>();

const freeformLabel = ref('');
const freeformCost = ref<1 | 2 | 3>(1);

function submitFreeform(): void {
  const text = freeformLabel.value.trim();
  if (text !== '') {
    emit('freeform', text, freeformCost.value);
    freeformLabel.value = '';
  }
}
</script>

<template>
  <section class="action-bar" :aria-label="`${label}'s actions`">
    <ul v-if="view.strikes.length > 0" class="strikes">
      <li v-for="strike in view.strikes" :key="strike.name">
        <span class="strike-name">{{ strike.name }}</span>
        <button
          v-for="attack in strike.attacks"
          :key="attack.attackNumber"
          type="button"
          :aria-label="`${strike.name} ${attack.label} attack, ${attack.total >= 0 ? '+' : ''}${attack.total}`"
          @click="emit('strike', strike.target, attack.attackNumber)"
          @mouseenter="emit('hoverStrike', strike)"
          @mouseleave="emit('unhoverStrike')"
          @focus="emit('hoverStrike', strike)"
          @blur="emit('unhoverStrike')"
        >
          {{ attack.label }} {{ attack.total >= 0 ? '+' : '' }}{{ attack.total }}
        </button>
      </li>
    </ul>
    <p v-else class="empty">No strikes.</p>

    <ul v-if="view.canAct" class="basics">
      <li v-for="basic in view.basics" :key="basic.slug">
        <button type="button" @click="emit('basicAction', basic.slug, basic.cost)">
          {{ basic.name }} <span aria-hidden="true">{{ '◆'.repeat(basic.cost) }}</span>
        </button>
      </li>
    </ul>

    <button
      v-if="view.canAct && canUndo"
      type="button"
      class="undo"
      @click="emit('undo')"
    >
      Undo last action
    </button>

    <form v-if="gm && view.canAct" class="freeform" @submit.prevent="submitFreeform">
      <label for="freeform-label">Other action</label>
      <input
        id="freeform-label"
        v-model="freeformLabel"
        type="text"
        placeholder="What do they do?"
      />
      <label for="freeform-cost">Cost</label>
      <select id="freeform-cost" v-model.number="freeformCost">
        <option :value="1">◆</option>
        <option :value="2">◆◆</option>
        <option :value="3">◆◆◆</option>
      </select>
      <button type="submit">Spend</button>
    </form>
  </section>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.strikes,
.basics {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}
.strike-name {
  font-weight: 600;
  margin-right: var(--space-1);
}
button {
  min-height: var(--touch-target-min);
}
.freeform {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.empty {
  color: var(--color-text-muted);
  margin: 0;
}
</style>
