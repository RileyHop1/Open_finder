<script setup lang="ts">
/**
 * The table: what a player sees once they hold a seat. It is **map-first**:
 * the map fills the screen and everything else is around or over it. Four
 * regions, each a landmark and each reachable by a skip link --
 *
 * - the **party bar** across the top,
 * - the **map** in the middle (an empty state until a scene is shown),
 * - the **character sheet**, a drawer that slides over the map's left edge
 *   (the characters this seat can see, a way to make a new one, and the chosen
 *   character's sheet). Opened by the "Characters" button or by pressing a
 *   party card; Escape or "Close" shuts it and puts focus back where it was,
 * - the **chat** panel on the right.
 *
 * The GM also has a **Scenes** drawer, from the right edge of the map (the scene
 * manager: make, edit, preview, move the party to, and delete scenes), and a
 * banner above the map while they are previewing a scene the players are not on.
 *
 * The drawer overlays the map at every width rather than pushing it, so the
 * map never reflows while someone reads their sheet. The chat sits beside the
 * map from 900px and stacks below that. Tablets are supported and phones are
 * not (CLAUDE.md, Targets and budgets), so there is no phone layout. Shown by `CampaignLobby` while this
 * device holds a seat; the lobby owns the realtime connection, this only reads
 * the stores it feeds.
 */
import { resolvePermission } from '@hearthtable/core';
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue';

import { uploadAsset } from '../api/assets.js';
import { useDocumentsStore } from '../stores/documents.js';
import { useLobbyStore } from '../stores/lobby.js';
import { useScenesStore } from '../stores/scenes.js';
import ChatLog from './ChatLog.vue';
import ContentImportPanel from './ContentImportPanel.vue';
import MapView from './map/MapView.vue';
import { startActorDrag } from './map/placement.js';
import MonsterPicker from './scenes/MonsterPicker.vue';
import SceneManager from './scenes/SceneManager.vue';
import { useDrawer } from './useDrawer.js';
import PartyBar from './PartyBar.vue';
import PartyManager from './PartyManager.vue';
import CharacterSheet from './sheet/CharacterSheet.vue';
import NpcSheet from './sheet/NpcSheet.vue';
import ConditionsPanel from './sheet/ConditionsPanel.vue';
import PortraitPicker from './sheet/PortraitPicker.vue';
import HitPointsPanel from './sheet/HitPointsPanel.vue';
import InventoryPanel from './sheet/InventoryPanel.vue';
import StrikesPanel from './sheet/StrikesPanel.vue';

const props = defineProps<{ worldId: string; seatName: string }>();

const documents = useDocumentsStore();
const lobby = useLobbyStore();
const scenes = useScenesStore();

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

/** A strike is named by its weapon's item id on a character and by its stat-block key on a monster. */
function strikeTarget(id: string): { itemId: string } | { strikeKey: string } {
  return selected.value?.kind === 'npc' ? { strikeKey: id } : { itemId: id };
}

/** Condition changes are server logic (merging a second source, clearing what a condition supersedes), so they are sent and shown when the broadcast returns. */
function sendCondition(type: string, payload: Record<string, unknown>): void {
  if (selectedId.value !== undefined) {
    void documents.send(type, { actorId: selectedId.value, ...payload });
  }
}

/** Party changes are the GM's and are server logic (the party is created on first use), so they are sent and shown when the broadcast returns. */
function sendParty(type: string, payload: Record<string, unknown>): void {
  void documents.send(type, payload);
}

const uploading = ref(false);
const uploadError = ref<string>();

/** Uploads the picked image, then points the actor's portrait at it. A failure at either step is shown beside the picker. */
async function setPortrait(file: File): Promise<void> {
  const actorId = selectedId.value;
  if (actorId === undefined) {
    return;
  }
  uploading.value = true;
  uploadError.value = undefined;
  try {
    const stored = await uploadAsset(props.worldId, file);
    await documents.updateActor(actorId, { portrait: stored.name });
  } catch (caught) {
    uploadError.value = caught instanceof Error ? caught.message : 'upload failed';
  } finally {
    uploading.value = false;
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

/** Bumped when an import finishes, so panels that listed content (the item picker, the condition picker) look again. */
const contentVersion = ref(0);

const drawerEl = useTemplateRef<HTMLElement>('drawer');
const sceneDrawerEl = useTemplateRef<HTMLElement>('sceneDrawer');

/** The character drawer (open state, focus in and back out) and the GM's scene drawer. */
const { open: drawerOpen, show: openDrawer, hide: closeDrawer } = useDrawer(drawerEl);
const {
  open: sceneDrawerOpen,
  show: openSceneDrawer,
  hide: closeSceneDrawer,
} = useDrawer(sceneDrawerEl);

const mapView = useTemplateRef<InstanceType<typeof MapView>>('mapView');

/** True while a character is being dragged out of the roster, so the drawer can get out of the way of the drop. */
const placing = ref(false);

/** The GM's "Place on map": the token goes in the middle of the part of the map the open drawers leave visible. */
async function placeOnMap(actorId: string): Promise<void> {
  await mapView.value?.placeAtCentre(actorId, {
    left: drawerOpen.value ? (drawerEl.value?.offsetWidth ?? 0) : 0,
    right: sceneDrawerOpen.value ? (sceneDrawerEl.value?.offsetWidth ?? 0) : 0,
  });
}

function startPlacing(event: DragEvent, actorId: string): void {
  startActorDrag(event, actorId, () => {
    placing.value = true;
  });
}

/** The scene the party is on, for the preview banner. */
const partyScene = computed(() =>
  scenes.scenes.find((scene) => scene.id === scenes.partySceneId),
);

/** A party card was pressed: show that character's sheet. */
function openSheetOf(actorId: string): void {
  selectedId.value = actorId;
  void openDrawer();
}

const newName = ref('');
/** Set while a monster is being made, so its token is placed when the new actor arrives. */
const placeNextNew = ref(false);

/** The server makes the actor from its own compendium copy; the token follows when it arrives (below). */
async function addMonster(packId: string, slug: string): Promise<void> {
  placeNextNew.value = true;
  if (!(await documents.send('actor.createFromCreature', { packId, slug }))) {
    placeNextNew.value = false;
  }
}
/** Set while a create is in flight, so the new character is opened when it arrives. */
const openNextNew = ref(false);

onMounted(() => {
  void documents.load(props.worldId);
  void scenes.load(props.worldId);
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
    if (placeNextNew.value) {
      const known = new Set(previous.map((a) => a.id));
      const made = actors.find((a) => !known.has(a.id));
      if (made !== undefined) {
        placeNextNew.value = false;
        void placeOnMap(made.id);
      }
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
      <a href="#map-pane">Skip to map</a>
      <a href="#sheet-pane" @click.prevent="openDrawer">Skip to character sheet</a>
      <a href="#chat-pane">Skip to chat</a>
    </div>

    <p class="playing-as">
      Playing as <strong>{{ seatName }}</strong>
      <button type="button" @click="lobby.releaseSeat()">Release seat</button>
    </p>

    <ContentImportPanel v-if="lobby.mySeat?.isGM" @imported="contentVersion += 1" />

    <p v-if="documents.error" role="alert" class="status status-error">
      {{ documents.error }}
    </p>

    <nav id="party-bar" class="party-bar" aria-label="Party" tabindex="-1">
      <PartyBar
        :members="documents.members"
        :selected-id="selectedId"
        :world-id="worldId"
        @select="openSheetOf"
      />
      <PartyManager
        v-if="lobby.mySeat?.isGM"
        :members="documents.members"
        :actors="documents.actors"
        @add="(actorId) => sendParty('party.addMember', { actorId })"
        @remove="(actorId) => sendParty('party.removeMember', { actorId })"
        @reorder="(memberIds) => sendParty('party.reorder', { memberIds })"
      />
    </nav>

    <div class="table-body">
      <div class="map-column">
        <p class="map-tools">
          <button
            type="button"
            aria-controls="sheet-pane"
            :aria-expanded="drawerOpen"
            @click="drawerOpen ? closeDrawer() : openDrawer()"
          >
            Characters
          </button>
          <button
            v-if="lobby.mySeat?.isGM"
            type="button"
            aria-controls="scene-pane"
            :aria-expanded="sceneDrawerOpen"
            @click="sceneDrawerOpen ? closeSceneDrawer() : openSceneDrawer()"
          >
            Scenes
          </button>
        </p>

        <p v-if="scenes.isPreviewing" class="preview-banner" role="status">
          You are previewing <strong>{{ scenes.shownScene?.name }}</strong
          >. The players are on <strong>{{ partyScene?.name ?? 'no scene' }}</strong
          >.
          <button type="button" @click="scenes.previewScene(undefined)">
            Back to the players' scene
          </button>
        </p>

        <section
          id="map-pane"
          class="map-pane"
          aria-label="Map"
          tabindex="-1"
          data-testid="map-pane"
        >
          <MapView ref="mapView" :world-id="worldId" @open-actor="openSheetOf" />
        </section>

        <Transition name="drawer">
          <section
            v-if="lobby.mySeat?.isGM"
            v-show="sceneDrawerOpen"
            id="scene-pane"
            ref="sceneDrawer"
            class="sheet-pane scene-pane"
            :class="{ 'is-placing': placing }"
            aria-labelledby="scene-heading"
            tabindex="-1"
            @keydown.esc.stop="closeSceneDrawer"
          >
            <header class="drawer-header">
              <h2 id="scene-heading">Scenes</h2>
              <button type="button" class="drawer-close" @click="closeSceneDrawer">
                Close
              </button>
            </header>
            <SceneManager :world-id="worldId" />
          </section>
        </Transition>

        <Transition name="drawer">
          <section
            v-show="drawerOpen"
            id="sheet-pane"
            ref="drawer"
            class="sheet-pane"
            :class="{ 'is-placing': placing }"
            aria-labelledby="sheet-heading"
            tabindex="-1"
            @keydown.esc.stop="closeDrawer"
          >
            <header class="drawer-header">
              <h2 id="sheet-heading">Characters</h2>
              <button type="button" class="drawer-close" @click="closeDrawer">
                Close
              </button>
            </header>

            <ul v-if="documents.actors.length > 0" class="roster">
              <li v-for="actor in documents.actors" :key="actor.id">
                <span
                  v-if="lobby.mySeat?.isGM"
                  class="drag-handle"
                  draggable="true"
                  aria-hidden="true"
                  title="Drag onto the map to place a token"
                  @dragstart="startPlacing($event, actor.id)"
                  @dragend="placing = false"
                  >⠿</span
                >
                <button
                  type="button"
                  :aria-pressed="actor.id === selectedId"
                  @click="selectedId = actor.id"
                >
                  {{ actor.name }}
                  <span class="kind">({{ actor.kind }})</span>
                </button>
                <button
                  v-if="lobby.mySeat?.isGM"
                  type="button"
                  :disabled="scenes.shownScene === undefined"
                  :aria-label="`Place ${actor.name} on the map`"
                  @click="placeOnMap(actor.id)"
                >
                  Place on map
                </button>
              </li>
            </ul>
            <p v-else class="empty">No characters yet. Make one below.</p>
            <p v-if="lobby.mySeat?.isGM && scenes.shownScene === undefined" class="empty">
              Make a scene and move the party to it (the Scenes button) to place tokens.
            </p>

            <MonsterPicker
              v-if="lobby.mySeat?.isGM"
              :key="`monsters-${contentVersion}`"
              :can-place="scenes.shownScene !== undefined"
              @add="addMonster"
            />

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
              <p v-if="canEdit" class="roll-dc">
                <label for="roll-dc">DC to roll against (optional)</label>
                <input id="roll-dc" v-model.number="dc" type="number" min="0" max="99" />
              </p>
              <PortraitPicker
                :name="selected.name"
                :portrait="selected.portrait"
                :world-id="worldId"
                :editable="canEdit"
                :busy="uploading"
                :error="uploadError"
                @upload="setPortrait"
                @clear="saveChanges({ portrait: null })"
              />
              <HitPointsPanel
                v-if="selected.kind === 'character' || selected.kind === 'npc'"
                :actor="selected"
                :editable="canEdit"
                @change="saveChanges"
              />
              <NpcSheet
                v-if="selected.kind === 'npc'"
                :actor="selected"
                :rollable="canEdit"
                @change="saveChanges"
                @roll="
                  (statistic) => roll('actor.rollCheck', { statistic, ...dcPayload })
                "
              />
              <CharacterSheet
                v-else
                :actor="selected"
                :editable="canEdit"
                :rollable="canEdit"
                @change="saveChanges"
                @roll="
                  (statistic) => roll('actor.rollCheck', { statistic, ...dcPayload })
                "
              />
              <StrikesPanel
                v-if="selected.kind === 'character' || selected.kind === 'npc'"
                :actor="selected"
                :rollable="canEdit"
                @attack="
                  (id, attackNumber) =>
                    roll('actor.rollStrike', {
                      ...strikeTarget(id),
                      attackNumber,
                      ...dcPayload,
                    })
                "
                @damage="
                  (id, critical) =>
                    roll('actor.rollDamage', { ...strikeTarget(id), critical })
                "
              />
              <ConditionsPanel
                v-if="selected.kind === 'character' || selected.kind === 'npc'"
                :key="`conditions-${contentVersion}`"
                :actor="selected"
                :editable="canEdit"
                @add="
                  (slug, value) =>
                    sendCondition('actor.addCondition', {
                      slug,
                      ...(value === undefined ? {} : { value }),
                    })
                "
                @set="
                  (slug, value) => sendCondition('actor.setCondition', { slug, value })
                "
                @remove="(slug) => sendCondition('actor.removeCondition', { slug })"
              />
              <InventoryPanel
                v-if="selected.kind === 'character'"
                :key="`inventory-${contentVersion}`"
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
        </Transition>
      </div>

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

.roster li {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.roster button {
  min-height: var(--touch-target-min);
}

/* Pointer-only: the "Place on map" button is the keyboard route to the same thing. */
.drag-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.75rem;
  min-height: var(--touch-target-min);
  color: var(--color-text-muted);
  cursor: grab;
  user-select: none;
}

/* While a character is dragged out, the drawer lets the map underneath take the drop. */
.is-placing {
  opacity: 0.2;
  pointer-events: none;
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

/* The chat sits beside the map from 900px; narrower stacks. */
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

/* The map column is the drawer's positioning box: the drawer overlays the map. */
.map-column {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.map-tools {
  margin: 0;
}

.map-tools button {
  min-height: var(--touch-target-min);
}

.map-pane {
  height: calc(100vh - 14rem);
  min-height: 24rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.sheet-pane {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  width: min(36rem, 100%);
  overflow-y: auto;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface);
  box-shadow: 4px 0 16px rgb(0 0 0 / 0.25);
}

/* The scene drawer comes in from the right, so both can be open without covering each other entirely. */
.scene-pane {
  right: 0;
  left: auto;
  box-shadow: -4px 0 16px rgb(0 0 0 / 0.25);
}

.preview-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: 4px;
}

.preview-banner button {
  min-height: var(--touch-target-min);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.drawer-header h2 {
  margin: 0;
}

.drawer-close {
  min-height: var(--touch-target-min);
}

.drawer-enter-active,
.drawer-leave-active {
  transition:
    transform 0.2s ease,
    opacity 0.2s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  transform: translateX(-1.5rem);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active,
  .drawer-leave-active {
    transition: none;
  }
}
</style>
