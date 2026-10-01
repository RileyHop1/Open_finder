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
import { computed } from 'vue';

import { signed, titleCase } from './sheet/format.js';

const props = defineProps<{
  message: ChatCheckMessage | ChatStrikeAttackMessage | ChatStrikeDamageMessage;
  /** The sending seat's name. */
  sender: string;
}>();

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

const degree = computed(() =>
  props.message.roll.degree === undefined
    ? undefined
    : DEGREE_LABELS[props.message.roll.degree],
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
      Total <strong class="total">{{ message.roll.total }}</strong>
      <template v-if="dc !== undefined"> vs DC {{ dc }}</template>
      <template v-if="degree"> — {{ degree }}</template>
    </p>
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
