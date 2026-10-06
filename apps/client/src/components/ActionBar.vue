<script setup lang="ts">
/**
 * The action bar: the selected token's strikes (three MAP variants each,
 * precomputed) and one generic action form, across the bottom of the map
 * (Owlcat-style). Only shown by the parent for a token this seat controls
 * (the GM, any; a player, one they own). Clicking a strike variant rolls it
 * and -- while a combat is active -- spends 1 action. Everything else goes
 * through the generic action (ADR 0023, "calculate, don't enforce"): the
 * player says what they do, picks its cost (only while a combat is active),
 * and may add dice and a situational modifier of their own. Its one button,
 * Spend, also stands in for a bare "spend an action": with no text and no dice
 * it spends the cost and posts nothing. There are no
 * per-action buttons because the system does not try to model every action;
 * the table rules on the rest. Hovering or focusing a strike's attack button highlights its range
 * on the map (never only on hover, so a keyboard user gets it from focus
 * too); losing hover or focus clears it. "Undo" lives on the
 * action tray instead (ADR 0019): it undoes the current turn's whole step,
 * not just something spent from this bar, so it belongs with the acting
 * combatant's own controls rather than whatever token happens to be selected.
 */
import { ref } from 'vue';

import type {
  ActionBarView,
  GenericAction,
  GenericActionCost,
} from './actionBarModel.js';
import RulesTerm from './RulesTerm.vue';
import StatBreakdown from './StatBreakdown.vue';
import { signed } from './sheet/format.js';
import { titleCase } from './sheet/format.js';

defineProps<{
  view: ActionBarView;
  label: string;
  /** Why the last action was not sent (bad dice), shown under the form. */
  error?: string | undefined;
}>();
const emit = defineEmits<{
  strike: [target: { itemId: string } | { strikeKey: string }, attackNumber: 1 | 2 | 3];
  action: [action: GenericAction];
  hoverStrike: [strike: ActionBarView['strikes'][number]];
  unhoverStrike: [];
}>();

const actionText = ref('');
const actionCost = ref<GenericActionCost>(1);
const actionDice = ref('');
const actionModifier = ref<number>();

function submitAction(): void {
  const text = actionText.value.trim();
  emit('action', {
    text,
    cost: actionCost.value,
    dice: actionDice.value.trim(),
    modifier: actionModifier.value ?? 0,
  });
  actionText.value = '';
  actionDice.value = '';
  actionModifier.value = undefined;
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

    <form class="action-form" aria-label="Action" @submit.prevent="submitAction">
      <input
        id="action-text"
        v-model="actionText"
        type="text"
        aria-label="Action"
        placeholder="Action"
      />
      <select v-if="view.canAct" id="action-cost" v-model="actionCost" aria-label="Cost">
        <option value="free">Free</option>
        <option :value="1">◆</option>
        <option :value="2">◆◆</option>
        <option :value="3">◆◆◆</option>
        <option value="reaction">Reaction</option>
      </select>
      <input
        id="action-dice"
        v-model="actionDice"
        type="text"
        autocomplete="off"
        aria-label="Dice"
        placeholder="1d20+7"
      />
      <input
        id="action-modifier"
        v-model.number="actionModifier"
        type="number"
        step="1"
        aria-label="Modifier"
        placeholder="+0"
      />
      <button type="submit">Spend</button>
    </form>
    <p v-if="error" role="alert" class="action-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.action-bar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.strikes {
  display: flex;
  flex-wrap: nowrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}
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
.action-form {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--space-1);
}
.action-error {
  margin: 0;
  color: var(--color-danger);
}
.action-form input[type='number'] {
  width: 5rem;
}
.empty {
  color: var(--color-text-muted);
  margin: 0;
}
</style>
