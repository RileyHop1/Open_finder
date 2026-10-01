<script setup lang="ts">
/**
 * Hit points at the table: the numbers in words, and for an owner or the GM
 * an amount box with Damage, Heal, and Temp HP buttons. The arithmetic is
 * `applyDamage` / `applyHealing` / `grantTemporaryHitPoints` in `systems/pf2e`
 * (temporary hit points soak damage first, healing stops at the maximum,
 * temporary hit points do not stack), so every place that changes hit points
 * follows the same rules. The result is emitted as the two stored fields, for
 * the parent to send as one `actor.update`.
 *
 * Setting a value directly is the GM override and lives in the sheet's edit
 * mode ("Current Hit Points", "Temporary Hit Points"); nothing here is a
 * lock, only a convenience that does the rules for you.
 */
import type { Actor } from '@hearthtable/core';
import {
  applyDamage,
  applyHealing,
  characterDataSchema,
  grantTemporaryHitPoints,
  type HitPointState,
  prepareCharacter,
} from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

const props = defineProps<{ actor: Actor; editable?: boolean }>();
const emit = defineEmits<{ change: [changes: Record<string, number>] }>();

const prepared = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? prepareCharacter(parsed.data) : undefined;
});

const amount = ref<number | ''>('');
const validAmount = computed(
  () =>
    typeof amount.value === 'number' &&
    Number.isInteger(amount.value) &&
    amount.value >= 1,
);

function apply(
  change: (state: HitPointState, amount: number, max: number) => HitPointState,
): void {
  const hp = prepared.value?.hp;
  if (hp === undefined || typeof amount.value !== 'number' || !validAmount.value) {
    return;
  }
  const next = change({ current: hp.current, temp: hp.temp }, amount.value, hp.max.total);
  const changes: Record<string, number> = {};
  if (next.current !== hp.current) {
    changes['system.hp.current'] = next.current;
  }
  if (next.temp !== hp.temp) {
    changes['system.hp.temp'] = next.temp;
  }
  amount.value = '';
  if (Object.keys(changes).length > 0) {
    emit('change', changes);
  }
}

const damage = () => apply((state, n) => applyDamage(state, n));
const heal = () => apply((state, n, max) => applyHealing(state, n, max));
const grantTemp = () => apply((state, n) => grantTemporaryHitPoints(state, n));
</script>

<template>
  <section v-if="prepared" class="hit-points-panel" aria-labelledby="hp-heading">
    <h4 id="hp-heading">Hit points</h4>
    <p class="hp-read" role="status">
      <strong>{{ prepared.hp.current }} / {{ prepared.hp.max.total }}</strong>
      <span v-if="prepared.hp.temp > 0"> · {{ prepared.hp.temp }} temporary</span>
      <span v-if="prepared.hp.current === 0" class="down"> · at 0 hit points</span>
    </p>

    <form v-if="editable" class="hp-controls" @submit.prevent="damage">
      <label for="hp-amount">Amount</label>
      <input id="hp-amount" v-model.number="amount" type="number" min="1" step="1" />
      <button type="submit" :disabled="!validAmount">Damage</button>
      <button type="button" :disabled="!validAmount" @click="heal">Heal</button>
      <button type="button" :disabled="!validAmount" @click="grantTemp">Temp HP</button>
    </form>
  </section>
</template>

<style scoped>
h4,
p {
  margin: 0;
}

.hit-points-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.hp-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.hp-controls input,
.hp-controls button {
  min-height: var(--touch-target-min);
}

.hp-controls input {
  width: 5rem;
}

/* Said in words, so being at 0 never depends on colour. */
.down {
  font-weight: 600;
}
</style>
