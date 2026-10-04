<script setup lang="ts">
/**
 * A roll made from a character sheet, as a chat card: a sheet check
 * (`check`), a strike's attack (`strikeAttack`), or its damage
 * (`strikeDamage`). The message stores the roll *and* the statistic it was
 * made with, so the "Breakdown" disclosure below is a view over what was
 * actually rolled -- every modifier, and for a suppressed one, that it did not
 * apply -- rather than a recomputation that could disagree. It is a
 * `<details>`, reachable by keyboard and tap; the hover version of this is
 * milestone 6. Degrees are written out in words, never colour alone.
 */
import type {
  ChatCheckMessage,
  ChatStrikeAttackMessage,
  ChatStrikeDamageMessage,
} from '@hearthtable/core';
import { computed, ref } from 'vue';

import { signed, titleCase } from './sheet/format.js';
import { useChatStore } from '../stores/chat.js';

const props = defineProps<{
  message: ChatCheckMessage | ChatStrikeAttackMessage | ChatStrikeDamageMessage;
  /** The sending seat's name. */
  sender: string;
  /** Whether this browser's seat is the GM, who alone may edit a roll's total. */
  isGm: boolean;
}>();

const chatStore = useChatStore();
const editing = ref(false);
const draftTotal = ref('');

function startEditing(): void {
  draftTotal.value = String(props.message.gmTotal ?? props.message.roll.total);
  editing.value = true;
}

async function submitEdit(): Promise<void> {
  const total = Number.parseInt(draftTotal.value, 10);
  if (Number.isNaN(total)) {
    return;
  }
  editing.value = false;
  await chatStore.adjustRoll(props.message.id, total);
}

const DEGREE_LABELS: Readonly<Record<string, string>> = {
  criticalSuccess: 'Critical success',
  success: 'Success',
  failure: 'Failure',
  criticalFailure: 'Critical failure',
};

const ORDINALS: Readonly<Record<number, string>> = {
  1: 'First',
  2: 'Second',
  3: 'Third',
};

const title = computed(() => {
  const m = props.message;
  switch (m.kind) {
    case 'check':
      return `${m.actorName}: ${m.label}`;
    case 'strikeAttack':
      return `${m.actorName}: ${m.weaponName} attack`;
    case 'strikeDamage':
      return `${m.actorName}: ${m.weaponName} damage${m.critical ? ' (critical)' : ''}`;
  }
  return '';
});

/** "Second attack": the step of the Multiple Attack Penalty that was used. */
const attackStep = computed(() =>
  props.message.kind === 'strikeAttack'
    ? `${ORDINALS[props.message.attackNumber] ?? ''} attack of the turn`
    : undefined,
);

const dc = computed(() =>
  props.message.kind === 'strikeDamage' ? undefined : props.message.dc,
);

/** " vs DC 18", or " vs Goblin (DC 18)" when the attack named its target -- with its own leading space, so it is never a whitespace-only text node Vue's compiler could trim. */
const dcLabel = computed(() => {
  if (dc.value === undefined) {
    return undefined;
  }
  const targetName =
    props.message.kind === 'strikeAttack' ? props.message.targetName : undefined;
  return targetName === undefined
    ? ` vs DC ${dc.value}`
    : ` vs ${targetName} (DC ${dc.value})`;
});

const degree = computed(() =>
  props.message.roll.degree === undefined
    ? undefined
    : DEGREE_LABELS[props.message.roll.degree],
);

/** " (flanking)" when the attack's DC was lowered by flanking (M5 C.10), with its own leading space. */
const flankingLabel = computed(() =>
  props.message.kind === 'strikeAttack' && props.message.flanking === true
    ? ' (flanking)'
    : undefined,
);

const damage = computed(() =>
  Object.entries(props.message.roll.damage ?? {}).map(
    ([type, amount]) => `${amount} ${type}`,
  ),
);

/** Why a modifier did not count, in words. */
function whyNotApplied(modifier: { suppressedBy?: string | undefined }): string {
  return modifier.suppressedBy === undefined
    ? 'not applied'
    : `not applied: ${titleCase(modifier.suppressedBy)} is better`;
}
</script>

<template>
  <div class="roll-card">
    <p class="title">
      <strong>{{ title }}</strong>
      <span class="by"> — rolled by {{ sender }}</span>
    </p>
    <p v-if="attackStep" class="step">{{ attackStep }}</p>

    <p class="result">
      <template v-if="message.gmTotal !== undefined"
        >GM set to <strong class="total">{{ message.gmTotal }}</strong> (rolled
        {{ message.roll.total }})</template
      >
      <template v-else
        >Total <strong class="total">{{ message.roll.total }}</strong></template
      >
      <template v-if="dcLabel">{{ dcLabel }}</template>
      <template v-if="degree"> — {{ degree }}</template>
      <template v-if="flankingLabel">{{ flankingLabel }}</template>
    </p>
    <form v-if="isGm && editing" class="gm-edit" @submit.prevent="submitEdit">
      <label :for="`gm-total-${message.id}`">GM total</label>
      <input :id="`gm-total-${message.id}`" v-model="draftTotal" type="number" />
      <button type="submit">Set</button>
      <button type="button" @click="editing = false">Cancel</button>
    </form>
    <button v-else-if="isGm" type="button" class="gm-edit-toggle" @click="startEditing">
      Edit roll
    </button>
    <p v-if="damage.length > 0" class="damage">{{ damage.join(', ') }}</p>
    <p v-if="message.roll.natural !== undefined" class="natural">
      d20: {{ message.roll.natural }}
    </p>

    <details class="roll-breakdown">
      <summary>Breakdown</summary>
      <p class="expression">{{ message.roll.expression }}</p>
      <ul class="terms">
        <li v-for="(term, index) in message.roll.terms" :key="index">
          <template v-if="term.kind === 'die'">
            d{{ term.faces }}: {{ term.result }}<span v-if="!term.kept"> (dropped)</span>
          </template>
          <template v-else-if="term.kind === 'constant'">
            {{ signed(term.value) }}
          </template>
          <template v-else>@{{ term.name }}: {{ term.value }}</template>
        </li>
      </ul>
      <p class="modifiers-heading">
        {{ message.kind === 'strikeDamage' ? 'Damage modifier' : 'Bonus' }}
        {{ signed(message.breakdown.total) }}
      </p>
      <ul class="modifiers">
        <li
          v-for="modifier in message.breakdown.modifiers"
          :key="modifier.slug"
          :class="{ unapplied: !modifier.applied }"
        >
          {{ signed(modifier.value) }} {{ modifier.label }}
          <span class="modifier-type">({{ modifier.type }})</span>
          <span v-if="!modifier.applied" class="modifier-note">
            — {{ whyNotApplied(modifier) }}
          </span>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.roll-card {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

p {
  margin: 0;
}

.by,
.step,
.natural,
.modifier-type,
.modifier-note {
  color: var(--color-text-muted);
}

.total {
  font-size: 1.25rem;
}

.gm-edit {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: var(--space-1);
}

.gm-edit input {
  width: 6rem;
}

.gm-edit-toggle,
.gm-edit button {
  min-height: var(--touch-target-min);
}

.gm-edit-toggle {
  margin-top: var(--space-1);
}

.roll-breakdown summary {
  cursor: pointer;
  min-height: var(--touch-target-min);
  display: flex;
  align-items: center;
}

.terms,
.modifiers {
  margin: var(--space-1) 0;
  padding-left: var(--space-4);
}

/* A suppressed modifier is struck through *and* says so in words. */
.unapplied {
  text-decoration: line-through;
}

.unapplied .modifier-note {
  text-decoration: none;
  display: inline-block;
}
</style>
