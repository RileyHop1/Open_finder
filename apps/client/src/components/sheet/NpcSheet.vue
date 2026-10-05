<script setup lang="ts">
/**
 * A monster's sheet, for the GM: the finished numbers off its stat block (the
 * same `prepareNpc` the server rolls with, so conditions already show in the
 * totals), with a Roll button on every statistic that is rolled. Hit points,
 * conditions, and strikes are their own panels, shared with the character sheet.
 *
 * Players never get this: a monster's actor is hidden from them (`none`), so
 * `TableView` has nothing to show them. Like the character sheet it never talks
 * to the server; it emits what was asked for. The override for the stat block
 * is two-fold: conditions change the numbers the way the rules say, and the
 * current hit points can be set directly here.
 */
import type { Actor } from '@hearthtable/core';
import { npcDataSchema, prepareNpc } from '@hearthtable/pf2e';
import { computed } from 'vue';

import RulesTerm from '../RulesTerm.vue';
import { signed, titleCase } from './format.js';
import NumberField from './NumberField.vue';

const props = defineProps<{ actor: Actor; rollable?: boolean }>();
const emit = defineEmits<{
  change: [changes: Record<string, unknown>];
  roll: [statistic: string];
}>();

const data = computed(() => {
  const parsed = npcDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});

const prepared = computed(() =>
  data.value === undefined ? undefined : prepareNpc(data.value),
);

/** The defences first, then perception, then skills in name order: the order a stat block reads. */
const rows = computed(() => {
  const statistics = prepared.value?.statistics ?? {};
  const fixed = ['ac', 'fortitude', 'reflex', 'will', 'perception'];
  const skills = Object.keys(statistics)
    .filter((key) => key.startsWith('skill:'))
    .sort();
  return [...fixed, ...skills].flatMap((key) => {
    const statistic = statistics[key];
    return statistic === undefined
      ? []
      : [
          {
            key,
            label: key === 'ac' ? 'Armor Class' : titleCase(key),
            total: statistic.total,
            /** AC is a number others roll against, not a roll. */
            isBonus: key !== 'ac',
          },
        ];
  });
});

const speeds = computed(() =>
  Object.entries(data.value?.creature.speeds ?? {})
    .filter(([, feet]) => typeof feet === 'number')
    .map(([kind, feet]) => `${kind === 'land' ? 'Speed' : titleCase(kind)} ${feet} ft`)
    .join(', '),
);
</script>

<template>
  <section v-if="data && prepared" class="npc-sheet" aria-labelledby="npc-heading">
    <header>
      <h3 id="npc-heading">{{ actor.name }}</h3>
      <p class="muted">
        Creature {{ data.creature.level }} · {{ titleCase(data.creature.size) }}
        <template v-if="data.creature.traits.length > 0">
          ·
          <template v-for="(trait, index) in data.creature.traits" :key="trait">
            <RulesTerm term-kind="trait" :slug="trait" :label="titleCase(trait)" />
            <template v-if="index < data.creature.traits.length - 1">, </template>
          </template>
        </template>
      </p>
      <p v-if="speeds" class="muted">{{ speeds }}</p>
    </header>

    <p v-if="prepared.inertCount > 0" class="inert-flag">
      Automation not applied
      <span class="muted">
        ({{ prepared.inertCount }} ability effect{{
          prepared.inertCount === 1 ? '' : 's'
        }}
        to apply by hand)
      </span>
    </p>

    <p class="set-hp">
      <NumberField
        label="Set current hit points"
        :value="prepared.hp.current"
        :min="0"
        :max="prepared.hp.max.total"
        @commit="(n) => emit('change', { 'system.hp.current': n })"
      />
      <span class="muted">of {{ prepared.hp.max.total }}, the GM's override</span>
    </p>

    <table class="statistics">
      <thead>
        <tr>
          <th scope="col">Statistic</th>
          <th scope="col">Total</th>
          <th v-if="rollable" scope="col"><span class="visually-hidden">Roll</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.key">
          <th scope="row">{{ row.label }}</th>
          <td class="total">{{ row.isBonus ? signed(row.total) : row.total }}</td>
          <td v-if="rollable" class="roll">
            <button
              v-if="row.isBonus"
              type="button"
              :aria-label="`Roll ${row.label}`"
              @click="emit('roll', row.key)"
            >
              Roll
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
  <p v-else class="muted">This monster's stat block could not be read.</p>
</template>

<style scoped>
.npc-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
p {
  margin: 0;
}

.muted {
  color: var(--color-text-muted);
}

.inert-flag {
  align-self: flex-start;
  padding: 0 var(--space-2);
  border: 1px dashed var(--color-danger);
  border-radius: 4px;
}

.set-hp {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.statistics {
  border-collapse: collapse;
}

.statistics th,
.statistics td {
  padding: var(--space-1) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.roll button {
  min-height: var(--touch-target-min);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
