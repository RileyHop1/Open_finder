<script setup lang="ts">
/**
 * A character's sheet: header, attributes, defenses, proficiencies, and
 * skills. Every number comes from `prepareCharacter` (the same function the
 * server uses to roll), run here in the browser on each change, so what the
 * sheet shows is what a roll uses. Ranks are written out in words rather than
 * shown by colour, so nothing here relies on colour alone.
 *
 * **Edit mode** (owner or GM only, via `editable`) turns the stored values into
 * labelled inputs in place, and the totals beside them recompute as you type:
 * hand-building a character is changing a number and watching what it does.
 * This component never talks to the server; each committed edit is emitted as
 * a `change` of dotted paths (`system.attributes.str`) for the parent to send
 * as one `actor.update`. Direct entry of HP and every rank is also the GM's
 * override path: nothing on the sheet is locked to what the rules compute.
 *
 * The breakdown on every number is milestone 6.
 */
import type { Actor } from '@hearthtable/core';
import type { ProficiencyRank } from '@hearthtable/pf2e';
import { ATTRIBUTES, characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { computed, ref } from 'vue';

import { signed, titleCase } from './format.js';
import NumberField from './NumberField.vue';
import RankSelect from './RankSelect.vue';
import TextField from './TextField.vue';

const props = defineProps<{ actor: Actor; editable?: boolean }>();
const emit = defineEmits<{ change: [changes: Record<string, unknown>] }>();

const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const WEAPON_CATEGORIES = ['unarmed', 'simple', 'martial', 'advanced'] as const;
const ARMOR_CATEGORIES = ['unarmored', 'light', 'medium', 'heavy'] as const;

const editing = ref(false);
const isEditing = computed(() => editing.value && props.editable === true);
const newLore = ref('');

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

function set(path: string, value: unknown): void {
  emit('change', { [path]: value });
}

/** Saves a name for ancestry/heritage/background/class; an empty name removes the reference. */
function setReference(field: string, name: string): void {
  set(`system.${field}`, name.length === 0 ? null : { name });
}

function addLore(): void {
  const words = newLore.value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const slug = words.replace(/^-+|-+$/g, '').replace(/-lore$/, '');
  if (slug.length === 0) {
    return;
  }
  set(`system.ranks.skills.${slug}-lore`, 'trained');
  newLore.value = '';
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
      slug: key.slice('skill:'.length),
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
        <button
          v-if="editable"
          type="button"
          class="edit-toggle"
          :aria-pressed="editing"
          @click="editing = !editing"
        >
          {{ editing ? 'Done editing' : 'Edit character' }}
        </button>
      </header>

      <section v-if="isEditing" class="editor" aria-labelledby="details-heading">
        <h4 id="details-heading">Details</h4>
        <div class="fields">
          <TextField
            label="Name"
            :value="actor.name"
            required
            @commit="(v) => set('name', v)"
          />
          <NumberField
            label="Level"
            :value="data.level"
            :min="1"
            :max="20"
            @commit="(v) => set('system.level', v)"
          />
          <TextField
            label="Ancestry"
            :value="data.ancestry?.name ?? ''"
            @commit="(v) => setReference('ancestry', v)"
          />
          <TextField
            label="Heritage"
            :value="data.heritage?.name ?? ''"
            @commit="(v) => setReference('heritage', v)"
          />
          <TextField
            label="Background"
            :value="data.background?.name ?? ''"
            @commit="(v) => setReference('background', v)"
          />
          <TextField
            label="Class"
            :value="data.class?.name ?? ''"
            @commit="(v) => setReference('class', v)"
          />
          <label class="key-attribute">
            Key attribute
            <select
              :value="data.keyAttribute"
              @change="
                (e) => set('system.keyAttribute', (e.target as HTMLSelectElement).value)
              "
            >
              <option v-for="a in ATTRIBUTES" :key="a" :value="a">
                {{ ATTRIBUTE_NAMES[a] }}
              </option>
            </select>
          </label>
          <NumberField
            label="Ancestry Hit Points"
            :value="data.ancestryHp"
            :min="0"
            @commit="(v) => set('system.ancestryHp', v)"
          />
          <NumberField
            label="Class Hit Points per level"
            :value="data.classHp"
            :min="0"
            @commit="(v) => set('system.classHp', v)"
          />
          <NumberField
            label="Current Hit Points"
            :value="data.hp.current"
            :min="0"
            @commit="(v) => set('system.hp.current', v)"
          />
          <NumberField
            label="Temporary Hit Points"
            :value="data.hp.temp"
            :min="0"
            @commit="(v) => set('system.hp.temp', v)"
          />
        </div>
      </section>

      <section aria-labelledby="attributes-heading">
        <h4 id="attributes-heading">Attributes</h4>
        <ul class="attributes">
          <li v-for="key in ATTRIBUTES" :key="key">
            <template v-if="isEditing">
              <NumberField
                :label="ATTRIBUTE_NAMES[key] ?? key"
                :value="data.attributes[key]"
                :min="-5"
                :max="10"
                @commit="(v) => set(`system.attributes.${key}`, v)"
              />
            </template>
            <template v-else>
              <span class="name">{{ ATTRIBUTE_NAMES[key] }}</span>
              <span class="value">{{ signed(data.attributes[key]) }}</span>
            </template>
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
                <RankSelect
                  v-if="isEditing && row.rank !== undefined"
                  :label="`${row.label} rank`"
                  :value="row.rank"
                  @commit="(r: ProficiencyRank) => set(`system.ranks.${row.key}`, r)"
                />
                <template v-else>{{
                  row.rank === undefined ? '' : titleCase(row.rank)
                }}</template>
              </td>
              <td class="total">
                {{ row.bonus ? signed(total(row.key)) : total(row.key) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="proficiencies-heading">
        <h4 id="proficiencies-heading">Weapon and armor proficiencies</h4>
        <table class="statistics">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Rank</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="category in WEAPON_CATEGORIES" :key="`weapon-${category}`">
              <th scope="row">{{ titleCase(category) }} weapons</th>
              <td class="rank">
                <RankSelect
                  v-if="isEditing"
                  :label="`${titleCase(category)} weapons rank`"
                  :value="data.ranks.weapons[category]"
                  @commit="
                    (r: ProficiencyRank) => set(`system.ranks.weapons.${category}`, r)
                  "
                />
                <template v-else>{{ titleCase(data.ranks.weapons[category]) }}</template>
              </td>
            </tr>
            <tr v-for="category in ARMOR_CATEGORIES" :key="`armor-${category}`">
              <th scope="row">
                {{
                  category === 'unarmored' ? 'Unarmored' : `${titleCase(category)} armor`
                }}
              </th>
              <td class="rank">
                <RankSelect
                  v-if="isEditing"
                  :label="`${titleCase(category)} armor rank`"
                  :value="data.ranks.armor[category]"
                  @commit="
                    (r: ProficiencyRank) => set(`system.ranks.armor.${category}`, r)
                  "
                />
                <template v-else>{{ titleCase(data.ranks.armor[category]) }}</template>
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
              <td class="rank">
                <RankSelect
                  v-if="isEditing"
                  :label="`${skill.label} rank`"
                  :value="skill.rank"
                  @commit="
                    (r: ProficiencyRank) => set(`system.ranks.skills.${skill.slug}`, r)
                  "
                />
                <template v-else>{{ titleCase(skill.rank) }}</template>
              </td>
              <td class="total">{{ signed(total(skill.key)) }}</td>
            </tr>
          </tbody>
        </table>
        <form v-if="isEditing" class="add-lore" @submit.prevent="addLore">
          <label for="new-lore">New Lore skill</label>
          <input id="new-lore" v-model="newLore" type="text" autocomplete="off" />
          <button type="submit">Add Lore skill</button>
        </form>
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

.edit-toggle {
  margin-left: auto;
  min-height: var(--touch-target-min);
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

.fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin-top: var(--space-2);
}

.key-attribute select {
  min-height: var(--touch-target-min);
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

.add-lore input,
.add-lore button {
  min-height: var(--touch-target-min);
}

.add-lore {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
