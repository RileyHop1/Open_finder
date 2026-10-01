<script setup lang="ts">
/**
 * The table: what a player sees once they hold a seat. Three regions, each a
 * landmark and each reachable by a skip link --
 *
 * - the **party bar** across the top (who is in the party; the full bar with
 *   portraits, HP and conditions is a later PR),
 * - the **character sheet** pane in the middle (the characters this seat can
 *   see, a way to make a new one, and the chosen character's sheet),
 * - the **chat** panel beside it.
 *
 * It lays out at 1024px wide with the chat beside the sheet, and stacks below
 * that. Tablets are supported and phones are not (CLAUDE.md, Targets and
 * budgets), so there is no phone layout. Shown by `CampaignLobby` while this
 * device holds a seat; the lobby owns the realtime connection, this only reads
 * the stores it feeds.
 */
import { resolvePermission } from '@hearthtable/core';
import { computed, onMounted, ref, watch } from 'vue';

import { useDocumentsStore } from '../stores/documents.js';
import { useLobbyStore } from '../stores/lobby.js';
import ChatLog from './ChatLog.vue';
import PartyBar from './PartyBar.vue';
import CharacterSheet from './sheet/CharacterSheet.vue';
import ConditionsPanel from './sheet/ConditionsPanel.vue';
import HitPointsPanel from './sheet/HitPointsPanel.vue';
import InventoryPanel from './sheet/InventoryPanel.vue';
import StrikesPanel from './sheet/StrikesPanel.vue';

const props = defineProps<{ worldId: string; seatName: string }>();

const documents = useDocumentsStore();
const lobby = useLobbyStore();

const selectedId = ref<string>();
const selected = computed(() =>
  selectedId.value === undefined ? undefined : documents.actorById(selectedId.value),
);

/** Only an owner (the GM always is) may edit; the server enforces it too. */
const canEdit = computed(() => {
  const seat = lobby.mySeat;
  return (
    seat !== undefined &&
    selected.value !== undefined &&
    resolvePermission(seat, selected.value) === 'owner'
  );
});

/** The DC the next roll is made against, if the roller typed one. An empty box means no DC. */
const dc = ref<number | ''>('');
const dcPayload = computed(() =>
  typeof dc.value === 'number' && Number.isInteger(dc.value) && dc.value >= 0
    ? { dc: Math.min(dc.value, 99) }
    : {},
);

/** Rolls are made by the server (it resolves the statistic and rolls the die); the result arrives in chat. */
function roll(type: string, payload: Record<string, unknown>): void {
  if (selectedId.value !== undefined) {
    void documents.send(type, { actorId: selectedId.value, ...payload });
  }
}

/** Condition changes are server logic (merging a second source, clearing what a condition supersedes), so they are sent and shown when the broadcast returns. */
function sendCondition(type: string, payload: Record<string, unknown>): void {
  if (selectedId.value !== undefined) {
    void documents.send(type, { actorId: selectedId.value, ...payload });
  }
}

function saveChanges(changes: Record<string, unknown>): void {
  if (selectedId.value !== undefined) {
    void documents.updateActor(selectedId.value, changes);
  }
}

/** Item changes are server logic (the server copies from the compendium), so they are sent and shown when the broadcast returns. */
function sendItem(type: string, payload: Record<string, unknown>): void {
  if (selectedId.value !== undefined) {
    void documents.send(type, { actorId: selectedId.value, ...payload });
  }
}

const newName = ref('');
/** Set while a create is in flight, so the new character is opened when it arrives. */
const openNextNew = ref(false);

onMounted(() => {
  void documents.load(props.worldId);
});

// A deleted character cannot stay selected.
watch(
  () => documents.actors,
  (actors, previous) => {
    if (
      selectedId.value !== undefined &&
      !actors.some((a) => a.id === selectedId.value)
    ) {
      selectedId.value = undefined;
    }
    if (openNextNew.value) {
      const known = new Set(previous.map((a) => a.id));
      const created = actors.find((a) => !known.has(a.id));
      if (created !== undefined) {
        selectedId.value = created.id;
        openNextNew.value = false;
      }
    }
  },
);

async function handleCreate(): Promise<void> {
  const name = newName.value.trim();
  if (name.length === 0) {
    return;
  }
  openNextNew.value = true;
  const accepted = await documents.send('actor.create', { kind: 'character', name });
  if (accepted) {
    newName.value = '';
  } else {
    openNextNew.value = false;
  }
}
</script>

<template>
  <div class="table">
    <div class="skip-links">
      <a href="#party-bar">Skip to party bar</a>
      <a href="#sheet-pane">Skip to character sheet</a>
      <a href="#chat-pane">Skip to chat</a>
    </div>

    <p class="playing-as">
      Playing as <strong>{{ seatName }}</strong>
      <button type="button" @click="lobby.releaseSeat()">Release seat</button>
    </p>

    <p v-if="documents.error" role="alert" class="status status-error">
      {{ documents.error }}
    </p>

    <nav id="party-bar" class="party-bar" aria-label="Party" tabindex="-1">
      <PartyBar
        :members="documents.members"
        :selected-id="selectedId"
        :world-id="worldId"
        @select="(id) => (selectedId = id)"
      />
    </nav>

    <div class="table-body">
      <section
        id="sheet-pane"
        class="sheet-pane"
        aria-labelledby="sheet-heading"
        tabindex="-1"
      >
        <h2 id="sheet-heading">Characters</h2>

        <ul v-if="documents.actors.length > 0" class="roster">
          <li v-for="actor in documents.actors" :key="actor.id">
            <button
              type="button"
              :aria-pressed="actor.id === selectedId"
              @click="selectedId = actor.id"
            >
              {{ actor.name }}
              <span class="kind">({{ actor.kind }})</span>
            </button>
          </li>
        </ul>
        <p v-else class="empty">No characters yet. Make one below.</p>

        <form class="new-character" @submit.prevent="handleCreate">
          <label for="new-character-name">New character name</label>
          <input
            id="new-character-name"
            v-model="newName"
            type="text"
            required
            autocomplete="off"
          />
          <button type="submit">Create character</button>
        </form>

        <section v-if="selected" class="sheet" aria-label="Character sheet">
          <p v-if="canEdit && selected.kind === 'character'" class="roll-dc">
            <label for="roll-dc">DC to roll against (optional)</label>
            <input id="roll-dc" v-model.number="dc" type="number" min="0" max="99" />
          </p>
          <HitPointsPanel
            v-if="selected.kind === 'character'"
            :actor="selected"
            :editable="canEdit"
            @change="saveChanges"
          />
          <CharacterSheet
            :actor="selected"
            :editable="canEdit"
            :rollable="canEdit"
            @change="saveChanges"
            @roll="(statistic) => roll('actor.rollCheck', { statistic, ...dcPayload })"
          />
          <StrikesPanel
            v-if="selected.kind === 'character'"
            :actor="selected"
            :rollable="canEdit"
            @attack="
              (itemId, attackNumber) =>
                roll('actor.rollStrike', { itemId, attackNumber, ...dcPayload })
            "
            @damage="(itemId, critical) => roll('actor.rollDamage', { itemId, critical })"
          />
          <ConditionsPanel
            v-if="selected.kind === 'character'"
            :actor="selected"
            :editable="canEdit"
            @add="
              (slug, value) =>
                sendCondition('actor.addCondition', {
                  slug,
                  ...(value === undefined ? {} : { value }),
                })
            "
            @set="(slug, value) => sendCondition('actor.setCondition', { slug, value })"
            @remove="(slug) => sendCondition('actor.removeCondition', { slug })"
          />
          <InventoryPanel
            v-if="selected.kind === 'character'"
            :actor="selected"
            :editable="canEdit"
            @add="(packId, slug) => sendItem('actor.addItem', { packId, slug })"
            @equip="
              (itemId, equipped) => sendItem('actor.updateItem', { itemId, equipped })
            "
            @quantity="
              (itemId, quantity) => sendItem('actor.updateItem', { itemId, quantity })
            "
            @remove="(itemId) => sendItem('actor.removeItem', { itemId })"
          />
        </section>
      </section>

      <div id="chat-pane" class="chat-pane" tabindex="-1">
        <ChatLog :world-id="worldId" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Invisible until focused, like the app-level skip link (App.vue). */
.skip-links a {
  position: absolute;
  left: -9999px;
}

.skip-links a:focus {
  position: static;
  display: inline-block;
  margin-right: var(--space-2);
  padding: var(--space-2);
  background: var(--color-surface);
  color: var(--color-text);
}

.playing-as {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
}

.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.party-bar {
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: var(--space-2) var(--space-3);
}

.roster {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.roster button {
  min-height: var(--touch-target-min);
}

button[aria-pressed='true'] {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
}

.kind,
.empty {
  color: var(--color-text-muted);
}

.new-character {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-3) 0;
}

.roll-dc {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.roll-dc input {
  width: 5rem;
  min-height: var(--touch-target-min);
}

.sheet {
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-3);
}

/* The chat sits beside the sheet from 1024px down to 900px; narrower stacks. */
.table-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
}

@media (min-width: 900px) {
  .table-body {
    grid-template-columns: minmax(0, 1fr) 22rem;
    align-items: start;
  }
}
</style>
