<script setup lang="ts">
/**
 * A character's spellcasting (ADR 0025, `docs/spellcasting.md`): the focus pool,
 * each entry's spell attack and DC, slots left per rank, and the spells that can
 * be cast. Numbers come from `prepareCharacter` (the same ones the server rolls
 * with) and the layout from `spellsView`; like the rest of the sheet it never
 * talks to the server, it emits what was asked for.
 *
 * Nothing here is ever disabled for having nothing to spend (ADR 0023): a cast
 * past the slots left still goes through, the slot count reads "-1", and the
 * chat card says it was overspent in words. The pips are decoration; the counts
 * are text, so nothing rests on colour or shape alone.
 */
import type { Actor, Statistic } from '@hearthtable/core';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { computed, reactive } from 'vue';

import RulesTerm from '../RulesTerm.vue';
import StatBreakdown from '../StatBreakdown.vue';
import { signed } from './format.js';
import {
  type CastableSpell,
  type EntryView,
  type RankSlots,
  spellsView,
} from './spellsModel.js';

const props = defineProps<{ actor: Actor; editable?: boolean; rollable?: boolean }>();
const emit = defineEmits<{
  cast: [payload: { itemId: string; entryId?: string; rank?: number; focus?: boolean }];
  refocus: [];
  rest: [];
  roll: [statistic: string];
}>();

const data = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? parsed.data : undefined;
});
const view = computed(() =>
  data.value === undefined ? undefined : spellsView(data.value),
);
const statistics = computed(() =>
  data.value === undefined ? {} : prepareCharacter(data.value).statistics,
);

/** The rank each spontaneous spell is cast at, when the player has chosen a higher one. */
const heighten = reactive<Record<string, number>>({});

const KIND_LABEL = { prepared: 'Prepared', spontaneous: 'Spontaneous' } as const;

function statisticOf(key: string): Statistic {
  return statistics.value[key] ?? { total: 0, modifiers: [] };
}

/** "2 of 3 left", or "-1" past the maximum: the words the pips stand for. */
function slotText(slots: RankSlots): string {
  if (slots.over > 0) {
    return `${slots.max - slots.used} (${slots.over} over the maximum)`;
  }
  return `${slots.left} of ${slots.max} left`;
}

function castFrom(view: EntryView, spell: CastableSpell, rank: number): void {
  emit('cast', { itemId: spell.itemId, entryId: view.entry.id, rank });
}

/** A heighten choice is per spell per entry, so two entries can cast the same spell differently. */
function heightenKey(view: EntryView, spell: CastableSpell): string {
  return `${view.entry.id}:${spell.itemId}`;
}

function heightenedRank(view: EntryView, spell: CastableSpell, group: number): number {
  return heighten[heightenKey(view, spell)] ?? group;
}

function rankOptions(view: EntryView, spell: CastableSpell): number[] {
  const top = Math.max(view.highestRank, spell.rank);
  return Array.from({ length: top - spell.rank + 1 }, (_, i) => spell.rank + i);
}

function onHeighten(view: EntryView, spell: CastableSpell, event: Event): void {
  heighten[heightenKey(view, spell)] = Number((event.target as HTMLSelectElement).value);
}

function pips(slots: RankSlots): { filled: boolean }[] {
  return Array.from({ length: Math.max(slots.max, slots.used) }, (_, i) => ({
    filled: i >= slots.used,
  }));
}
</script>

<template>
  <section v-if="view?.any" class="spells" aria-labelledby="spellcasting-heading">
    <h4 id="spellcasting-heading">Spellcasting</h4>

    <section v-if="view.focus.max > 0" class="focus" aria-label="Focus points">
      <p>
        <strong>Focus points</strong>
        {{ view.focus.current }} of {{ view.focus.max }}
        <span class="pips" aria-hidden="true">
          <span
            v-for="n in view.focus.max"
            :key="n"
            class="pip"
            :class="{ filled: n <= view.focus.current }"
          />
        </span>
      </p>
      <button v-if="editable" type="button" @click="emit('refocus')">Refocus</button>
    </section>

    <p v-if="editable && view.entries.length > 0" class="rest">
      <button type="button" @click="emit('rest')">Rest (daily preparation)</button>
      <span class="hint">Every slot comes back. Focus points do not.</span>
    </p>

    <section
      v-for="entry in view.entries"
      :key="entry.entry.id"
      class="entry"
      :aria-label="entry.entry.name"
    >
      <h5>
        {{ entry.entry.name }}
        <span class="meta"
          >· {{ entry.entry.tradition }} · {{ KIND_LABEL[entry.entry.kind] }}</span
        >
      </h5>

      <p class="numbers">
        <span>
          Spell attack
          <StatBreakdown
            :label="`${entry.entry.name} spell attack`"
            :statistic="statisticOf(entry.attackKey)"
          >
            {{ signed(statisticOf(entry.attackKey).total) }}
          </StatBreakdown>
          <button
            v-if="rollable"
            type="button"
            :aria-label="`Roll ${entry.entry.name} spell attack, ${signed(statisticOf(entry.attackKey).total)}`"
            @click="emit('roll', entry.attackKey)"
          >
            Roll
          </button>
        </span>
        <span>
          Spell DC
          <StatBreakdown
            :label="`${entry.entry.name} spell DC`"
            :statistic="statisticOf(entry.dcKey)"
          >
            {{ statisticOf(entry.dcKey).total }}
          </StatBreakdown>
        </span>
      </p>

      <ul v-if="entry.ranks.length > 0" class="slots" aria-label="Spell slots">
        <li v-for="slots in entry.ranks" :key="slots.rank">
          <span class="rank">Rank {{ slots.rank }}</span>
          <span class="pips" aria-hidden="true">
            <span
              v-for="(pip, i) in pips(slots)"
              :key="i"
              class="pip"
              :class="{ filled: pip.filled, over: i >= slots.max }"
            />
          </span>
          <span class="count" :class="{ over: slots.over > 0 }">{{
            slotText(slots)
          }}</span>
        </li>
      </ul>

      <section v-if="entry.cantrips.length > 0" class="spell-group" aria-label="Cantrips">
        <h6>Cantrips</h6>
        <ul>
          <li v-for="spell in entry.cantrips" :key="spell.itemId">
            <RulesTerm term-kind="spell" :slug="spell.slug" :label="spell.name" />
            <button
              v-if="editable"
              type="button"
              :aria-label="`Cast ${spell.name}`"
              @click="emit('cast', { itemId: spell.itemId, entryId: entry.entry.id })"
            >
              Cast
            </button>
          </li>
        </ul>
      </section>

      <section
        v-for="group in entry.groups"
        :key="group.rank"
        class="spell-group"
        :aria-label="
          entry.entry.kind === 'prepared'
            ? `Rank ${group.rank} prepared`
            : `Rank ${group.rank} known`
        "
      >
        <h6>
          Rank {{ group.rank }}
          {{ entry.entry.kind === 'prepared' ? 'prepared' : 'known' }}
        </h6>
        <ul>
          <li v-for="(spell, i) in group.spells" :key="`${spell.itemId}-${i}`">
            <RulesTerm term-kind="spell" :slug="spell.slug" :label="spell.name" />
            <span v-if="spell.expended" class="cast-mark">(cast)</span>
            <label
              v-if="
                editable &&
                entry.entry.kind === 'spontaneous' &&
                rankOptions(entry, spell).length > 1
              "
              class="heighten"
            >
              <span class="visually-hidden">Cast {{ spell.name }} at rank</span>
              <select
                :value="heightenedRank(entry, spell, group.rank)"
                @change="onHeighten(entry, spell, $event)"
              >
                <option v-for="r in rankOptions(entry, spell)" :key="r" :value="r">
                  Rank {{ r }}
                </option>
              </select>
            </label>
            <button
              v-if="editable"
              type="button"
              :aria-label="`${spell.expended ? 'Cast again' : 'Cast'} ${spell.name}`"
              @click="castFrom(entry, spell, heightenedRank(entry, spell, group.rank))"
            >
              {{ spell.expended ? 'Cast again' : 'Cast' }}
            </button>
          </li>
        </ul>
      </section>

      <p v-if="entry.missing > 0" class="note">
        {{ entry.missing }} spell{{ entry.missing === 1 ? '' : 's' }} listed here
        {{ entry.missing === 1 ? 'is' : 'are' }} no longer on this character.
      </p>
    </section>

    <section
      v-if="view.focusSpells.length > 0"
      class="spell-group"
      aria-label="Focus spells"
    >
      <h6>Focus spells</h6>
      <ul>
        <li v-for="spell in view.focusSpells" :key="spell.itemId">
          <RulesTerm term-kind="spell" :slug="spell.slug" :label="spell.name" />
          <button
            v-if="editable"
            type="button"
            :aria-label="`Cast ${spell.name} as a focus spell`"
            @click="emit('cast', { itemId: spell.itemId, focus: true })"
          >
            Cast (focus point)
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
h4,
h5,
h6,
p {
  margin: 0;
}

.spells,
.entry {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.entry {
  padding: var(--space-2) var(--space-3);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
}

.meta,
.hint,
.note,
.cast-mark {
  color: var(--color-text-muted);
}

.focus,
.rest,
.numbers,
.slots li,
.spell-group li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.numbers {
  gap: var(--space-4);
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank {
  min-width: 4.5rem;
}

.pips {
  display: inline-flex;
  gap: var(--space-1);
}

/* Filled and hollow differ by more than colour: the hollow pip is outlined only. */
.pip {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid currentcolor;
  border-radius: 50%;
}

.pip.filled {
  background: currentcolor;
}

.pip.over {
  border-style: dashed;
}

.count.over {
  font-weight: bold;
}

button,
select {
  min-height: var(--touch-target-min);
}
</style>
