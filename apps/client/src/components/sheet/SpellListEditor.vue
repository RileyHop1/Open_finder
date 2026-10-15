<script setup lang="ts">
/**
 * Hand-editing one spellcasting entry (ADR 0025, `docs/spellcasting.md`): its slot
 * counts, cantrips, and what is prepared (prepared casters) or known (spontaneous
 * ones). Every change is a pure edit from `spellEdits.ts`, emitted as the whole new
 * entry for `actor.setSpellcasting`.
 *
 * Nothing is refused (ADR 0023). A spell above the slot's rank can still be
 * prepared there; a warning says so in words, and the GM rules. A reference to a spell the
 * character no longer has is listed as missing, with a Remove button, so it can
 * be cleared.
 */
import type { SpellcastingEntry } from '@hearthtable/pf2e';
import { computed, ref, useId } from 'vue';

import {
  addCantrip,
  forgetSpell,
  learnSpell,
  prepareSpell,
  removeCantrip,
  setSlotMax,
  slotMax,
  type SpellOption,
  unprepareSpell,
} from './spellEdits.js';

const props = defineProps<{
  entry: SpellcastingEntry;
  /** Every spell item on the character. */
  options: readonly SpellOption[];
}>();
const emit = defineEmits<{ change: [entry: SpellcastingEntry] }>();

const id = useId();
const RANKS = Array.from({ length: 10 }, (_, i) => i + 1);

const byId = computed(() => new Map(props.options.map((o) => [o.itemId, o] as const)));
const nameOf = (itemId: string) => byId.value.get(itemId)?.name ?? '(missing spell)';
const cantripOptions = computed(() =>
  props.options.filter((o) => o.cantrip && !props.entry.cantrips.includes(o.itemId)),
);
const rankedOptions = computed(() => props.options.filter((o) => !o.cantrip));
const learnOptions = computed(() => {
  const entry = props.entry;
  return entry.kind === 'spontaneous'
    ? rankedOptions.value.filter((o) => !entry.repertoire.includes(o.itemId))
    : [];
});
/** Slot ranks worth a field: those with slots, and one above the highest. */
const slotRanks = computed(() => {
  const top = Math.max(0, ...RANKS.filter((r) => slotMax(props.entry, r) > 0));
  return RANKS.filter((r) => r <= Math.min(10, top + 1));
});

const cantripPick = ref('');
const learnPick = ref('');
const preparePick = ref('');
const prepareRank = ref(1);

function change(next: SpellcastingEntry): void {
  emit('change', next);
}

function onSlots(rank: number, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) {
    change(setSlotMax(props.entry, rank, value));
  }
}

function onPickToPrepare(): void {
  // The slot defaults to the spell's own rank; the player can move it up.
  const option = byId.value.get(preparePick.value);
  if (option !== undefined) {
    prepareRank.value = option.rank;
  }
}

function submit(kind: 'cantrip' | 'learn' | 'prepare'): void {
  if (kind === 'cantrip' && cantripPick.value !== '') {
    change(addCantrip(props.entry, cantripPick.value));
    cantripPick.value = '';
  } else if (kind === 'learn' && learnPick.value !== '') {
    change(learnSpell(props.entry, learnPick.value));
    learnPick.value = '';
  } else if (kind === 'prepare' && preparePick.value !== '') {
    change(prepareSpell(props.entry, preparePick.value, prepareRank.value));
    preparePick.value = '';
  }
}
</script>

<template>
  <section class="list-editor" :aria-label="`Edit ${entry.name}`">
    <fieldset>
      <legend>Slots per rank</legend>
      <span v-for="rank in slotRanks" :key="rank" class="slot-field">
        <label :for="`${id}-slots-${rank}`">Rank {{ rank }}</label>
        <input
          :id="`${id}-slots-${rank}`"
          type="number"
          min="0"
          max="20"
          inputmode="numeric"
          :value="slotMax(entry, rank)"
          @change="onSlots(rank, $event)"
        />
      </span>
    </fieldset>

    <fieldset>
      <legend>Cantrips</legend>
      <ul>
        <li v-for="itemId in entry.cantrips" :key="itemId">
          {{ nameOf(itemId) }}
          <button
            type="button"
            :aria-label="`Remove cantrip ${nameOf(itemId)}`"
            @click="change(removeCantrip(entry, itemId))"
          >
            Remove
          </button>
        </li>
      </ul>
      <form class="add" @submit.prevent="submit('cantrip')">
        <label :for="`${id}-cantrip`">Add a cantrip</label>
        <select :id="`${id}-cantrip`" v-model="cantripPick">
          <option value="">Choose…</option>
          <option v-for="o in cantripOptions" :key="o.itemId" :value="o.itemId">
            {{ o.name }}
          </option>
        </select>
        <button type="submit">Add</button>
      </form>
    </fieldset>

    <fieldset v-if="entry.kind === 'prepared'">
      <legend>Prepared</legend>
      <ul>
        <li v-for="(row, index) in entry.prepared" :key="`${row.itemId}-${index}`">
          Rank {{ row.rank }}: {{ nameOf(row.itemId) }}
          <span v-if="row.expended" class="muted">(cast)</span>
          <button
            type="button"
            :aria-label="`Unprepare ${nameOf(row.itemId)} from rank ${row.rank}`"
            @click="change(unprepareSpell(entry, index))"
          >
            Remove
          </button>
        </li>
      </ul>
      <form class="add" @submit.prevent="submit('prepare')">
        <label :for="`${id}-prepare`">Prepare</label>
        <select :id="`${id}-prepare`" v-model="preparePick" @change="onPickToPrepare">
          <option value="">Choose…</option>
          <option v-for="o in rankedOptions" :key="o.itemId" :value="o.itemId">
            {{ o.name }} (rank {{ o.rank }})
          </option>
        </select>
        <label :for="`${id}-prepare-rank`">in a slot of rank</label>
        <select :id="`${id}-prepare-rank`" v-model.number="prepareRank">
          <option v-for="r in RANKS" :key="r" :value="r">{{ r }}</option>
        </select>
        <button type="submit">Prepare</button>
      </form>
      <p
        v-if="(byId.get(preparePick)?.rank ?? 0) > prepareRank"
        class="warning"
        role="status"
      >
        This spell's rank is higher than the slot. It can still be prepared; check with
        your GM.
      </p>
    </fieldset>

    <fieldset v-else>
      <legend>Known spells (repertoire)</legend>
      <ul>
        <li v-for="itemId in entry.repertoire" :key="itemId">
          {{ nameOf(itemId) }}
          <button
            type="button"
            :aria-label="`Forget ${nameOf(itemId)}`"
            @click="change(forgetSpell(entry, itemId))"
          >
            Remove
          </button>
        </li>
      </ul>
      <form class="add" @submit.prevent="submit('learn')">
        <label :for="`${id}-learn`">Learn</label>
        <select :id="`${id}-learn`" v-model="learnPick">
          <option value="">Choose…</option>
          <option v-for="o in learnOptions" :key="o.itemId" :value="o.itemId">
            {{ o.name }} (rank {{ o.rank }})
          </option>
        </select>
        <button type="submit">Learn</button>
      </form>
    </fieldset>

    <p v-if="options.length === 0" class="muted">
      This character has no spells yet. Add them from the compendium below, then choose
      them here.
    </p>
  </section>
</template>

<style scoped>
.list-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
}

ul {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

li,
.add,
.slot-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.slot-field input {
  width: 4rem;
}

.muted {
  color: var(--color-text-muted);
}

.warning {
  flex-basis: 100%;
  margin: 0;
  font-weight: bold;
}

button,
select,
input {
  min-height: var(--touch-target-min);
}
</style>
