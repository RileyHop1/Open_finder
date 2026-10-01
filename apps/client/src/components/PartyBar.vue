<script setup lang="ts">
/**
 * The party bar: one card per member, always on screen (the Owlcat "party
 * bar" in CLAUDE.md's north star). Each card is a single button showing a
 * portrait, the name, hit points as a bar *and* as numbers, and condition
 * badges. Pressing it (click, tap, Enter, or Space) opens that member's
 * sheet.
 *
 * Nothing here relies on colour alone: hit points are always printed ("12 /
 * 20"), "at 0" is said in words, and a condition badge is its name and value.
 * A member without a portrait gets a placeholder -- their initial in a circle
 * -- and the portrait image is decorative (its name is printed beside it).
 *
 * It reads numbers from `prepareCharacter`, the same function the sheet uses,
 * so the bar and the sheet cannot disagree. NPC members, which have no
 * character sheet yet, show their name alone.
 */
import type { Actor } from '@hearthtable/core';
import { characterDataSchema, prepareCharacter } from '@hearthtable/pf2e';
import { computed } from 'vue';

import { titleCase } from './sheet/format.js';

const props = defineProps<{
  members: readonly Actor[];
  selectedId?: string | undefined;
  worldId: string;
}>();
const emit = defineEmits<{ select: [actorId: string] }>();

/** Badges shown per card before the rest fold into "+N more". */
const MAX_BADGES = 3;

interface Card {
  readonly actor: Actor;
  readonly initial: string;
  readonly portraitUrl: string | undefined;
  readonly hp:
    { current: number; max: number; temp: number; percent: number } | undefined;
  readonly badges: string[];
  readonly extraBadges: number;
}

/** "12 / 20 (+5 temp) · at 0": printed in full so the bar is never the only way to read it. */
function hpText(hp: { current: number; max: number; temp: number }): string {
  return [
    `${hp.current} / ${hp.max}`,
    hp.temp > 0 ? ` (+${hp.temp} temp)` : '',
    hp.current === 0 ? ' · at 0' : '',
  ].join('');
}

const cards = computed<Card[]>(() =>
  props.members.map((actor) => {
    const parsed =
      actor.kind === 'character'
        ? characterDataSchema.safeParse(actor.system)
        : undefined;
    const prepared = parsed?.success ? prepareCharacter(parsed.data) : undefined;
    const max = prepared?.hp.max.total ?? 0;
    const conditions = parsed?.success ? parsed.data.conditions : [];
    const badges = conditions.map((c) =>
      c.value === undefined ? titleCase(c.slug) : `${titleCase(c.slug)} ${c.value}`,
    );
    return {
      actor,
      initial: actor.name.trim().charAt(0).toUpperCase() || '?',
      portraitUrl:
        actor.portrait === undefined
          ? undefined
          : `/api/worlds/${props.worldId}/assets/${actor.portrait}`,
      hp:
        prepared === undefined
          ? undefined
          : {
              current: prepared.hp.current,
              max,
              temp: prepared.hp.temp,
              percent:
                max <= 0
                  ? 0
                  : Math.min(100, Math.round((prepared.hp.current / max) * 100)),
            },
      badges: badges.slice(0, MAX_BADGES),
      extraBadges: Math.max(0, badges.length - MAX_BADGES),
    };
  }),
);
</script>

<template>
  <ul v-if="cards.length > 0" class="party-members">
    <li v-for="card in cards" :key="card.actor.id">
      <button
        type="button"
        class="party-member"
        :aria-pressed="card.actor.id === selectedId"
        @click="emit('select', card.actor.id)"
      >
        <img v-if="card.portraitUrl" class="portrait" :src="card.portraitUrl" alt="" />
        <span v-else class="portrait placeholder" aria-hidden="true">{{
          card.initial
        }}</span>

        <span class="details">
          <span class="name">{{ card.actor.name }}</span>
          <template v-if="card.hp">
            <span class="hp-bar" aria-hidden="true">
              <span class="hp-fill" :style="{ width: `${card.hp.percent}%` }"></span>
            </span>
            <span class="hp-text">{{ hpText(card.hp) }}</span>
          </template>
          <span v-if="card.badges.length > 0" class="badges">
            <span v-for="badge in card.badges" :key="badge" class="badge">{{
              badge
            }}</span>
            <span v-if="card.extraBadges > 0" class="badge"
              >+{{ card.extraBadges }} more</span
            >
          </span>
        </span>
      </button>
    </li>
  </ul>
  <p v-else class="empty">No party yet. The GM adds characters to it.</p>
</template>

<style scoped>
.party-members {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.party-member {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 11rem;
  min-height: var(--touch-target-min);
  padding: var(--space-2);
  text-align: left;
}

.portrait {
  flex: none;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  object-fit: cover;
}

.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  color: var(--color-text);
  font-weight: 700;
  font-size: 1.25rem;
}

.details {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}

.name {
  font-weight: 600;
}

.hp-bar {
  display: block;
  height: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
}

.hp-fill {
  display: block;
  height: 100%;
  background: var(--color-success);
}

.hp-text,
.empty {
  font-size: 0.875rem;
  color: inherit;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

/* A condition is its name and value; the border keeps it a visible shape too. */
.badge {
  padding: 0 var(--space-1);
  border: 1px solid currentcolor;
  border-radius: 4px;
  font-size: 0.75rem;
}
</style>
