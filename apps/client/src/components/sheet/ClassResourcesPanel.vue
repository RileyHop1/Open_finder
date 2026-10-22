<script setup lang="ts">
/**
 * A class's resource pools and daily crafting (`docs/class-resources.md`): an
 * Alchemist's versatile vials, counted in words and pips, with one-click Use,
 * Regain and Refill, how many infused items Advanced Alchemy has made today out of
 * its daily count, and a Daily preparations button (`actor.dailyPreparations`:
 * vials and slots refilled, yesterday's infused items cleared).
 * Sizes come from the PF2e system's `classResources` (2 + Intelligence vials), so
 * they follow the character; only what is spent is saved. Nothing is refused (ADR
 * 0023): using a vial past the last reads as over the maximum, and the maximum can be
 * set by hand.
 */
import type { Actor } from '@hearthtable/core';
import {
  characterDataSchema,
  classResources,
  dailyCrafting,
  type ClassResource,
} from '@hearthtable/pf2e';
import { computed, useId } from 'vue';

const props = defineProps<{ actor: Actor; editable: boolean }>();
const emit = defineEmits<{
  change: [changes: Record<string, unknown>];
  /** Daily preparations: `actor.dailyPreparations`. */
  prepare: [];
}>();

const id = useId();
const data = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});
const pools = computed(() =>
  data.value === undefined ? [] : classResources(data.value),
);
const crafting = computed(() =>
  data.value === undefined ? undefined : dailyCrafting(data.value),
);
/** Infused items Advanced Alchemy has made since the last daily preparations. */
const madeToday = computed(() =>
  (data.value?.items ?? [])
    .filter((item) => item.infused === 'daily')
    .reduce((sum, item) => sum + item.quantity, 0),
);

/** "3 of 5 left", or past the maximum "-1 (1 over the maximum)". */
function countText(pool: ClassResource): string {
  return pool.over > 0
    ? `-${pool.over} (${pool.over} over the maximum)`
    : `${pool.left} of ${pool.max} left`;
}

function setUsed(pool: ClassResource, used: number): void {
  emit('change', { [`system.resources.${pool.key}.used`]: Math.max(0, used) });
}

function onMax(pool: ClassResource, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  const value = Number(raw);
  emit('change', {
    [`system.resources.${pool.key}.max`]:
      raw === '' || !Number.isInteger(value) || value < 0 ? null : value,
  });
}
</script>

<template>
  <section
    v-if="pools.length > 0 || crafting !== undefined"
    class="class-resources"
    :aria-labelledby="`${id}-title`"
  >
    <h4 :id="`${id}-title`">Class resources</h4>

    <div v-for="pool in pools" :key="pool.key" class="pool" :aria-label="pool.name">
      <span class="name">{{ pool.name }}</span>
      <span class="pips" aria-hidden="true">
        <span
          v-for="i in Math.max(pool.max, pool.used)"
          :key="i"
          class="pip"
          :class="{ filled: i <= pool.left, over: i > pool.max }"
        />
      </span>
      <span class="count" :class="{ over: pool.over > 0 }">{{ countText(pool) }}</span>
      <template v-if="editable">
        <button
          type="button"
          :aria-label="`Use one of your ${pool.name.toLowerCase()}`"
          @click="setUsed(pool, pool.used + 1)"
        >
          Use one
        </button>
        <button
          v-if="pool.regain !== undefined"
          type="button"
          :aria-label="`Regain ${pool.regain.amount} ${pool.name.toLowerCase()}`"
          @click="setUsed(pool, pool.used - pool.regain.amount)"
        >
          Regain {{ pool.regain.amount }}
        </button>
        <button
          type="button"
          :aria-label="`Refill your ${pool.name.toLowerCase()}`"
          @click="setUsed(pool, 0)"
        >
          Refill
        </button>
        <label class="max">
          Maximum
          <input
            type="number"
            min="0"
            inputmode="numeric"
            :value="pool.max === pool.derivedMax ? '' : pool.max"
            :placeholder="String(pool.derivedMax)"
            @change="onMax(pool, $event)"
          />
        </label>
      </template>
      <p v-if="pool.regain !== undefined" class="note">
        Regain {{ pool.regain.amount }} {{ pool.regain.how }}; refill at your daily
        preparations.
      </p>
    </div>

    <p v-if="crafting !== undefined" class="crafting">
      {{ crafting.name }}: <strong>{{ madeToday }}</strong> of
      {{ crafting.count }} infused items made today<template
        v-if="madeToday > crafting.count"
      >
        ({{ madeToday - crafting.count }} more than you make each day)</template
      >. Make them from your formula book below.
    </p>
    <p v-if="editable" class="prepare">
      <button type="button" @click="emit('prepare')">Daily preparations</button>
      <span class="note">
        Refills your vials, focus points and spell slots, and clears yesterday's infused
        items.
      </span>
    </p>
  </section>
</template>

<style scoped>
.class-resources {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

h4,
p {
  margin: 0;
}

.pool {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.name {
  font-weight: bold;
}

.pips {
  display: inline-flex;
  gap: 2px;
}

.pip {
  width: 0.75rem;
  height: 0.75rem;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.pip.filled {
  background: currentColor;
}

.pip.over {
  border-style: dashed;
}

.count.over {
  font-weight: bold;
}

.note {
  flex-basis: 100%;
  color: var(--color-text-muted);
}

.max input {
  width: 4rem;
}

button,
input {
  min-height: var(--touch-target-min);
}
</style>
