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
 * too); losing hover or focus clears it. "Undo last action" lives on the
 * action tray instead (ADR 0019): it undoes the current turn's whole step,
 * not just something spent from this bar, so it belongs with the acting
 * combatant's own controls rather than whatever token happens to be selected.
 */
import { ref } from 'vue';

import type { ActionBarView } from './actionBarModel.js';
import RulesTerm from './RulesTerm.vue';
import StatBreakdown from './StatBreakdown.vue';
import { signed } from './sheet/format.js';
import { titleCase } from './sheet/format.js';

defineProps<{
  view: ActionBarView;
  label: string;
  /** Whether this seat is the GM: only the GM gets "Other action". */
  gm: boolean;
}>();
const emit = defineEmits<{
  strike: [target: { itemId: string } | { strikeKey: string }, attackNumber: 1 | 2 | 3];
  basicAction: [slug: string, cost: number];
  freeform: [label: string, cost: number];
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
        <span v-if="strike.traits.length > 0" class="strike-traits">
          <RulesTerm
            v-for="trait in strike.traits"
            :key="trait"
            term-kind="trait"
            :slug="trait"
            :label="titleCase(trait)"
          />
        </span>
        <span
          v-for="attack in strike.attacks"
          :key="attack.attackNumber"
          class="attack"
          @mouseenter="emit('hoverStrike', strike)"
          @mouseleave="emit('unhoverStrike')"
        >
          <StatBreakdown
            :label="`${strike.name} ${attack.label} attack`"
            :statistic="attack.statistic"
            @focusin="emit('hoverStrike', strike)"
            @focusout="emit('unhoverStrike')"
          >
            {{ attack.label }} {{ signed(attack.total) }}
          </StatBreakdown>
          <button
            type="button"
            :aria-label="`Roll ${strike.name} ${attack.label} attack, ${signed(attack.total)}`"
            @click="emit('strike', strike.target, attack.attackNumber)"
            @focus="emit('hoverStrike', strike)"
            @blur="emit('unhoverStrike')"
          >
            Roll
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="empty">No strikes.</p>

    <ul v-if="view.canAct" class="basics">
      <li v-for="basic in view.basics" :key="basic.slug">
        <RulesTerm term-kind="action" :slug="basic.slug" :label="basic.name" />
        <button
          type="button"
          :aria-label="`${basic.name}, ${basic.cost === 0 ? 'free action' : `${basic.cost} action${basic.cost > 1 ? 's' : ''}`}`"
          @click="emit('basicAction', basic.slug, basic.cost)"
        >
          {{ basic.cost === 0 ? 'Free' : '◆'.repeat(basic.cost) }}
        </button>
      </li>
    </ul>

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
.basics li,
.attack {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.strike-name {
  font-weight: 600;
  margin-right: var(--space-1);
}
.strike-traits {
  margin-right: var(--space-1);
  font-size: 0.85em;
  color: var(--color-text-muted);
}
.strike-traits .rules-term {
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
