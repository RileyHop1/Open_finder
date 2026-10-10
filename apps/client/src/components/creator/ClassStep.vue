<script setup lang="ts">
/**
 * The class step: pick a class and see what it gives before committing --
 * Hit Points per level, the key attribute (a choice when the class offers
 * more than one), the starting proficiencies, and the skills it trains. The
 * seven martial classes come first because the creator builds them
 * completely; every other class can be picked too, with a visible warning
 * that its setup (spells, resources) arrives later. Nothing is refused
 * (ADR 0023).
 */
import type {
  Attribute,
  BuildRef,
  CharacterBuild,
  ClassEntry,
  ProficiencyProgression,
} from '@hearthtable/pf2e';
import { rankAtLevel } from '@hearthtable/pf2e';
import { computed, onMounted, ref } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';
import RulesText from '../RulesText.vue';
import { titleCase } from '../sheet/format.js';
import { MARTIAL_CLASS_SLUGS } from './creatorModel.js';

const props = defineProps<{
  build: CharacterBuild;
  /** The chosen class's full entry, once loaded. */
  classEntry: ClassEntry | undefined;
  /** The key attribute chosen so far, if the player chose one. */
  keyAttribute: Attribute | undefined;
}>();
const emit = defineEmits<{
  pickClass: [ref: BuildRef | undefined];
  pickKeyAttribute: [attribute: Attribute];
}>();

const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const available = ref<boolean>();
const classes = ref<EntrySummary[]>([]);
const error = ref<string>();

onMounted(async () => {
  try {
    available.value = await isCompendiumAvailable();
    if (available.value) {
      classes.value = await searchCompendium({ kind: 'class', limit: 200 });
    }
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : 'could not load the compendium';
  }
});

const martial = computed(() =>
  classes.value.filter((c) => MARTIAL_CLASS_SLUGS.includes(c.slug)),
);
const others = computed(() =>
  classes.value.filter((c) => !MARTIAL_CLASS_SLUGS.includes(c.slug)),
);

const chosen = (c: EntrySummary): boolean =>
  props.build.class?.packId === c.packId && props.build.class.slug === c.slug;

const isLater = computed(
  () =>
    props.classEntry !== undefined &&
    !MARTIAL_CLASS_SLUGS.includes(props.classEntry.slug),
);

/** The key attribute in effect: the player's choice if the class offers it, else its first option. */
const effectiveKey = computed(() => {
  const options = props.classEntry?.keyAttributeOptions ?? [];
  return props.keyAttribute !== undefined && options.includes(props.keyAttribute)
    ? props.keyAttribute
    : options[0];
});

const rank = (progression: ProficiencyProgression): string =>
  titleCase(rankAtLevel(progression, 1));

const proficiencies = computed(() => {
  const p = props.classEntry?.proficiencies;
  if (p === undefined) {
    return [];
  }
  return [
    ['Perception', p.perception],
    ['Fortitude', p.savingThrows.fortitude],
    ['Reflex', p.savingThrows.reflex],
    ['Will', p.savingThrows.will],
    ['Class DC', p.classDc],
    ['Unarmed', p.weapons.unarmed],
    ['Simple weapons', p.weapons.simple],
    ['Martial weapons', p.weapons.martial],
    ['Advanced weapons', p.weapons.advanced],
    ['Unarmored', p.armor.unarmored],
    ['Light armor', p.armor.light],
    ['Medium armor', p.armor.medium],
    ['Heavy armor', p.armor.heavy],
  ] as const;
});
</script>

<template>
  <section class="class-step" aria-labelledby="class-step-title">
    <h3 id="class-step-title">Class</h3>

    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="available === false" class="note">
      No game content has been imported yet, so there is nothing to choose from. The GM
      can import it from the table, or you can skip this step.
    </p>

    <fieldset v-if="martial.length > 0" class="cards">
      <legend>Choose a class</legend>
      <label v-for="c in martial" :key="c.slug" class="card">
        <input
          type="radio"
          name="class"
          :checked="chosen(c)"
          @change="emit('pickClass', { packId: c.packId, slug: c.slug })"
        />
        <span class="art" aria-hidden="true">{{ c.name.slice(0, 1).toUpperCase() }}</span>
        <span class="name">{{ c.name }}</span>
      </label>
    </fieldset>

    <details v-if="others.length > 0" class="later" :open="isLater">
      <summary>Spellcasters and other classes</summary>
      <p class="note">
        You can pick these, but their spells and special features are set up in a later
        update, so you will fill those in by hand for now.
      </p>
      <label v-for="c in others" :key="c.slug" class="row">
        <input
          type="radio"
          name="class"
          :checked="chosen(c)"
          @change="emit('pickClass', { packId: c.packId, slug: c.slug })"
        />
        {{ c.name }}
      </label>
    </details>

    <p v-if="isLater" class="warning" role="note">
      {{ classEntry?.name }} is not fully set up yet: its spells and special features are
      added by hand for now.
    </p>

    <section v-if="classEntry" class="details" aria-label="What this class gives">
      <h4>{{ classEntry.name }}</h4>
      <dl>
        <dt>Hit Points</dt>
        <dd>{{ classEntry.hpPerLevel }} plus Constitution, per level</dd>
        <dt>Trained skills</dt>
        <dd>
          {{ classEntry.skills.trainedSkillCount }} plus Intelligence<template
            v-if="classEntry.skills.automaticallyTrained.length > 0"
            >, and
            {{
              classEntry.skills.automaticallyTrained.map(titleCase).join(', ')
            }}</template
          >
        </dd>
        <dt>Key attribute</dt>
        <dd>
          <template v-if="classEntry.keyAttributeOptions.length === 1">{{
            ATTRIBUTE_NAMES[classEntry.keyAttributeOptions[0] ?? ''] ?? ''
          }}</template>
          <fieldset v-else class="key">
            <legend class="visually-hidden">Key attribute</legend>
            <label v-for="a in classEntry.keyAttributeOptions" :key="a" class="row">
              <input
                type="radio"
                name="key-attribute"
                :checked="effectiveKey === a"
                @change="emit('pickKeyAttribute', a)"
              />
              {{ ATTRIBUTE_NAMES[a] ?? a }}
            </label>
          </fieldset>
        </dd>
      </dl>
      <table class="proficiencies">
        <caption>
          Starting proficiencies
        </caption>
        <tbody>
          <tr v-for="[label, progression] in proficiencies" :key="label">
            <th scope="row">{{ label }}</th>
            <td>{{ rank(progression) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="classEntry.text && classEntry.text.length > 0" class="description">
        <RulesText :nodes="classEntry.text" />
      </div>
    </section>
  </section>
</template>

<style scoped>
.class-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
h4 {
  margin: 0;
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
}

.cards legend {
  grid-column: 1 / -1;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  min-height: var(--touch-target-min);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

/* The chosen card is marked by weight and an outline, never colour alone. */
.card:has(input:checked) {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

.art {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 3.5rem;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  font-size: 1.5rem;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target-min);
}

.warning {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  font-weight: 600;
}

.details {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
}

dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-1) var(--space-3);
  margin: var(--space-2) 0;
}

dt {
  color: var(--color-text-muted);
}

dd {
  margin: 0;
}

.key {
  border: 0;
  padding: 0;
}

.proficiencies {
  border-collapse: collapse;
}

.proficiencies caption {
  text-align: left;
  font-weight: 600;
}

.proficiencies th,
.proficiencies td {
  padding: var(--space-1) var(--space-3) var(--space-1) 0;
  text-align: left;
}

.note {
  color: var(--color-text-muted);
}
</style>
