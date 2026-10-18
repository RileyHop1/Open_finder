<script setup lang="ts">
/**
 * The spells step (ADR 0025, `docs/spellcasting.md`): a caster's cantrips and
 * rank 1 spells, from its tradition's list. The picks go in `build.spells`; when
 * the character is created they become spell items and fill the class's
 * spellcasting lists (cantrips, and a spontaneous caster's repertoire).
 *
 * Nothing is refused (ADR 0023). Another tradition's list can be browsed and
 * picked from, with a note saying it is not the class's own; more cantrips than
 * the class has is counted in words here and warned about on review. A class
 * that does not cast says so, and the step can be skipped.
 */
import type {
  BuildRef,
  CharacterBuild,
  ClassEntry,
  MagicalTradition,
} from '@hearthtable/pf2e';
import { computed, ref, watch } from 'vue';

import {
  type EntrySummary,
  isCompendiumAvailable,
  searchCompendium,
} from '../../api/compendium.js';
import RulesTerm from '../RulesTerm.vue';
import { titleCase } from '../sheet/format.js';
import {
  TRADITIONS,
  castingPlan,
  choiceWords,
  classGifts,
  isPicked,
} from './spellPlan.js';

const props = defineProps<{
  build: CharacterBuild;
  classEntry: ClassEntry | undefined;
}>();
const emit = defineEmits<{ toggle: [which: 'cantrips' | 'ranked', ref: BuildRef] }>();

const plan = computed(() =>
  castingPlan(
    props.classEntry?.slug ?? props.build.class?.slug,
    props.build.classChoices,
  ),
);
const tradition = ref<MagicalTradition>('arcane');
watch(
  plan,
  (next) => {
    tradition.value = next?.tradition ?? tradition.value;
  },
  { immediate: true },
);

const available = ref<boolean>();
const cantrips = ref<EntrySummary[]>([]);
const ranked = ref<EntrySummary[]>([]);
const loading = ref(false);
const error = ref<string>();

async function load(): Promise<void> {
  if (plan.value === undefined) {
    return;
  }
  loading.value = true;
  error.value = undefined;
  try {
    available.value ??= await isCompendiumAvailable();
    if (available.value) {
      const [c, r] = await Promise.all([
        searchCompendium({
          kind: 'spell',
          tradition: tradition.value,
          trait: 'cantrip',
          limit: 200,
        }),
        searchCompendium({
          kind: 'spell',
          tradition: tradition.value,
          rank: 1,
          limit: 200,
        }),
      ]);
      cantrips.value = c;
      ranked.value = r.filter((s) => !s.traits.includes('cantrip'));
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'could not load the spells';
  } finally {
    loading.value = false;
  }
}
watch([plan, tradition], load, { immediate: true });

const offList = computed(
  () => plan.value?.tradition !== undefined && tradition.value !== plan.value.tradition,
);
const cantripCount = computed(() => props.build.spells.cantrips.length);
const rankedCount = computed(() => props.build.spells.ranked.length);
const gifts = computed(() =>
  classGifts(props.classEntry?.slug ?? props.build.class?.slug, props.build.classChoices),
);
const WHY: Readonly<Record<string, string>> = {
  cantrip: 'a cantrip, in addition to the ones you choose',
  focus: 'a focus spell, cast with a Focus Point',
};
const refOf = (s: EntrySummary): BuildRef => ({ packId: s.packId, slug: s.slug });
</script>

<template>
  <section class="spells-step" aria-labelledby="spells-step-title">
    <h3 id="spells-step-title">Spells</h3>

    <p v-if="plan === undefined" class="note">
      {{
        classEntry === undefined && build.class === undefined
          ? 'Pick a class first. If it casts spells, you choose them here.'
          : 'This class does not cast spells, so there is nothing to choose here.'
      }}
    </p>

    <template v-else>
      <p v-if="plan.traditionChoice !== undefined" class="note">
        <template v-if="plan.tradition !== undefined">
          Your {{ choiceWords(plan.traditionChoice) }} gives you the
          {{ titleCase(plan.tradition) }} list.
        </template>
        <template v-else>
          Your {{ choiceWords(plan.traditionChoice) }} decides which list you cast from.
          Until the app knows it (choose it in the Class choices step), pick the list that
          goes with it below.
        </template>
      </p>

      <label class="tradition">
        Spell list
        <select v-model="tradition">
          <option v-for="t in TRADITIONS" :key="t" :value="t">
            {{ titleCase(t) }}{{ t === plan.tradition ? ' (your class)' : '' }}
          </option>
        </select>
      </label>
      <p v-if="offList" class="warning" role="status">
        This is not your class's list. You can still pick from it; check with your GM.
      </p>

      <p v-if="available === false" class="note">
        No game content has been imported yet, so there are no spells to choose from.
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="loading" role="status">Loading spells…</p>

      <section
        v-if="
          gifts.spells.length > 0 ||
          gifts.focusPoints > 0 ||
          gifts.pending.length > 0 ||
          gifts.font !== undefined
        "
        class="gifts"
        aria-labelledby="spells-gifts-title"
      >
        <h4 id="spells-gifts-title">Your class also gives you</h4>
        <ul>
          <li v-for="gift in gifts.spells" :key="gift.slug">
            <RulesTerm
              term-kind="spell"
              :slug="gift.slug"
              :label="titleCase(gift.slug)"
            />:
            {{
              gift.why === 'choice'
                ? `from your ${choiceWords(gift.choice ?? '')}`
                : WHY[gift.why]
            }}
          </li>
          <li v-if="gifts.font !== undefined">
            {{ gifts.font.name }}: {{ gifts.font.count }} extra slots at your highest
            rank, each holding
            <template v-if="gifts.font.spell !== undefined">
              <RulesTerm
                term-kind="spell"
                :slug="gifts.font.spell"
                :label="titleCase(gifts.font.spell)"
              />
            </template>
            <template v-else>
              {{ gifts.font.options.map(titleCase).join(' or ') }}, once you choose your
              font (Class choices step)
            </template>
          </li>
          <li v-if="gifts.focusPoints > 0">
            {{ gifts.focusPoints }} Focus Point{{ gifts.focusPoints === 1 ? '' : 's' }}
          </li>
        </ul>
        <p v-for="choice in gifts.pending" :key="choice" class="note">
          Your {{ choiceWords(choice) }} adds a spell once you choose it (Class choices
          step).
        </p>
        <p class="note">These are not counted against the spells you choose below.</p>
      </section>

      <fieldset class="picks">
        <legend>Cantrips</legend>
        <p class="count" :class="{ over: cantripCount > plan.cantrips }">
          {{ cantripCount }} of {{ plan.cantrips }} chosen{{
            cantripCount > plan.cantrips
              ? ` (${cantripCount - plan.cantrips} more than your class has)`
              : ''
          }}
        </p>
        <ul>
          <li v-for="s in cantrips" :key="s.slug">
            <label class="check">
              <input
                type="checkbox"
                :checked="isPicked(build.spells.cantrips, refOf(s))"
                @change="emit('toggle', 'cantrips', refOf(s))"
              />
              <span class="visually-hidden">Choose {{ s.name }}</span>
            </label>
            <RulesTerm term-kind="spell" :slug="s.slug" :label="s.name" />
          </li>
        </ul>
      </fieldset>

      <fieldset class="picks">
        <legend>{{ plan.rankedLabel }}</legend>
        <p
          v-if="plan.known !== undefined"
          class="count"
          :class="{ over: rankedCount > plan.known }"
        >
          {{ rankedCount }} of {{ plan.known }} chosen{{
            rankedCount > plan.known
              ? ` (${rankedCount - plan.known} more than your repertoire holds)`
              : ''
          }}
        </p>
        <p v-else class="count">{{ rankedCount }} chosen</p>
        <ul>
          <li v-for="s in ranked" :key="s.slug">
            <label class="check">
              <input
                type="checkbox"
                :checked="isPicked(build.spells.ranked, refOf(s))"
                @change="emit('toggle', 'ranked', refOf(s))"
              />
              <span class="visually-hidden">Choose {{ s.name }}</span>
            </label>
            <RulesTerm term-kind="spell" :slug="s.slug" :label="s.name" />
          </li>
        </ul>
      </fieldset>
    </template>
  </section>
</template>

<style scoped>
.spells-step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

h3,
p {
  margin: 0;
}

.note {
  color: var(--color-text-muted);
}

.gifts h4 {
  margin: 0 0 var(--space-1);
}

.gifts ul {
  margin: 0 0 var(--space-1);
  padding-left: var(--space-4);
}

.warning,
.count.over {
  font-weight: bold;
}

.tradition {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.picks ul {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: var(--space-1);
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.picks li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
  cursor: pointer;
}

input[type='checkbox'] {
  width: 1.5rem;
  height: 1.5rem;
}

select {
  min-height: var(--touch-target-min);
}
</style>
