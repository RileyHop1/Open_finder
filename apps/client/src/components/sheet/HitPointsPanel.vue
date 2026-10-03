<script setup lang="ts">
/**
 * Hit points at the table: the numbers in words, and for an owner or the GM
 * an amount box with Damage, Heal, and Temp HP buttons. Damage and Heal are
 * sent as `actor.applyDamage` / `actor.heal` (M5 C.8a), which run the whole
 * dying chain server-side in the same operation (knock out, dying, massive
 * damage, revive) -- a plain `actor.update` would bypass it entirely. Temp
 * HP has no such operation, so it still computes locally with
 * `grantTemporaryHitPoints` (temporary hit points do not stack) and is sent
 * as a raw field change by the parent.
 *
 * Setting a value directly is the GM override and lives in the sheet's edit
 * mode ("Current Hit Points", "Temporary Hit Points"); nothing here is a
 * lock, only a convenience that does the rules for you.
 */
import type { Actor } from '@hearthtable/core';
import {
  characterDataSchema,
  grantTemporaryHitPoints,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
} from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

const props = defineProps<{ actor: Actor; editable?: boolean }>();
const emit = defineEmits<{
  change: [changes: Record<string, number>];
  damage: [amount: number, critical: boolean];
  heal: [amount: number];
}>();

/** A character's or a monster's hit points: both store `system.hp.current` and `.temp`, and prepare a maximum. */
const prepared = computed(() => {
  if (props.actor.kind === 'npc') {
    const npc = npcDataSchema.safeParse(props.actor.system);
    return npc.success ? prepareNpc(npc.data) : undefined;
  }
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

/** Whether the hit damage was a critical hit: doubles the dying value on a knockout (`docs/conditions.md`). */
const critical = ref(false);

function damage(): void {
  if (typeof amount.value !== 'number' || !validAmount.value) {
    return;
  }
  emit('damage', amount.value, critical.value);
  amount.value = '';
  critical.value = false;
}

function heal(): void {
  if (typeof amount.value !== 'number' || !validAmount.value) {
    return;
  }
  emit('heal', amount.value);
  amount.value = '';
}

function grantTemp(): void {
  const hp = prepared.value?.hp;
  if (hp === undefined || typeof amount.value !== 'number' || !validAmount.value) {
    return;
  }
  const next = grantTemporaryHitPoints(
    { current: hp.current, temp: hp.temp },
    amount.value,
  );
  amount.value = '';
  if (next.temp !== hp.temp) {
    emit('change', { 'system.hp.temp': next.temp });
  }
}
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
      <label for="hp-critical" class="critical-label">
        <input id="hp-critical" v-model="critical" type="checkbox" />
        Critical hit
      </label>
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

.critical-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.hp-controls input[type='number'] {
  width: 5rem;
}

/* Said in words, so being at 0 never depends on colour. */
.down {
  font-weight: 600;
}
</style>
