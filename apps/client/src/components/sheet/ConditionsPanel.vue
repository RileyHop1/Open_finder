<script setup lang="ts">
/**
 * A character's conditions: each named in words with its value, so nothing
 * relies on colour or an icon alone. An owner or the GM can add a condition
 * (the ordinary way: a second source of a valued condition keeps the higher
 * value, never the sum), set a valued condition to an exact value (the manual
 * override CLAUDE.md requires beside every automated change; 0 removes it), or
 * remove it. Like the rest of the sheet it never talks to the server: it emits
 * what was asked for and `TableView` sends the operation.
 *
 * Names to pick from come from the imported condition definitions. With none
 * imported yet the panel falls back to typing a name, because the server
 * accepts any well-formed one until definitions exist (`docs/conditions.md`).
 *
 * Adding a condition can also give it a duration (M5 C.7): until removed
 * (the default), a number of rounds, until the start or end of a chosen
 * combatant's turn, sustained, or a calendar span -- the last three end only
 * by hand until spells and the `Calendar` automate them, which the shown
 * text says plainly (`conditionDuration.ts`).
 */
import type { Actor } from '@hearthtable/core';
import {
  characterDataSchema,
  npcDataSchema,
  type ConditionDuration,
  type TurnBoundary,
} from '@hearthtable/pf2e';
import { computed, onMounted, ref } from 'vue';

import { type EntrySummary, searchCompendium } from '../../api/compendium.js';
import { describeDuration } from './conditionDuration.js';
import { titleCase } from './format.js';
import NumberField from './NumberField.vue';

const DURATION_TYPES = [
  'untilRemoved',
  'rounds',
  'turn',
  'sustained',
  'minutes',
  'hours',
  'days',
] as const;
type DurationType = (typeof DURATION_TYPES)[number];

const DURATION_LABELS: Readonly<Record<DurationType, string>> = {
  untilRemoved: 'Until removed',
  rounds: 'For some rounds',
  turn: "Until a combatant's turn",
  sustained: 'Until stopped (sustained)',
  minutes: 'For some minutes',
  hours: 'For some hours',
  days: 'For some days',
};

const props = withDefaults(
  defineProps<{
    actor: Actor;
    editable?: boolean;
    /** Who can be picked for a `turn` duration, and how their name reads. */
    combatants?: readonly { id: string; label: string }[];
  }>(),
  { combatants: () => [] },
);
const emit = defineEmits<{
  add: [slug: string, value: number | undefined, duration: ConditionDuration | undefined];
  set: [slug: string, value: number];
  remove: [slug: string];
}>();

const conditions = computed(() => {
  const parsed = (
    props.actor.kind === 'npc' ? npcDataSchema : characterDataSchema
  ).safeParse(props.actor.system);
  return parsed.success ? parsed.data.conditions : [];
});

/** Imported condition definitions, if any, for the picker. */
const known = ref<EntrySummary[]>([]);
const chosen = ref('');
const typed = ref('');
const value = ref<number | ''>('');
const problem = ref<string>();

const durationType = ref<DurationType>('untilRemoved');
/** Shared by `rounds`, `minutes`, `hours` and `days` -- only one is shown at a time. */
const durationAmount = ref<number | ''>('');
const durationCombatantId = ref('');
const durationBoundary = ref<TurnBoundary>('end');

/** A combatant's name, for a condition's duration, by id. */
function combatantLabel(combatantId: string): string | undefined {
  return props.combatants.find((c) => c.id === combatantId)?.label;
}

onMounted(async () => {
  if (props.editable !== true) {
    return;
  }
  try {
    known.value = await searchCompendium({ kind: 'condition', limit: 200 });
  } catch {
    // No picker list is not an error: typing a name still works.
    known.value = [];
  }
});

/** "Frightened 2" when read-only; just the name when editing, where the value is its own labelled input. */
function describe(condition: { slug: string; value?: number | undefined }): string {
  const name = titleCase(condition.slug);
  return props.editable !== true && condition.value !== undefined
    ? `${name} ${condition.value}`
    : name;
}

const slugOf = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A positive integer capped at `max`, or undefined for anything else (an empty box included). */
function integerAmount(amount: number | '', max: number): number | undefined {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= 1
    ? Math.min(amount, max)
    : undefined;
}

/** The add-form's duration fields, as a payload -- undefined for `untilRemoved` or an incomplete choice. */
function buildDuration(): ConditionDuration | undefined {
  switch (durationType.value) {
    case 'untilRemoved':
      return undefined;
    case 'rounds': {
      const remaining = integerAmount(durationAmount.value, 99);
      return remaining === undefined ? undefined : { type: 'rounds', remaining };
    }
    case 'minutes':
    case 'hours':
    case 'days': {
      const remaining = integerAmount(durationAmount.value, 9999);
      return remaining === undefined
        ? undefined
        : { type: durationType.value, remaining };
    }
    case 'turn':
      return durationCombatantId.value === ''
        ? undefined
        : {
            type: 'turn',
            combatantId: durationCombatantId.value,
            boundary: durationBoundary.value,
          };
    case 'sustained':
      return { type: 'sustained' };
  }
}

function submit(): void {
  const slug = known.value.length > 0 ? chosen.value : slugOf(typed.value);
  if (slug === '') {
    problem.value = 'Choose or type a condition first.';
    return;
  }
  problem.value = undefined;
  const amount = integerAmount(value.value, 99);
  emit('add', slug, amount, buildDuration());
  typed.value = '';
  value.value = '';
  durationType.value = 'untilRemoved';
  durationAmount.value = '';
  durationCombatantId.value = '';
  durationBoundary.value = 'end';
}
</script>

<template>
  <section class="conditions-panel" aria-labelledby="conditions-heading">
    <h4 id="conditions-heading">Conditions</h4>

    <p v-if="conditions.length === 0" class="empty">No conditions.</p>
    <ul v-else class="condition-list">
      <li v-for="condition in conditions" :key="condition.slug" class="condition">
        <span class="condition-name">{{ describe(condition) }}</span>
        <span
          v-if="describeDuration(condition.duration, combatantLabel)"
          class="condition-duration"
        >
          {{ describeDuration(condition.duration, combatantLabel) }}
        </span>
        <template v-if="editable">
          <NumberField
            v-if="condition.value !== undefined"
            :label="`Value of ${titleCase(condition.slug)}`"
            :value="condition.value"
            :min="0"
            :max="99"
            @commit="(n) => emit('set', condition.slug, n)"
          />
          <button
            type="button"
            :aria-label="`Remove ${titleCase(condition.slug)}`"
            @click="emit('remove', condition.slug)"
          >
            Remove
          </button>
        </template>
      </li>
    </ul>

    <form v-if="editable" class="add-condition" @submit.prevent="submit">
      <template v-if="known.length > 0">
        <label for="condition-pick">Condition</label>
        <select id="condition-pick" v-model="chosen">
          <option value="" disabled>Choose…</option>
          <option v-for="entry in known" :key="entry.slug" :value="entry.slug">
            {{ entry.name }}
          </option>
        </select>
      </template>
      <template v-else>
        <label for="condition-name">Condition name</label>
        <input id="condition-name" v-model="typed" type="text" autocomplete="off" />
      </template>
      <label for="condition-value">Value (if it has one)</label>
      <input id="condition-value" v-model.number="value" type="number" min="1" max="99" />

      <label for="condition-duration-type">Ends</label>
      <select id="condition-duration-type" v-model="durationType">
        <option
          v-for="type in DURATION_TYPES.filter(
            (t) => t !== 'turn' || combatants.length > 0,
          )"
          :key="type"
          :value="type"
        >
          {{ DURATION_LABELS[type] }}
        </option>
      </select>

      <template v-if="durationType === 'rounds'">
        <label for="condition-duration-amount">Rounds</label>
        <input
          id="condition-duration-amount"
          v-model.number="durationAmount"
          type="number"
          min="1"
          max="99"
        />
      </template>

      <template
        v-else-if="
          durationType === 'minutes' ||
          durationType === 'hours' ||
          durationType === 'days'
        "
      >
        <label for="condition-duration-amount">{{ titleCase(durationType) }}</label>
        <input
          id="condition-duration-amount"
          v-model.number="durationAmount"
          type="number"
          min="1"
          max="9999"
        />
      </template>

      <template v-else-if="durationType === 'turn'">
        <label for="condition-duration-combatant">Whose turn</label>
        <select id="condition-duration-combatant" v-model="durationCombatantId">
          <option value="" disabled>Choose…</option>
          <option v-for="c in combatants" :key="c.id" :value="c.id">{{ c.label }}</option>
        </select>
        <label for="condition-duration-boundary">When</label>
        <select id="condition-duration-boundary" v-model="durationBoundary">
          <option value="start">Start of their turn</option>
          <option value="end">End of their turn</option>
        </select>
      </template>

      <button type="submit">Add condition</button>
      <p v-if="problem" role="alert" class="problem">{{ problem }}</p>
    </form>
  </section>
</template>

<style scoped>
h4,
p {
  margin: 0;
}

.conditions-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.condition-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.condition {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.condition-name {
  font-weight: 600;
}

.condition-duration {
  color: var(--color-text-muted);
}

.empty {
  color: var(--color-text-muted);
}

.add-condition {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.add-condition input,
.add-condition select,
.add-condition button,
.condition button {
  min-height: var(--touch-target-min);
}

.add-condition input[type='number'] {
  width: 5rem;
}

.problem {
  flex-basis: 100%;
  color: var(--color-danger);
}
</style>
