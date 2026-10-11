<script setup lang="ts">
/**
 * The skills step: the skills the character is trained in. Some are trained
 * outright (by the class and the background, shown as already on); the player
 * picks the rest, as many as the class allows plus Intelligence, and may name
 * a Lore of their own. Nothing is refused (ADR 0023): picking more than are
 * allowed, or a skill that is already trained, is noted in words and still
 * applied.
 */
import type { Attribute } from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

import { titleCase } from '../sheet/format.js';
import { ATTRIBUTE_NAMES, type BoostEntries, type BoostPicks } from './boostPlan.js';
import {
  SKILLS,
  attributeForSkill,
  intelligenceOf,
  isNamedSkill,
  loreSlug,
  skillNotes,
  skillSlots,
} from './skillPlan.js';

const props = defineProps<{
  entries: BoostEntries;
  boostPicks: BoostPicks;
  keyAttribute: Attribute | undefined;
  /** The skills picked so far (`build.trainedSkills`). */
  picked: readonly string[];
}>();
const emit = defineEmits<{ toggle: [skill: string] }>();

const slots = computed(() =>
  skillSlots(
    props.entries.class,
    props.entries.background,
    intelligenceOf(props.entries, props.boostPicks, props.keyAttribute),
  ),
);
const automatic = (skill: string) => slots.value.automatic.find((a) => a.skill === skill);
const lores = computed(() => props.picked.filter((s) => !isNamedSkill(s)));
const notes = computed(() => skillNotes(props.picked, slots.value));
const remaining = computed(() => Math.max(0, slots.value.allowed - props.picked.length));

const loreName = ref('');
function addLore(): void {
  const slug = loreSlug(loreName.value);
  if (slug !== '' && !props.picked.includes(slug)) {
    emit('toggle', slug);
  }
  loreName.value = '';
}
</script>

<template>
  <section class="skills-step" aria-labelledby="skills-step-title">
    <h3 id="skills-step-title">Skills</h3>

    <p v-if="entries.class === undefined" class="note">
      Pick a class to see how many skills it trains. You can choose skills now.
    </p>
    <p class="count" role="status">
      {{ picked.length }} of {{ slots.allowed }} chosen<template v-if="remaining > 0"
        >, {{ remaining }} to choose</template
      >
      <span class="note">
        ({{ entries.class?.skills.trainedSkillCount ?? 0 }} from your class, plus
        Intelligence)</span
      >
    </p>

    <ul class="skills">
      <li v-for="skill in SKILLS" :key="skill">
        <span v-if="automatic(skill)" class="fixed">
          ✓ {{ titleCase(skill) }} (trained by your {{ automatic(skill)?.from }})
        </span>
        <button
          v-else
          type="button"
          class="toggle"
          :aria-pressed="picked.includes(skill)"
          @click="emit('toggle', skill)"
        >
          {{ titleCase(skill) }}
          <span class="attribute">{{ ATTRIBUTE_NAMES[attributeForSkill(skill)] }}</span>
        </button>
      </li>
    </ul>

    <section class="lore" aria-label="Lore skills">
      <h4>Lore</h4>
      <p
        v-for="a in slots.automatic.filter((x) => !isNamedSkill(x.skill))"
        :key="a.skill"
      >
        <span class="fixed">
          ✓ {{ titleCase(a.skill) }} (trained by your {{ a.from }})
        </span>
      </p>
      <ul v-if="lores.length > 0" class="skills">
        <li v-for="skill in lores" :key="skill">
          <button
            type="button"
            class="toggle"
            aria-pressed="true"
            :aria-label="`Remove ${titleCase(skill)}`"
            @click="emit('toggle', skill)"
          >
            {{ titleCase(skill) }}
          </button>
        </li>
      </ul>
      <form class="add-lore" @submit.prevent="addLore">
        <label>
          Add a Lore
          <input v-model="loreName" type="text" maxlength="60" autocomplete="off" />
        </label>
        <button type="submit" :disabled="loreSlug(loreName) === ''">Add</button>
      </form>
    </section>

    <p v-for="note in notes" :key="note" class="warning" role="note">{{ note }}</p>
  </section>
</template>

<style scoped>
.skills-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
h4 {
  margin: 0;
}

.note {
  color: var(--color-text-muted);
}

.count {
  margin: 0;
}

.skills {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.toggle,
.fixed,
.add-lore button,
.add-lore input {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  min-height: var(--touch-target-min);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  color: var(--color-text);
}

.attribute {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

/* A picked skill is marked by weight, an outline and a check, never colour alone. */
.toggle[aria-pressed='true'] {
  outline: 2px solid var(--color-accent);
  font-weight: 700;
}

.toggle[aria-pressed='true']::before {
  content: '✓ ';
}

.fixed {
  font-weight: 700;
  border-style: dashed;
}

.lore {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.add-lore {
  display: flex;
  align-items: flex-end;
  gap: var(--space-2);
}

.add-lore label {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.add-lore button {
  width: auto;
}

.warning {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  font-weight: 600;
}
</style>
