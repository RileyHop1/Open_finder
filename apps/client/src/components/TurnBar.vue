<script setup lang="ts">
/**
 * The turn bar: the combatants in turn order across the top of the table (ADR
 * 0022's top strip), the one with the action first and marked "Acting now" in
 * words (never colour alone). Each portrait is a button that selects and
 * centres that token. It is an ordinary list, so Tab, Enter, and a screen
 * reader all work.
 *
 * For the GM, clicking a portrait also reveals that combatant's initiative
 * override (the manual path every rolled initiative gets) just below it, and
 * only then -- it used to sit under every portrait all the time. It opens
 * inline rather than as a floating popover on purpose: the top strip scrolls
 * horizontally, which would clip anything positioned outside it.
 *
 * It shows only what this seat can read. A creature the table cannot see taking
 * its turn appears as one line, "Someone is acting".
 *
 * Only rendered while a combat is active -- the top strip shows `PartyBar`
 * instead otherwise, and the GM's "Start combat" lives there too, beside
 * `PartyBar`, rather than as a state of this component. `showControls` (the
 * GM only) is just the per-combatant initiative override (the manual path
 * every automated roll gets) -- ending a turn, ending the combat, and the
 * free-movement switch are `TurnControls.vue`'s, at this strip's other end,
 * since those are things you do each turn rather than facts about the order
 * itself.
 */
import { nextTick, reactive, ref, useTemplateRef } from 'vue';

import type { TurnBarItem } from './turnBarModel.js';

const props = defineProps<{
  items: readonly TurnBarItem[];
  round: number;
  unseenActing: boolean;
  /** Whether this seat is the GM: shows the per-combatant initiative override. */
  showControls: boolean;
}>();
const emit = defineEmits<{
  focus: [tokenId: string];
  setInitiative: [combatantId: string, initiative: number];
}>();

/** The override field's own draft per combatant, kept apart from the rolled value until submitted. */
const overrides = reactive<Record<string, number | undefined>>({});

const root = useTemplateRef<HTMLElement>('root');
/** The combatant whose override editor is open (GM only); at most one at a time. */
const editingId = ref<string>();

function portraitButton(combatantId: string): HTMLElement | null {
  return (
    root.value?.querySelector<HTMLElement>(`[data-combatant="${combatantId}"]`) ?? null
  );
}

/** A portrait click: focus the token for everyone, and for the GM also toggle that combatant's editor. */
async function clickPortrait(item: TurnBarItem): Promise<void> {
  if (item.tokenId !== undefined) {
    emit('focus', item.tokenId);
  }
  if (!props.showControls) {
    return;
  }
  if (editingId.value === item.id) {
    editingId.value = undefined;
    return;
  }
  editingId.value = item.id;
  overrides[item.id] = item.initiative;
  await nextTick();
  root.value?.querySelector<HTMLElement>(`#initiative-${item.id}`)?.focus();
}

function closeEditor(combatantId: string, returnFocus: boolean): void {
  if (editingId.value === combatantId) {
    editingId.value = undefined;
    if (returnFocus) {
      portraitButton(combatantId)?.focus();
    }
  }
}

/** Closes when focus leaves this combatant's list item entirely (the same `focusout` pattern as `StatBreakdown.vue`). */
function onItemFocusOut(event: FocusEvent, combatantId: string): void {
  const next = event.relatedTarget as Node | null;
  if (next === null || !(event.currentTarget as HTMLElement).contains(next)) {
    closeEditor(combatantId, false);
  }
}

function submitOverride(combatantId: string): void {
  const value = overrides[combatantId];
  if (value !== undefined && Number.isFinite(value)) {
    emit('setInitiative', combatantId, value);
    closeEditor(combatantId, true);
  }
}
</script>

<template>
  <section ref="root" class="turn-bar" aria-label="Turn order" data-testid="turn-bar">
    <p class="round">Round {{ round }}</p>
    <p v-if="unseenActing" class="unseen" role="status">Someone is acting</p>
    <ol>
      <li
        v-for="item in items"
        :key="item.id"
        :class="{ active: item.active }"
        :aria-current="item.active ? 'true' : undefined"
        @focusout="(event) => onItemFocusOut(event, item.id)"
        @keydown.esc.stop="closeEditor(item.id, true)"
      >
        <button
          type="button"
          :data-combatant="item.id"
          :disabled="item.tokenId === undefined && !showControls"
          :aria-expanded="showControls ? editingId === item.id : undefined"
          :aria-controls="showControls ? `override-${item.id}` : undefined"
          @click="clickPortrait(item)"
        >
          <img
            v-if="item.portraitUrl !== undefined"
            class="portrait"
            :src="item.portraitUrl"
            alt=""
          />
          <span v-else class="portrait placeholder" aria-hidden="true">{{
            item.initials
          }}</span>
          <span class="name">{{ item.label }}</span>
          <span class="initiative"
            >Initiative
            {{ item.initiative === undefined ? 'not rolled' : item.initiative }}</span
          >
          <span v-if="item.active" class="status">Taking their turn</span>
          <span v-if="item.defeated" class="status">(defeated)</span>
        </button>
        <form
          v-if="showControls && editingId === item.id"
          :id="`override-${item.id}`"
          class="override"
          :aria-label="`Set ${item.label}'s initiative`"
          @submit.prevent="submitOverride(item.id)"
        >
          <label :for="`initiative-${item.id}`">Set initiative</label>
          <input
            :id="`initiative-${item.id}`"
            v-model.number="overrides[item.id]"
            type="number"
            step="1"
          />
          <button type="submit">Set</button>
        </form>
      </li>
    </ol>
  </section>
</template>

<style scoped>
/* No overflow of its own: the top strip (TableView.vue's .top-strip,
   ADR 0022) is the one scroll container, shared with TurnControls beside
   it, rather than nesting a second horizontal scrollbar inside it. */
.turn-bar {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  padding: 0.25rem 0.5rem;
}
.round,
.unseen {
  margin: 0;
  font-weight: 600;
  white-space: nowrap;
}
ol {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
li button {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 5.5rem;
  min-height: 44px;
  padding: 0.25rem 0.5rem;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
li.active button {
  border-color: currentColor;
  font-weight: 600;
}
li button:disabled {
  cursor: default;
}
.portrait {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  object-fit: cover;
}
.placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
}
.initiative {
  font-size: 0.8em;
}
.status {
  font-size: 0.8em;
  font-style: italic;
}
.override {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75em;
}
.override input {
  width: 3.5rem;
}
.override label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
