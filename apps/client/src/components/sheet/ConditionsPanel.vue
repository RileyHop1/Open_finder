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
 */
import type { Actor } from '@hearthtable/core';
import { characterDataSchema, npcDataSchema } from '@hearthtable/pf2e';
import { computed, onMounted, ref } from 'vue';

import { type EntrySummary, searchCompendium } from '../../api/compendium.js';
import { titleCase } from './format.js';
import NumberField from './NumberField.vue';

const props = defineProps<{ actor: Actor; editable?: boolean }>();
const emit = defineEmits<{
  add: [slug: string, value: number | undefined];
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

function submit(): void {
  const slug = known.value.length > 0 ? chosen.value : slugOf(typed.value);
  if (slug === '') {
    problem.value = 'Choose or type a condition first.';
    return;
  }
  problem.value = undefined;
  const amount =
    typeof value.value === 'number' && Number.isInteger(value.value) && value.value >= 1
      ? Math.min(value.value, 99)
      : undefined;
  emit('add', slug, amount);
  typed.value = '';
  value.value = '';
}
</script>

<template>
  <section class="conditions-panel" aria-labelledby="conditions-heading">
    <h4 id="conditions-heading">Conditions</h4>

    <p v-if="conditions.length === 0" class="empty">No conditions.</p>
    <ul v-else class="condition-list">
      <li v-for="condition in conditions" :key="condition.slug" class="condition">
        <span class="condition-name">{{ describe(condition) }}</span>
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
