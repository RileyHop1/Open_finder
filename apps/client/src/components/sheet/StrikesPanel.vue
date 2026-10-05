<script setup lang="ts">
/**
 * A character's strikes: one per equipped weapon, from `prepareCharacter` (the
 * same numbers the server rolls with). Each shows the attack bonus for the
 * first, second, and third attack of a turn -- the second and third carry the
 * Multiple Attack Penalty -- and a normal and a critical damage roll. The
 * server does not count a turn's attacks until the combat tracker exists
 * (milestone 5), so the player chooses which attack this is by which button
 * they press; the penalty is part of what each button says.
 *
 * Like the sheet, this never talks to the server: it emits what was asked for.
 * Unarmed strikes are not modeled yet, and the empty state says so.
 *
 * Each attack total is also its own `StatBreakdown`, next to (not instead
 * of) the Roll button: the two can't share one element, since `StatBreakdown`
 * is itself a button and a button can't nest inside another one.
 */
import type { Actor } from '@hearthtable/core';
import {
  characterDataSchema,
  npcDataSchema,
  prepareCharacter,
  prepareNpc,
} from '@hearthtable/pf2e';
import { computed } from 'vue';

import StatBreakdown from '../StatBreakdown.vue';
import { signed } from './format.js';

const props = defineProps<{ actor: Actor; rollable?: boolean }>();
const emit = defineEmits<{
  attack: [itemId: string, attackNumber: 1 | 2 | 3];
  damage: [itemId: string, critical: boolean];
}>();

const ATTACK_LABELS = ['1st', '2nd', '3rd'] as const;

/**
 * What a roll names: a character's strike by its weapon's item id, a monster's by
 * its strike key (`TableView` sends `itemId` or `strikeKey` to match).
 */
const strikes = computed(() => {
  if (props.actor.kind === 'npc') {
    const npc = npcDataSchema.safeParse(props.actor.system);
    return npc.success
      ? prepareNpc(npc.data).strikes.map((strike) => ({ ...strike, id: strike.key }))
      : [];
  }
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success
    ? prepareCharacter(parsed.data).strikes.map((strike) => ({
        ...strike,
        id: strike.itemId,
      }))
    : [];
});

/** "1d8+4 slashing": what a damage roll will roll, so the player sees it before pressing. */
function dice(components: readonly { expression: string; damageType: string }[]): string {
  return components.map((c) => `${c.expression} ${c.damageType}`).join(' + ');
}
</script>

<template>
  <section class="strikes" aria-labelledby="strikes-heading">
    <h4 id="strikes-heading">Strikes</h4>

    <p v-if="strikes.length === 0 && actor.kind === 'npc'" class="empty">
      This monster has no strikes.
    </p>
    <p v-else-if="strikes.length === 0" class="empty">
      No equipped weapon. Equip one under Items to strike with it. (Unarmed strikes are
      not modeled yet.)
    </p>

    <ul v-else class="strike-list">
      <li v-for="strike in strikes" :key="strike.key" class="strike">
        <p class="strike-name">{{ strike.name }}</p>

        <ul class="attacks" :aria-label="`${strike.name} attacks`">
          <li v-for="(attack, index) in strike.attacks" :key="index">
            <StatBreakdown
              :label="`${strike.name} ${ATTACK_LABELS[index]} attack`"
              :statistic="attack"
            >
              {{ ATTACK_LABELS[index] }} {{ signed(attack.total) }}
            </StatBreakdown>
            <button
              v-if="rollable"
              type="button"
              :aria-label="`Roll ${strike.name} ${ATTACK_LABELS[index]} attack, ${signed(attack.total)}`"
              @click="emit('attack', strike.id, (index + 1) as 1 | 2 | 3)"
            >
              Roll
            </button>
          </li>
        </ul>

        <p class="damage-line">
          Damage {{ dice(strike.damage.normal) }}
          <span class="crit">· critical {{ dice(strike.damage.critical) }}</span>
        </p>
        <p v-if="rollable" class="damage-buttons">
          <button
            type="button"
            :aria-label="`Roll ${strike.name} damage`"
            @click="emit('damage', strike.id, false)"
          >
            Damage
          </button>
          <button
            type="button"
            :aria-label="`Roll ${strike.name} critical damage`"
            @click="emit('damage', strike.id, true)"
          >
            Critical damage
          </button>
        </p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h4,
p {
  margin: 0;
}

.strikes {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.strike-list,
.attacks {
  list-style: none;
  margin: 0;
  padding: 0;
}

.strike-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.strike {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.strike-name {
  font-weight: 600;
}

.attacks,
.damage-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.attacks li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

button {
  min-height: var(--touch-target-min);
}

.empty,
.crit {
  color: var(--color-text-muted);
}
</style>
