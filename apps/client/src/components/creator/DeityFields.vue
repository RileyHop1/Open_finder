<script setup lang="ts">
/**
 * A Cleric's or Champion's deity (`docs/character-build.md`, "Deity"): its name and the
 * facts the rules use -- the divine font it grants, its divine skill, the sanctification
 * the character takes, and its favored weapon -- entered from the deity's entry, since no
 * deity is imported. Every field is optional and nothing is checked against a deity list
 * (ADR 0023); the derivation trains the divine skill and warns about a font the deity
 * does not grant. Emits the whole set of facts on each change.
 */
import { type DeityFacts, SKILLS } from '@hearthtable/pf2e';
import { useId } from 'vue';

import { titleCase } from '../sheet/format.js';

const props = defineProps<{ deity: DeityFacts | undefined }>();
const emit = defineEmits<{ change: [deity: DeityFacts] }>();

const id = useId();
const FONTS = [
  ['heal', 'Heal'],
  ['harm', 'Harm'],
  ['either', 'Either'],
] as const;
const SANCTIFICATIONS = [
  ['holy', 'Holy'],
  ['unholy', 'Unholy'],
  ['none', 'None'],
] as const;

/** `deity` with `key` set to `value`, or without it when `value` is empty. */
function set<K extends keyof DeityFacts>(key: K, value: DeityFacts[K] | ''): void {
  const { [key]: _old, ...rest } = props.deity ?? {};
  emit('change', value === '' || value === undefined ? rest : { ...rest, [key]: value });
}

const text = (event: Event) => (event.target as HTMLInputElement).value.trim();
</script>

<template>
  <fieldset class="deity">
    <legend>Your deity</legend>
    <p class="note">
      Enter what your deity's entry says. The app has no list of deities, so it uses these
      facts: it trains the divine skill and checks your font against the deity's.
    </p>

    <label :for="`${id}-name`">Deity</label>
    <input
      :id="`${id}-name`"
      type="text"
      maxlength="80"
      :value="deity?.name ?? ''"
      @change="set('name', text($event))"
    />

    <fieldset class="row">
      <legend>Divine font it grants</legend>
      <label v-for="[value, label] in FONTS" :key="value" class="option">
        <input
          type="radio"
          :name="`${id}-font`"
          :checked="deity?.font === value"
          @change="set('font', value)"
        />
        {{ label }}
      </label>
    </fieldset>

    <label :for="`${id}-skill`">Divine skill</label>
    <select
      :id="`${id}-skill`"
      :value="deity?.skill ?? ''"
      @change="set('skill', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Choose…</option>
      <option v-for="skill in SKILLS" :key="skill" :value="skill">
        {{ titleCase(skill) }}
      </option>
    </select>

    <fieldset class="row">
      <legend>Your sanctification</legend>
      <label v-for="[value, label] in SANCTIFICATIONS" :key="value" class="option">
        <input
          type="radio"
          :name="`${id}-sanctification`"
          :checked="deity?.sanctification === value"
          @change="set('sanctification', value)"
        />
        {{ label }}
      </label>
    </fieldset>

    <label :for="`${id}-weapon`">Favored weapon</label>
    <input
      :id="`${id}-weapon`"
      type="text"
      maxlength="80"
      :value="deity?.weapon ?? ''"
      @change="set('weapon', text($event))"
    />
  </fieldset>
</template>

<style scoped>
.deity {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2);
  align-items: center;
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.note,
.row {
  grid-column: 1 / -1;
}

.note {
  margin: 0;
  color: var(--color-text-muted);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  border: none;
  padding: 0;
}

.option {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--touch-target-min);
}

input[type='text'],
select {
  min-height: var(--touch-target-min);
}
</style>
