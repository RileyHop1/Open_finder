<script setup lang="ts">
/**
 * The GM's party menu: who is in the party and in what order. Membership is a
 * table decision, so only the GM sees this (the server refuses anyone else
 * too). Reordering is buttons -- Move up, Move down -- never drag alone, per
 * CLAUDE.md's accessibility rule that a draggable interaction ships its
 * keyboard equivalent in the same change; a change is announced in a status
 * line so it is heard as well as seen.
 *
 * It never talks to the server: it emits what the GM asked for and
 * `TableView` sends the party operation. Mounted inside the table's
 * gear-menu "Manage party" drawer, which already gives it an open/close
 * affordance and a heading, so this is a plain panel rather than its own
 * `<details>`.
 */
import type { Actor } from '@hearthtable/core';
import { computed, ref } from 'vue';

const props = defineProps<{
  /** The party, in order. */
  members: readonly Actor[];
  /** Every actor the GM can see; those not yet in the party can be added. */
  actors: readonly Actor[];
}>();
const emit = defineEmits<{
  add: [actorId: string];
  remove: [actorId: string];
  reorder: [memberIds: string[]];
}>();

const chosen = ref('');
const announcement = ref('');

/** Characters and NPCs not yet in the party. A hazard cannot join one. */
const candidates = computed(() => {
  const inParty = new Set(props.members.map((m) => m.id));
  return props.actors.filter((a) => a.kind !== 'hazard' && !inParty.has(a.id));
});

function move(index: number, by: -1 | 1): void {
  const target = index + by;
  const ids = props.members.map((m) => m.id);
  const moved = props.members[index];
  if (moved === undefined || target < 0 || target >= ids.length) {
    return;
  }
  ids.splice(index, 1);
  ids.splice(target, 0, moved.id);
  announcement.value = `${moved.name} moved to position ${target + 1} of ${ids.length}.`;
  emit('reorder', ids);
}

function remove(actor: Actor): void {
  announcement.value = `${actor.name} removed from the party.`;
  emit('remove', actor.id);
}

function add(): void {
  const actor = candidates.value.find((a) => a.id === chosen.value);
  if (actor === undefined) {
    return;
  }
  announcement.value = `${actor.name} added to the party.`;
  emit('add', actor.id);
  chosen.value = '';
}
</script>

<template>
  <div class="party-manager">
    <p v-if="members.length === 0" class="empty">Nobody is in the party yet.</p>
    <ol v-else class="members">
      <li v-for="(member, index) in members" :key="member.id">
        <span class="name">{{ member.name }}</span>
        <button
          type="button"
          :aria-label="`Move ${member.name} up`"
          :disabled="index === 0"
          @click="move(index, -1)"
        >
          Move up
        </button>
        <button
          type="button"
          :aria-label="`Move ${member.name} down`"
          :disabled="index === members.length - 1"
          @click="move(index, 1)"
        >
          Move down
        </button>
        <button
          type="button"
          :aria-label="`Remove ${member.name} from the party`"
          @click="remove(member)"
        >
          Remove
        </button>
      </li>
    </ol>

    <form class="add" @submit.prevent="add">
      <label for="party-add">Add to party</label>
      <select id="party-add" v-model="chosen" :disabled="candidates.length === 0">
        <option value="" disabled>
          {{ candidates.length === 0 ? 'Everyone is already in' : 'Choose…' }}
        </option>
        <option v-for="actor in candidates" :key="actor.id" :value="actor.id">
          {{ actor.name }} ({{ actor.kind }})
        </option>
      </select>
      <button type="submit" :disabled="chosen === ''">Add</button>
    </form>

    <p class="announcement" role="status">{{ announcement }}</p>
  </div>
</template>

<style scoped>
.members {
  list-style-position: inside;
  margin: var(--space-2) 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.members li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.name {
  font-weight: 600;
  min-width: 8rem;
}

.empty,
.announcement {
  color: var(--color-text-muted);
  margin: var(--space-2) 0;
}

.add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

button,
select {
  min-height: var(--touch-target-min);
}
</style>
