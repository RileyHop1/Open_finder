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
import { useCombatStore } from '../stores/combat.js';
import { useDocumentsStore } from '../stores/documents.js';
import { useLobbyStore } from '../stores/lobby.js';
import { useScenesStore } from '../stores/scenes.js';
import ActionBar from './ActionBar.vue';
import { actionBarView, type ActionBarStrike } from './actionBarModel.js';
import ActionTray from './ActionTray.vue';
import { actionTrayView } from './actionTrayModel.js';
import ChatLog from './ChatLog.vue';
import ContentImportPanel from './ContentImportPanel.vue';
import MapView from './map/MapView.vue';
import { gridForScene } from './map/mapGrid.js';
import { startActorDrag } from './map/placement.js';
import { cellsInRange } from './map/rangeHighlight.js';
import { useMapPaneResize } from './useMapPaneResize.js';
import MonsterPicker from './scenes/MonsterPicker.vue';
import SceneManager from './scenes/SceneManager.vue';
import TurnBar from './TurnBar.vue';
import { turnBarItems } from './turnBarModel.js';
import TurnControls from './TurnControls.vue';
import { useDrawer } from './useDrawer.js';
import PartyBar from './PartyBar.vue';
import PartyManager from './PartyManager.vue';
import CharacterSheet from './sheet/CharacterSheet.vue';
import NpcSheet from './sheet/NpcSheet.vue';
import ConditionsPanel from './sheet/ConditionsPanel.vue';
import DyingPanel from './sheet/DyingPanel.vue';
import PortraitPicker from './sheet/PortraitPicker.vue';
import HitPointsPanel from './sheet/HitPointsPanel.vue';
import InventoryPanel from './sheet/InventoryPanel.vue';
import StrikesPanel from './sheet/StrikesPanel.vue';

const props = defineProps<{ worldId: string; seatName: string }>();

const documents = useDocumentsStore();
const lobby = useLobbyStore();
const scenes = useScenesStore();
const combat = useCombatStore();

/**
 * The turn bar shows while a combat is running, or, for the GM only, when
 * there is none yet -- that empty state is where "Start combat" lives
 * (CLAUDE.md: nothing else may start one). A player sees nothing until a
 * combat is active.
 */
const turnBar = computed(() => {
  const active = combat.activeCombat;
  const isGM = lobby.mySeat?.isGM === true;
  if (active?.status === 'active') {
    return {
      active: true,
      round: active.round,
      freeMovement: active.freeMovement,
      items: turnBarItems(
        combat.order,
        active.activeCombatantId,
        scenes.shownTokens,
        documents.actorById,
        props.worldId,
      ),
    };
  }
  return isGM ? { active: false, round: 0, freeMovement: false, items: [] } : undefined;
});

/**
 * Who can be picked for a condition's "ends at end of X's turn" duration
 * (M5 C.7): the turn bar's own items, already resolved to a hidden
 * creature's "Someone is acting" placeholder where this seat may not read
 * the real name, so the picker never re-derives that rule.
 */
const combatantOptions = computed(() =>
  (turnBar.value?.items ?? []).map((item) => ({ id: item.id, label: item.label })),
);

/**
 * The action tray: the acting combatant's ◆◆◆ and ↺, shown only while a combat
 * is active and this seat can read the active combatant (`activeCombatant` is
 * already filtered to that). Spend/undo controls are for the GM or the
 * combatant's actor's owner only.
 */
const actionTray = computed(() => {
  const combatant = combat.activeCombatant;
  if (combatant === undefined) {
    return undefined;
  }
  const actor = documents.actorById(combatant.actorId);
  const token = scenes.shownTokens.find((t) => t.id === combatant.tokenId);
  const seat = lobby.mySeat;
  const canControl =
    seat !== undefined &&
    (seat.isGM || (actor !== undefined && resolvePermission(seat, actor) === 'owner'));
  return {
    combatantId: combatant.id,
    view: actionTrayView(combatant, actor),
    label: token?.name ?? actor?.name ?? 'Unknown',
    canControl,
  };
});

/**
 * Whether this seat may end the current turn (`TurnControls`'s "End turn"):
 * the GM always may; otherwise only the active combatant's own owner,
 * mirroring the server's own `requireCanEndTurn`. Independent of
 * `actionTray` existing at all -- the GM still gets this even if the active
 * combatant's token is gone and the tray has nothing to show.
 */
const canEndTurn = computed(
  () => lobby.mySeat?.isGM === true || actionTray.value?.canControl === true,
);

/** No-op once the active combatant has changed since the tray was rendered. */
function spendTrayAction(actions: number): void {
  const combatantId = actionTray.value?.combatantId;
  if (combatantId !== undefined) {
    void combat.spendAction(combatantId, actions);
  }
}

function setTrayReaction(used: boolean): void {
  const combatantId = actionTray.value?.combatantId;
  if (combatantId !== undefined) {
    void combat.setReaction(combatantId, used);
  }
}

/** The map-selected token, if any -- shared by the action bar and its range highlight. */
const selectedToken = computed(() => {
  const tokenId = mapView.value?.selectedId;
  return tokenId === undefined
    ? undefined
    : scenes.shownTokens.find((t) => t.id === tokenId);
});

/**
 * The action bar: the map-selected token's strikes and basic actions, across
 * the bottom of the map. Selecting a token is still unrestricted (it also
 * drives the ruler and the keyboard token list, for any token), so the bar
 * itself checks ownership -- the GM, any token; a player, only one of an
 * actor they own -- the same way `ActionTray`'s controls do.
 */
const actionBar = computed(() => {
  const token = selectedToken.value;
  if (token === undefined) {
    return undefined;
  }
  const actor = documents.actorById(token.actorId);
  const seat = lobby.mySeat;
  if (actor === undefined || seat === undefined) {
    return undefined;
  }
  const owns = seat.isGM || resolvePermission(seat, actor) === 'owner';
  if (!owns) {
    return undefined;
  }
  const combatant = combat.combatantByToken(token.id);
  return {
    actorId: actor.id,
    combatantId: combatant?.id,
    view: actionBarView(actor, combatant),
    label: token.name ?? actor.name,
    gm: seat.isGM,
    canUndo: combatant !== undefined && combat.canUndoSpend(combatant.id),
  };
});

/** Spends `cost` on `combatantId` and, once accepted, records it for `barUndo` to find. */
async function spendAndRecord(combatantId: string, cost: number): Promise<void> {
  if (await combat.spendAction(combatantId, cost)) {
    combat.recordSpend(combatantId, cost);
  }
}

/**
 * A strike waiting on a target (C.6): set by either strike button, cleared
 * once the roll fires -- with a target picked on the map or the token list,
 * or without one if the player presses Escape to skip it.
 */
const pendingStrike = ref<{
  readonly actorId: string;
  readonly target: { itemId: string } | { strikeKey: string };
  readonly attackNumber: 1 | 2 | 3;
  readonly dc?: number;
  readonly combatantId?: string;
  /** Melee or ranged (M5 C.10's flanking preview needs it); undefined when the action bar isn't available to say. */
  readonly ranged?: boolean;
}>();

/** Whether `target`'s strike is ranged, from the action bar's own strikes list -- undefined when the bar isn't shown (e.g. outside combat), never guessed. */
function isRangedStrike(
  target: { itemId: string } | { strikeKey: string },
): boolean | undefined {
  return actionBar.value?.view.strikes.find((strike) =>
    'itemId' in target && 'itemId' in strike.target
      ? strike.target.itemId === target.itemId
      : 'strikeKey' in target && 'strikeKey' in strike.target
        ? strike.target.strikeKey === target.strikeKey
        : false,
  )?.ranged;
}

/** Fires the pending strike, rolls, and spends the action bar's cost if it has one. */
function fireStrike(targetTokenId: string | undefined): void {
  const pending = pendingStrike.value;
  if (pending === undefined) {
    return;
  }
  void documents.send('actor.rollStrike', {
    actorId: pending.actorId,
    ...pending.target,
    attackNumber: pending.attackNumber,
    ...(pending.dc === undefined ? {} : { dc: pending.dc }),
    ...(targetTokenId === undefined ? {} : { targetTokenId }),
  });
  if (pending.combatantId !== undefined) {
    void spendAndRecord(pending.combatantId, 1);
  }
  pendingStrike.value = undefined;
}

/** A token picked on the map or the token list while a strike is pending. */
function confirmTarget(tokenId: string): void {
  fireStrike(tokenId);
}

/** Escape while a strike is pending: swing without naming a target. */
function swingWithoutTarget(): void {
  fireStrike(undefined);
}

/** A strike rolled from the action bar: waits on a target instead of firing immediately. */
function barStrike(
  target: { itemId: string } | { strikeKey: string },
  attackNumber: 1 | 2 | 3,
): void {
  const bar = actionBar.value;
  if (bar === undefined) {
    return;
  }
  const ranged = isRangedStrike(target);
  pendingStrike.value = {
    actorId: bar.actorId,
    target,
    attackNumber,
    ...(bar.combatantId === undefined ? {} : { combatantId: bar.combatantId }),
    ...(ranged === undefined ? {} : { ranged }),
  };
}

/** A basic action from the bar: only ever spends (no roll), and only while a combat is active. */
function barBasicAction(_slug: string, cost: number): void {
  const combatantId = actionBar.value?.combatantId;
  if (combatantId !== undefined) {
    void spendAndRecord(combatantId, cost);
  }
}

/** The GM's freeform action: spends its chosen cost and announces what it was in chat. */
function barFreeform(label: string, cost: number): void {
  const bar = actionBar.value;
  if (bar?.combatantId === undefined) {
    return;
  }
  void spendAndRecord(bar.combatantId, cost);
  void documents.send('chat.sendMessage', { text: `${bar.label} -- ${label}` });
}

/** "Undo last action": gives back whatever the bar's most recent recorded spend cost. */
function barUndo(): void {
  const combatantId = actionBar.value?.combatantId;
  if (combatantId !== undefined) {
    void combat.undoLastSpend(combatantId);
  }
}

/** Escape anywhere on the screen skips a pending strike's target. */
function onTableKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && pendingStrike.value !== undefined) {
    swingWithoutTarget();
  }
}

/** The strike whose range is shown on the map right now (hovered or focused in the bar). */
const hoveredStrike = ref<ActionBarStrike>();

/**
 * The range highlight: every cell the hovered strike could reach from the
 * selected token, shaded on the map. Empty with nothing hovered, no
 * selected token, or an unknown range (a ranged NPC strike).
 */
const mapHighlight = computed(() => {
  const strike = hoveredStrike.value;
  const token = selectedToken.value;
  const scene = scenes.shownScene;
  if (strike === undefined || token === undefined || scene === undefined) {
    return [];
  }
  const grid = gridForScene(scene);
  const feet = strike.ranged
    ? strike.rangeFeet
    : token.size * scene.grid.distance + (strike.reach ? 5 : 0);
  return cellsInRange(grid, { x: token.x, y: token.y }, token.size, {
    ranged: strike.ranged,
    feet,
  });
});

function barHoverStrike(strike: ActionBarStrike): void {
  hoveredStrike.value = strike;
}

function barUnhoverStrike(): void {
  hoveredStrike.value = undefined;
}

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

/** A strike rolled from the sheet: also waits on a target, carrying the typed-in DC along if there is one. */
function sheetAttack(id: string, attackNumber: 1 | 2 | 3): void {
  if (selectedId.value === undefined) {
    return;
  }
  const target = strikeTarget(id);
  const ranged = isRangedStrike(target);
  pendingStrike.value = {
    actorId: selectedId.value,
    target,
    attackNumber,
    ...('dc' in dcPayload.value ? { dc: dcPayload.value.dc } : {}),
    ...(ranged === undefined ? {} : { ranged }),
  };
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

/** Damage and healing run the dying chain server-side (M5 C.8a), never a plain field update. */
function hpDamage(amount: number, critical: boolean): void {
  if (selectedId.value !== undefined) {
    void documents.send('actor.applyDamage', {
      actorId: selectedId.value,
      amount,
      ...(critical ? { critical } : {}),
    });
  }
}

function hpHeal(amount: number): void {
  if (selectedId.value !== undefined) {
    void documents.send('actor.heal', { actorId: selectedId.value, amount });
  }
}

function rollRecovery(): void {
  if (selectedId.value !== undefined) {
    void documents.send('actor.rollRecovery', { actorId: selectedId.value });
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
  void combat.load(props.worldId);
});

/**
 * The map pane's height, resizable by the GM or a player: the turn bar, the
 * action tray, and the action bar all sit around the map now, and a fixed
 * height could starve one of them off screen.
 */
const {
  height: mapPaneHeight,
  startResize,
  onKey: onResizeKey,
  maxHeightNow: maxMapPaneHeightNow,
  MIN_MAP_PANE_HEIGHT,
} = useMapPaneResize();

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
  <div class="table" @keydown="onTableKeydown">
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
        :active-actor-id="combat.activeCombatant?.actorId"
        :seats="lobby.seats"
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

        <TurnBar
          v-if="turnBar !== undefined"
          :items="turnBar.items"
          :round="turnBar.round"
          :active="turnBar.active"
          :unseen-acting="combat.activeIsUnseen"
          :show-controls="lobby.mySeat?.isGM === true"
          @focus="(tokenId) => mapView?.focusToken(tokenId)"
          @start="combat.startCombat"
          @set-initiative="
            (combatantId, initiative) => combat.setInitiative(combatantId, initiative)
          "
        />

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
          :style="{ height: `${Math.round(mapPaneHeight)}px` }"
        >
          <MapView
            ref="mapView"
            :world-id="worldId"
            :highlighted-cells="mapHighlight"
            :targeting="pendingStrike !== undefined"
            :melee-targeting="pendingStrike?.ranged === false"
            :can-end-turn="canEndTurn"
            @open-actor="openSheetOf"
            @next-turn="combat.nextTurn"
            @pick-target="confirmTarget"
          />
        </section>

        <p v-if="pendingStrike !== undefined" class="targeting-banner" role="status">
          Choose a target on the map or the token list, or press Escape to swing without
          one.
        </p>

        <div
          class="map-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the map. Arrow keys resize, Home and End jump to the smallest and largest size."
          aria-controls="map-pane"
          :aria-valuenow="Math.round(mapPaneHeight)"
          :aria-valuemin="MIN_MAP_PANE_HEIGHT"
          :aria-valuemax="Math.round(maxMapPaneHeightNow())"
          tabindex="0"
          @pointerdown="startResize"
          @keydown="onResizeKey"
        ></div>

        <TurnControls
          v-if="turnBar?.active"
          :is-gm="lobby.mySeat?.isGM === true"
          :can-end-turn="canEndTurn"
          :free-movement="turnBar.freeMovement"
          @previous="combat.previousTurn"
          @next="combat.nextTurn"
          @end="combat.endCombat"
          @set-free-movement="combat.setFreeMovement"
        />

        <ActionTray
          v-if="actionTray !== undefined"
          :view="actionTray.view"
          :label="actionTray.label"
          :can-control="actionTray.canControl"
          @spend="spendTrayAction"
          @set-reaction="setTrayReaction"
        />

        <ActionBar
          v-if="actionBar !== undefined"
          :view="actionBar.view"
          :label="actionBar.label"
          :gm="actionBar.gm"
          :can-undo="actionBar.canUndo"
          @strike="barStrike"
          @basic-action="barBasicAction"
          @freeform="barFreeform"
          @undo="barUndo"
          @hover-strike="barHoverStrike"
          @unhover-strike="barUnhoverStrike"
        />

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
                @damage="hpDamage"
                @heal="hpHeal"
              />
              <DyingPanel
                v-if="selected.kind === 'character' || selected.kind === 'npc'"
                :actor="selected"
                :editable="canEdit"
                :is-gm="lobby.mySeat?.isGM === true"
                @set="
                  (slug, value) => sendCondition('actor.setCondition', { slug, value })
                "
                @remove="(slug) => sendCondition('actor.removeCondition', { slug })"
                @roll-recovery="rollRecovery"
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
                @attack="sheetAttack"
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
                :combatants="combatantOptions"
                @add="
                  (slug, value, duration) =>
                    sendCondition('actor.addCondition', {
                      slug,
                      ...(value === undefined ? {} : { value }),
                      ...(duration === undefined ? {} : { duration }),
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
  /* The inline style sets the real height (resizable); this is only a pre-JS fallback. */
  height: calc(100vh - 14rem);
  min-height: 24rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

/* A thin grip with a taller invisible hit area, so it's easy to grab without looking huge. */
.map-resize-handle {
  position: relative;
  flex: none;
  height: 6px;
  border-radius: 3px;
  background: var(--color-border);
  cursor: ns-resize;
  touch-action: none;
}
.map-resize-handle::before {
  content: '';
  position: absolute;
  inset: -10px 0;
}
.map-resize-handle:focus-visible {
  outline: 2px solid currentcolor;
  outline-offset: 2px;
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

.targeting-banner {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: 4px;
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
