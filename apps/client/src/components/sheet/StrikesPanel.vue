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
 */
import type { Actor } from '@hearthtable/core';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { computed } from 'vue';

import { signed } from './format.js';

const props = defineProps<{ actor: Actor; rollable?: boolean }>();
const emit = defineEmits<{
  attack: [itemId: string, attackNumber: 1 | 2 | 3];
  damage: [itemId: string, critical: boolean];
}>();

const ATTACK_LABELS = ['1st', '2nd', '3rd'] as const;

const strikes = computed(() => {
  const parsed = characterDataSchema.safeParse(props.actor.system);
  return parsed.success ? prepareCharacter(parsed.data).strikes : [];
});

/** "1d8+4 slashing": what a damage roll will roll, so the player sees it before pressing. */
function dice(components: readonly { expression: string; damageType: string }[]): string {
  return components.map((c) => `${c.expression} ${c.damageType}`).join(' + ');
}
</script>

<template>
  <section class="strikes" aria-labelledby="strikes-heading">
    <h4 id="strikes-heading">Strikes</h4>

    <p v-if="strikes.length === 0" class="empty">
      No equipped weapon. Equip one under Items to strike with it. (Unarmed strikes are
      not modeled yet.)
    </p>

    <ul v-else class="strike-list">
      <li v-for="strike in strikes" :key="strike.key" class="strike">
        <p class="strike-name">{{ strike.name }}</p>

        <ul class="attacks" :aria-label="`${strike.name} attacks`">
          <li v-for="(attack, index) in strike.attacks" :key="index">
            <button
              v-if="rollable"
              type="button"
              :aria-label="`Roll ${strike.name} ${ATTACK_LABELS[index]} attack, ${signed(attack.total)}`"
              @click="emit('attack', strike.itemId, (index + 1) as 1 | 2 | 3)"
            >
              {{ ATTACK_LABELS[index] }} {{ signed(attack.total) }}
            </button>
            <span v-else>{{ ATTACK_LABELS[index] }} {{ signed(attack.total) }}</span>
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
            @click="emit('damage', strike.itemId, false)"
          >
            Damage
          </button>
          <button
            type="button"
            :aria-label="`Roll ${strike.name} critical damage`"
            @click="emit('damage', strike.itemId, true)"
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

button {
  min-height: var(--touch-target-min);
}

.empty,
.crit {
  color: var(--color-text-muted);
}
</style>
