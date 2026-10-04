<script setup lang="ts">
/**
 * The controls for the turn currently happening: ending it, ending the
 * whole combat, and the GM's free-movement switch. Shown with the action
 * tray and action bar at the bottom of the map (Owlcat-style), not with
 * `TurnBar`'s portraits above it -- those are turn *order*; these are
 * things you do *during* a turn. Only shown while a combat is active (the
 * parent's `v-if`).
 *
 * "End turn" is the one button a non-GM ever sees here: the active
 * combatant's own owner may end their own turn without waiting on the GM
 * (`combat.nextTurn`'s own permission, `apps/server/src/combat.ts`'s
 * `requireCanEndTurn`) -- the GM's label for the same action is "Next turn",
 * since the GM may also skip ahead for someone else's combatant.
 */
defineProps<{
  /** Whether this seat is the GM: also gets Previous turn, End combat, and Free movement. */
  isGm: boolean;
  /** Whether this seat may end the current turn: the GM, or the active combatant's own owner. */
  canEndTurn: boolean;
  /** The combat's free-movement ruling: lifts the turn rule for everyone. */
  freeMovement: boolean;
}>();
const emit = defineEmits<{
  previous: [];
  next: [];
  end: [];
  setFreeMovement: [on: boolean];
}>();
</script>

<template>
  <section class="turn-controls" aria-label="Turn controls">
    <button v-if="isGm" type="button" @click="emit('previous')">Previous turn</button>
    <button v-if="canEndTurn" type="button" @click="emit('next')">
      {{ isGm ? 'Next turn' : 'End turn' }}
    </button>
    <template v-if="isGm">
      <button type="button" @click="emit('end')">End combat</button>
      <label class="free-movement">
        <input
          type="checkbox"
          :checked="freeMovement"
          @change="emit('setFreeMovement', ($event.target as HTMLInputElement).checked)"
        />
        Free movement
      </label>
    </template>
  </section>
</template>

<style scoped>
.turn-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
}

.turn-controls button {
  min-height: var(--touch-target-min);
}

.free-movement {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
