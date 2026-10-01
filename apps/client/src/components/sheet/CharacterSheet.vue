<script setup lang="ts">
/**
 * A character's sheet, read-only: header, attributes, defenses, and skills.
 * Every number comes from `prepareCharacter` (the same function the server
 * uses to roll), run here in the browser on each change, so what the sheet
 * shows is what a roll uses. Editing arrives in the next change; the
 * breakdown on every number is milestone 6. Ranks are written out in words
 * rather than shown by colour, so nothing here relies on colour alone.
 */
import type { Actor } from '@hearthtable/core';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { computed } from 'vue';

import { signed, titleCase } from './format.js';

const props = defineProps<{ actor: Actor }>();

const ATTRIBUTES = [
  ['str', 'Strength'],
  ['dex', 'Dexterity'],
  ['con', 'Constitution'],
  ['int', 'Intelligence'],
  ['wis', 'Wisdom'],
  ['cha', 'Charisma'],
] as const;

/** The parsed sheet, or `undefined` for something that is not a character or whose stored data no longer validates. */
const data = computed(() => {
  if (props.actor.kind !== 'character') {
    return undefined;
  }
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});

const prepared = computed(() =>
  data.value === undefined ? undefined : prepareCharacter(data.value),
);

function total(key: string): number {
  return prepared.value?.statistics[key]?.total ?? 0;
}

const defenses = computed(() => {
  const ranks = data.value?.ranks;
  if (ranks === undefined) {
    return [];
  }
  return [
    { key: 'ac', label: 'Armor Class', bonus: false, rank: undefined },
    { key: 'fortitude', label: 'Fortitude', bonus: true, rank: ranks.fortitude },
    { key: 'reflex', label: 'Reflex', bonus: true, rank: ranks.reflex },
    { key: 'will', label: 'Will', bonus: true, rank: ranks.will },
    { key: 'perception', label: 'Perception', bonus: true, rank: ranks.perception },
    { key: 'classDc', label: 'Class DC', bonus: false, rank: ranks.classDc },
  ];
});

const skills = computed(() => {
  const ranks = data.value?.ranks.skills ?? {};
  return Object.keys(prepared.value?.statistics ?? {})
    .filter((key) => key.startsWith('skill:'))
    .map((key) => ({
      key,
      label: titleCase(key),
      rank: ranks[key.slice('skill:'.length)] ?? 'untrained',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

const lineage = computed(() =>
  [data.value?.ancestry, data.value?.heritage, data.value?.background, data.value?.class]
    .flatMap((ref) => (ref === undefined ? [] : [ref.name]))
    .join(' · '),
);
</script>

<template>
  <article class="character-sheet" :aria-labelledby="`sheet-${actor.id}-name`">
    <p v-if="data === undefined" class="empty">
      {{
        actor.kind === 'character'
          ? 'This character’s stored data is not valid, so it cannot be shown.'
          : `A ${actor.kind} does not have a character sheet yet.`
      }}
    </p>

    <template v-else-if="prepared">
      <header class="sheet-header">
        <h3 :id="`sheet-${actor.id}-name`">{{ actor.name }}</h3>
        <p class="level">Level {{ data.level }}</p>
        <p v-if="lineage" class="lineage">{{ lineage }}</p>
        <p class="hit-points">
          Hit Points
          <strong>{{ prepared.hp.current }} / {{ prepared.hp.max.total }}</strong>
          <span v-if="prepared.hp.temp > 0"> (+{{ prepared.hp.temp }} temporary)</span>
        </p>
        <p v-if="data.conditions.length > 0" class="conditions">
          Conditions:
          <span v-for="condition in data.conditions" :key="condition.slug" class="chip">
            {{ titleCase(condition.slug) }}
            <template v-if="condition.value !== undefined">{{
              condition.value
            }}</template>
          </span>
        </p>
      </header>

      <section aria-labelledby="attributes-heading">
        <h4 id="attributes-heading">Attributes</h4>
        <ul class="attributes">
          <li v-for="[key, label] in ATTRIBUTES" :key="key">
            <span class="name">{{ label }}</span>
            <span class="value">{{ signed(data.attributes[key]) }}</span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="defenses-heading">
        <h4 id="defenses-heading">Defenses and senses</h4>
        <table class="statistics">
          <thead>
            <tr>
              <th scope="col">Statistic</th>
              <th scope="col">Rank</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in defenses" :key="row.key">
              <th scope="row">{{ row.label }}</th>
              <td class="rank">
                {{ row.rank === undefined ? '' : titleCase(row.rank) }}
              </td>
              <td class="total">
                {{ row.bonus ? signed(total(row.key)) : total(row.key) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="skills-heading">
        <h4 id="skills-heading">Skills</h4>
        <table class="statistics">
          <thead>
            <tr>
              <th scope="col">Skill</th>
              <th scope="col">Rank</th>
              <th scope="col">Bonus</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="skill in skills" :key="skill.key">
              <th scope="row">{{ skill.label }}</th>
              <td class="rank">{{ titleCase(skill.rank) }}</td>
              <td class="total">{{ signed(total(skill.key)) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </article>
</template>

<style scoped>
.character-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sheet-header h3,
.sheet-header p,
h4 {
  margin: 0;
}

.sheet-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-1) var(--space-3);
}

.lineage,
.empty,
.rank {
  color: var(--color-text-muted);
}

/* A condition is named in words and carries its value, never colour alone. */
.chip {
  display: inline-block;
  margin-left: var(--space-1);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.attributes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  gap: var(--space-2);
  list-style: none;
  margin: var(--space-2) 0 0;
  padding: 0;
}

.attributes li {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.statistics {
  width: 100%;
  margin-top: var(--space-2);
  border-collapse: collapse;
}

.statistics th,
.statistics td {
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.statistics .total {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
</style>
