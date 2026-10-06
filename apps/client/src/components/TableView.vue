<script setup lang="ts">
/**
 * The table: what a player sees once they hold a seat. It is **map-first**:
 * the map fills the screen and *everything* else overlays it -- there is no
 * page chrome left in flow at all (`feat/chrome-into-gear-menu` moved the
 * last of it, "Playing as" and the GM's content-import panel, into the gear
 * menu). Landmarks, each reachable by a skip link --
 *
 * - the **top strip** (`#party-bar`), inside `.top-stack`, over the map's
 *   top edge: `PartyBar`'s portraits while there is no active combat (with
 *   the GM's "Start combat" at its end), or `TurnBar`'s turn order once one
 *   starts, with `TurnControls` (end turn, end combat, free movement) at
 *   the strip's right end instead. Horizontal scroll, not wrap, once either
 *   is too crowded to fit (the user's own layout call) -- see
 *   `turnBar`/`canStartCombat` below. The preview-scene and targeting
 *   banners (`.top-banners`) stack directly below it, same column,
 * - the **map** filling the rest (an empty state until a scene is shown),
 * - the **character sheet**, a drawer that slides over the map's left edge
 *   (the characters this seat can see, a way to make a new one, and the chosen
 *   character's sheet). Opened by the gear menu's "Characters" item or by
 *   pressing a party card; Escape or "Close" shuts it and puts focus back
 *   where it was,
 * - the **chat** panel (`ChatLog.vue`), a 90%-opacity overlay in the map's
 *   bottom-left corner, with its own "Collapse" toggle.
 *
 * The **action dock** (`.action-dock`: `ActionTray`, the acting combatant's
 * actions, and `ActionBar`, the selected token's strikes) is centered over
 * the map's bottom edge, Owlcat-style, rather than pushing the map up from
 * below -- see `actionTray`/`actionBar` below. It centers within
 * `.action-dock-rail`, inset from both sides by chat's width so the dock
 * is truly centred yet never runs into chat, regardless of viewport width
 * (`.top-stack` uses the same real-width trick for the top strip, just
 * full-width since nothing else shares its row). The map's zoom/ruler
 * buttons sit middle-right so they stay clear of both. Every floating panel
 * shares one look (`--overlay-border`/`--overlay-radius`/`--overlay-shadow`,
 * `styles/tokens.css`) and one z-index scale, rather than each picking its
 * own.
 *
 * The GM also has a **Scenes** drawer, from the right edge of the map (the scene
 * manager: make, edit, preview, move the party to, and delete scenes), and
 * a **Game content** drawer (`ContentImportPanel.vue`: the GM's import
 * button, used to be its own row above the map).
 *
 * Everyone has a **Rules** drawer (milestone 6's encyclopedia, `RulesDrawer.vue`),
 * and there is a **Seats** drawer (`SeatRoster.vue`) and the GM's own **Manage
 * party** drawer (`PartyManager.vue`, moved out of the top strip to keep it
 * uncluttered) -- all five share the map's right edge, only one open at
 * once, see `closeOtherRightDrawers`. Rules opens from the gear menu's
 * "Rules" item or the `?` hotkey (ignored while typing in chat or a form
 * field, see `isTypingTarget`).
 *
 * The **gear menu** (`GearMenu.vue`) floats top-right over all of this: a
 * "Playing as <seat>" header line, then the Characters/Scenes/Rules/Seats/
 * Manage-party/Game-content drawer toggles, "Release seat", and the GM's
 * "Back to campaigns" -- there's no toolbar row left to put plain buttons,
 * or even plain text, in once the map fills the whole screen (ADR 0022).
 *
 * Every overlay sits on top of the map at every width rather than pushing
 * it, so the map never reflows under any of them. Tablets are supported
 * and phones are not (CLAUDE.md, Targets and budgets), so there is no
 * phone layout. Shown by `CampaignLobby` while this device holds a seat;
 * the lobby owns the realtime connection, this only reads the stores it
 * feeds.
 */
import type { HotbarAction, SituationalModifier } from '@hearthtable/core';
import { emptyHotbar, resolvePermission } from '@hearthtable/core';
import { parse as parseDice } from '@hearthtable/dice/pure';
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue';

import { uploadAsset } from '../api/assets.js';
import { useCombatStore } from '../stores/combat.js';
import { useDocumentsStore } from '../stores/documents.js';
import { useLobbyStore } from '../stores/lobby.js';
import { useScenesStore } from '../stores/scenes.js';
import { useWorldsStore } from '../stores/worlds.js';
import ActionBar from './ActionBar.vue';
import {
  actionBarView,
  activeModifiers,
  modifierSum,
  type ActionBarStrike,
  type GenericAction,
} from './actionBarModel.js';
import ActionTray from './ActionTray.vue';
import { actionTrayView } from './actionTrayModel.js';
import { slotForKey } from './hotbarModel.js';
import ChatLog from './ChatLog.vue';
import ContentImportPanel from './ContentImportPanel.vue';
import GearMenu from './GearMenu.vue';
import MapView from './map/MapView.vue';
import { gridForScene } from './map/mapGrid.js';
import { startActorDrag } from './map/placement.js';
import { cellsInRange } from './map/rangeHighlight.js';
import MonsterPicker from './scenes/MonsterPicker.vue';
import RulesDrawer from './RulesDrawer.vue';
import SceneManager from './scenes/SceneManager.vue';
import SeatRoster from './SeatRoster.vue';
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
const worldsStore = useWorldsStore();

/** The GM's "Back to campaigns": asked for with an inline alertdialog, since it affects the whole table, not just this browser. */
const confirmingLeave = ref(false);

async function leaveCampaign(): Promise<void> {
  confirmingLeave.value = false;
  await worldsStore.deactivate();
}

/**
 * The top strip (ADR 0022) shows `TurnBar` while a combat is running, or
 * `PartyBar` otherwise -- defined here only while one is actually active;
 * `canStartCombat` below covers the GM's own empty state instead of a third
 * shape of this object (CLAUDE.md: nothing else may start a combat).
 */
const turnBar = computed(() => {
  const active = combat.activeCombat;
  if (active?.status !== 'active') {
    return undefined;
  }
  return {
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
});

/** The GM's "Start combat", shown beside `PartyBar` in the top strip while there is no active combat to show `TurnBar` for instead. */
const canStartCombat = computed(
  () => turnBar.value === undefined && lobby.mySeat?.isGM === true,
);

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
 * The action bar: the map-selected token's strikes and generic action form, across
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
    modifiers: actor.modifiers ?? [],
    hotbar: actor.hotbar ?? emptyHotbar(),
  };
});

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
  const modifiers = activeModifiers(documents.actorById(pending.actorId)?.modifiers);
  void documents.send('actor.rollStrike', {
    actorId: pending.actorId,
    ...pending.target,
    ...(modifiers.length === 0 ? {} : { modifiers }),
    attackNumber: pending.attackNumber,
    ...(pending.dc === undefined ? {} : { dc: pending.dc }),
    ...(targetTokenId === undefined ? {} : { targetTokenId }),
  });
  if (pending.combatantId !== undefined) {
    void combat.spendAction(pending.combatantId, 1);
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

/** Why the last generic action was not sent, shown under its form. */
const actionError = ref<string>();

/** The action bar, for loading a hotbar slot from a number key. */
const actionBarEl = useTemplateRef<InstanceType<typeof ActionBar>>('actionBarEl');

/**
 * The generic action (ADR 0023): the player's own description, cost, dice
 * and the switched-on situational modifiers, for anything the system does not model. The dice
 * are checked first so a typo never spends the action; then, while a combat
 * is active, the cost is spent (a refused spend stops here -- the combat
 * store already shows why); then it posts one labelled roll, or a plain
 * message when there are no dice.
 */
async function barAction(action: GenericAction): Promise<void> {
  const bar = actionBar.value;
  if (bar === undefined) {
    return;
  }
  actionError.value = undefined;
  const bonus = modifierSum(bar.modifiers);
  const expression =
    action.dice === ''
      ? undefined
      : bonus === 0
        ? action.dice
        : `${action.dice}${bonus < 0 ? '-' : '+'}${Math.abs(bonus)}`;
  if (expression !== undefined) {
    const parsed = parseDice(expression);
    if (!parsed.ok) {
      actionError.value = `Those dice don't work: ${parsed.error.message}`;
      return;
    }
  }
  if (bar.combatantId !== undefined && action.cost !== 'free') {
    const spent =
      action.cost === 'reaction'
        ? await combat.setReaction(bar.combatantId, true)
        : await combat.spendAction(bar.combatantId, action.cost);
    if (!spent) {
      return;
    }
  }
  if (expression === undefined && action.text === '') {
    return;
  }
  const label = action.text === '' ? bar.label : `${bar.label} -- ${action.text}`;
  if (expression === undefined) {
    void documents.send('chat.sendMessage', { text: label });
  } else {
    void documents.send('chat.sendRoll', { expression, label });
  }
}

/** Whether `event` was typed into a text input, so a one-key hotkey (`?`) never fires mid-sentence in chat or a form field. */
function isTypingTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

/** Escape anywhere on the screen skips a pending strike's target. A number key loads its hotbar slot into the action form (never while typing).  `?` opens the Rules drawer (the encyclopedia, CLAUDE.md's north star) -- ignored while typing. */
function onTableKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && pendingStrike.value !== undefined) {
    swingWithoutTarget();
  }
  const slot = slotForKey(event.key);
  if (
    slot !== undefined &&
    !isTypingTarget(event) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    actionBar.value?.hotbar[slot] != null
  ) {
    event.preventDefault();
    actionBarEl.value?.loadSlot(slot);
    return;
  }
  if (event.key === '?' && !isTypingTarget(event)) {
    event.preventDefault();
    toggleRulesDrawer();
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
    // A check carries the roller's switched-on situational modifiers (ADR 0023).
    const modifiers =
      type === 'actor.rollCheck'
        ? activeModifiers(documents.actorById(selectedId.value)?.modifiers)
        : [];
    void documents.send(type, {
      actorId: selectedId.value,
      ...(modifiers.length === 0 ? {} : { modifiers }),
      ...payload,
    });
  }
}

/** Saves the selected action bar actor's hotbar (ten positions, each an action or empty). */
function setBarHotbar(hotbar: (HotbarAction | null)[]): void {
  const bar = actionBar.value;
  if (bar !== undefined) {
    void documents.send('actor.setQuickbar', { actorId: bar.actorId, hotbar });
  }
}

/** Saves the selected action bar actor's situational modifiers (they follow the player to any device). */
function setBarModifiers(modifiers: SituationalModifier[]): void {
  const bar = actionBar.value;
  if (bar !== undefined) {
    void documents.send('actor.setQuickbar', { actorId: bar.actorId, modifiers });
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
const rulesDrawerEl = useTemplateRef<HTMLElement>('rulesDrawer');
const seatsDrawerEl = useTemplateRef<HTMLElement>('seatsDrawer');
const partyDrawerEl = useTemplateRef<HTMLElement>('partyDrawer');
const contentDrawerEl = useTemplateRef<HTMLElement>('contentDrawer');

/** The character drawer (open state, focus in and back out); the GM's scene, Manage party, and Game content drawers; the Rules and Seats drawers (everyone's). */
const { open: drawerOpen, show: openDrawer, hide: closeDrawer } = useDrawer(drawerEl);
const {
  open: sceneDrawerOpen,
  show: openSceneDrawer,
  hide: closeSceneDrawer,
} = useDrawer(sceneDrawerEl);
const {
  open: rulesDrawerOpen,
  show: openRulesDrawer,
  hide: closeRulesDrawer,
} = useDrawer(rulesDrawerEl);
const {
  open: seatsDrawerOpen,
  show: openSeatsDrawer,
  hide: closeSeatsDrawer,
} = useDrawer(seatsDrawerEl);
const {
  open: partyDrawerOpen,
  show: openPartyDrawer,
  hide: closePartyDrawer,
} = useDrawer(partyDrawerEl);
const {
  open: contentDrawerOpen,
  show: openContentDrawer,
  hide: closeContentDrawer,
} = useDrawer(contentDrawerEl);

/**
 * Scenes, Rules, Seats, Manage party, and Game content all slide in from
 * the map's right edge (the character drawer already owns the left), so
 * only one of the five is ever shown at once -- opening any of them closes
 * the other four first, rather than letting them stack exactly on top of
 * each other.
 */
function closeOtherRightDrawers(
  except: 'scene' | 'rules' | 'seats' | 'party' | 'content',
): void {
  if (except !== 'scene') closeSceneDrawer();
  if (except !== 'rules') closeRulesDrawer();
  if (except !== 'seats') closeSeatsDrawer();
  if (except !== 'party') closePartyDrawer();
  if (except !== 'content') closeContentDrawer();
}

function toggleSceneDrawer(): void {
  if (sceneDrawerOpen.value) {
    closeSceneDrawer();
    return;
  }
  closeOtherRightDrawers('scene');
  void openSceneDrawer();
}

function toggleRulesDrawer(): void {
  if (rulesDrawerOpen.value) {
    closeRulesDrawer();
    return;
  }
  closeOtherRightDrawers('rules');
  void openRulesDrawer();
}

function toggleSeatsDrawer(): void {
  if (seatsDrawerOpen.value) {
    closeSeatsDrawer();
    return;
  }
  closeOtherRightDrawers('seats');
  void openSeatsDrawer();
}

function togglePartyDrawer(): void {
  if (partyDrawerOpen.value) {
    closePartyDrawer();
    return;
  }
  closeOtherRightDrawers('party');
  void openPartyDrawer();
}

function toggleContentDrawer(): void {
  if (contentDrawerOpen.value) {
    closeContentDrawer();
    return;
  }
  closeOtherRightDrawers('content');
  void openContentDrawer();
}

const mapView = useTemplateRef<InstanceType<typeof MapView>>('mapView');

/** True while a character is being dragged out of the roster, so the drawer can get out of the way of the drop. */
const placing = ref(false);

/** The GM's "Place on map": the token goes in the middle of the part of the map the open drawers leave visible. */
async function placeOnMap(actorId: string): Promise<void> {
  const rightDrawerEl = sceneDrawerOpen.value
    ? sceneDrawerEl.value
    : rulesDrawerOpen.value
      ? rulesDrawerEl.value
      : seatsDrawerOpen.value
        ? seatsDrawerEl.value
        : partyDrawerOpen.value
          ? partyDrawerEl.value
          : contentDrawerOpen.value
            ? contentDrawerEl.value
            : undefined;
  await mapView.value?.placeAtCentre(actorId, {
    left: drawerOpen.value ? (drawerEl.value?.offsetWidth ?? 0) : 0,
    right: rightDrawerEl?.offsetWidth ?? 0,
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

    <GearMenu
      :is-gm="lobby.mySeat?.isGM === true"
      :seat-name="seatName"
      @characters="drawerOpen ? closeDrawer() : openDrawer()"
      @scenes="toggleSceneDrawer"
      @rules="toggleRulesDrawer"
      @seats="toggleSeatsDrawer"
      @manage-party="togglePartyDrawer"
      @game-content="toggleContentDrawer"
      @release-seat="lobby.releaseSeat()"
      @leave-campaign="confirmingLeave = true"
    />

    <div
      v-if="confirmingLeave"
      class="leave-confirm"
      role="alertdialog"
      aria-labelledby="leave-question"
      @keydown.esc.stop="confirmingLeave = false"
    >
      <p id="leave-question">
        Leave this campaign? Everyone at the table is disconnected and sent back to the
        campaign list.
      </p>
      <button type="button" @click="leaveCampaign">Leave campaign</button>
      <button type="button" @click="confirmingLeave = false">Cancel</button>
    </div>

    <p v-if="documents.error" role="alert" class="status status-error">
      {{ documents.error }}
    </p>

    <div class="table-body">
      <div class="map-column">
        <div class="top-stack">
          <nav
            id="party-bar"
            class="top-strip"
            aria-label="Party or turn order"
            tabindex="-1"
          >
            <template v-if="turnBar !== undefined">
              <TurnBar
                :items="turnBar.items"
                :round="turnBar.round"
                :unseen-acting="combat.activeIsUnseen"
                :show-controls="lobby.mySeat?.isGM === true"
                @focus="(tokenId) => mapView?.focusToken(tokenId)"
                @set-initiative="
                  (combatantId, initiative) =>
                    combat.setInitiative(combatantId, initiative)
                "
              />
              <TurnControls
                :is-gm="lobby.mySeat?.isGM === true"
                :can-end-turn="canEndTurn"
                :free-movement="turnBar.freeMovement"
                @previous="combat.previousTurn"
                @next="combat.nextTurn"
                @end="combat.endCombat"
                @set-free-movement="combat.setFreeMovement"
              />
            </template>
            <template v-else>
              <PartyBar
                :members="documents.members"
                :selected-id="selectedId"
                :world-id="worldId"
                :active-actor-id="combat.activeCombatant?.actorId"
                :seats="lobby.seats"
                @select="openSheetOf"
              />
              <button
                v-if="canStartCombat"
                type="button"
                class="start-combat"
                @click="combat.startCombat"
              >
                Start combat
              </button>
            </template>
          </nav>

          <div class="top-banners">
            <p v-if="scenes.isPreviewing" class="preview-banner" role="status">
              You are previewing <strong>{{ scenes.shownScene?.name }}</strong
              >. The players are on <strong>{{ partyScene?.name ?? 'no scene' }}</strong
              >.
              <button type="button" @click="scenes.previewScene(undefined)">
                Back to the players' scene
              </button>
            </p>

            <p v-if="pendingStrike !== undefined" class="targeting-banner" role="status">
              Choose a target on the map or the token list, or press Escape to swing
              without one.
            </p>
          </div>
        </div>

        <section
          id="map-pane"
          class="map-pane"
          aria-label="Map"
          tabindex="-1"
          data-testid="map-pane"
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

        <p v-if="combat.error" role="alert" class="status status-error">
          {{ combat.error }}
        </p>

        <div class="action-dock-rail">
          <div
            v-if="actionTray !== undefined || actionBar !== undefined"
            class="action-dock"
          >
            <ActionTray
              v-if="actionTray !== undefined"
              :view="actionTray.view"
              :label="actionTray.label"
              :can-control="actionTray.canControl"
              @set-reaction="setTrayReaction"
              @undo="combat.undo"
            />

            <ActionBar
              v-if="actionBar !== undefined"
              ref="actionBarEl"
              :view="actionBar.view"
              :label="actionBar.label"
              :error="actionError"
              :modifiers="actionBar.modifiers"
              :hotbar="actionBar.hotbar"
              @strike="barStrike"
              @action="barAction"
              @set-modifiers="setBarModifiers"
              @set-hotbar="setBarHotbar"
              @hover-strike="barHoverStrike"
              @unhover-strike="barUnhoverStrike"
            />
          </div>
        </div>

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
            v-show="seatsDrawerOpen"
            id="seats-pane"
            ref="seatsDrawer"
            class="sheet-pane seats-pane"
            aria-labelledby="seats-heading"
            tabindex="-1"
            @keydown.esc.stop="closeSeatsDrawer"
          >
            <header class="drawer-header">
              <h2 id="seats-heading">Seats</h2>
              <button type="button" class="drawer-close" @click="closeSeatsDrawer">
                Close
              </button>
            </header>
            <SeatRoster />
          </section>
        </Transition>

        <Transition name="drawer">
          <section
            v-if="lobby.mySeat?.isGM"
            v-show="partyDrawerOpen"
            id="party-manager-pane"
            ref="partyDrawer"
            class="sheet-pane party-manager-pane"
            aria-labelledby="party-manager-heading"
            tabindex="-1"
            @keydown.esc.stop="closePartyDrawer"
          >
            <header class="drawer-header">
              <h2 id="party-manager-heading">Manage party</h2>
              <button type="button" class="drawer-close" @click="closePartyDrawer">
                Close
              </button>
            </header>
            <PartyManager
              :members="documents.members"
              :actors="documents.actors"
              @add="(actorId) => sendParty('party.addMember', { actorId })"
              @remove="(actorId) => sendParty('party.removeMember', { actorId })"
              @reorder="(memberIds) => sendParty('party.reorder', { memberIds })"
            />
          </section>
        </Transition>

        <Transition name="drawer">
          <section
            v-show="rulesDrawerOpen"
            id="rules-pane"
            ref="rulesDrawer"
            class="sheet-pane rules-pane"
            aria-labelledby="rules-heading"
            tabindex="-1"
            @keydown.esc.stop="closeRulesDrawer"
          >
            <header class="drawer-header">
              <h2 id="rules-heading">Rules</h2>
              <button type="button" class="drawer-close" @click="closeRulesDrawer">
                Close
              </button>
            </header>
            <RulesDrawer />
          </section>
        </Transition>

        <Transition name="drawer">
          <section
            v-if="lobby.mySeat?.isGM"
            v-show="contentDrawerOpen"
            id="content-pane"
            ref="contentDrawer"
            class="sheet-pane content-pane"
            aria-labelledby="content-heading"
            tabindex="-1"
            @keydown.esc.stop="closeContentDrawer"
          >
            <header class="drawer-header">
              <h2 id="content-heading">Game content</h2>
              <button type="button" class="drawer-close" @click="closeContentDrawer">
                Close
              </button>
            </header>
            <ContentImportPanel @imported="contentVersion += 1" />
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

        <div id="chat-pane" class="chat-pane" tabindex="-1">
          <ChatLog :world-id="worldId" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/**
 * Map-first (ADR 0022): once seated, this is the whole page -- `App.vue`
 * and `CampaignLobby.vue` hide their own chrome rather than this sitting
 * inside their padded, scrolling page.
 */
.table {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2);
  overflow: hidden;
  background: var(--color-bg);
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

.status {
  padding: var(--space-2) var(--space-3);
  border-radius: 4px;
}

.status-error {
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

/* The top strip (ADR 0022): PartyBar or TurnBar, horizontally scrollable
   once there are too many cards/portraits to fit, per the user's own
   layout call rather than wrapping to a second row. */
.top-strip {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  overflow-x: auto;
  max-width: 100%;
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  padding: var(--space-2) var(--space-3);
  background: var(--overlay-bg);
  box-shadow: var(--overlay-shadow);
}

.start-combat {
  flex: none;
  min-height: var(--touch-target-min);
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

.table-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

/* The map column is the positioning box for both the drawers and the chat
   overlay -- both overlay the map rather than sharing the page with it
   (ADR 0022). */
.map-column {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-2);
  min-height: 0;
}

/* The chat panel (ChatLog.vue) floats over the map's bottom-left corner,
   rather than sitting in its own page column. Height-capped to the column
   so a tall message list can never grow up over the top strip, and
   width-capped (ChatLog.vue's own `.chat-log`) so it never reaches into
   the action dock's rail below. */
.chat-pane {
  position: absolute;
  left: var(--space-2);
  bottom: var(--space-2);
  z-index: var(--z-overlay);
  max-width: calc(100% - 2 * var(--space-2));
  max-height: 100%;
}

/* Grows to fill the map column: the top strip, banners, and action dock
   all overlay it (`.top-stack`, `.action-dock-rail`) rather than sharing
   its flex row -- only a combat error (.status-error, rare) is still a
   flow sibling. */
.map-pane {
  flex: 1 1 auto;
  min-height: 16rem;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

/* The top-centre overlay: the party/turn-order strip, then the preview and
   targeting banners stacked right below it -- one column, so the two
   don't have to separately agree on a top offset. `left`/`right` (rather
   than `left: 50%` plus a transform) give this a real width to center
   its children *within*, the same reason `.action-dock-rail` does it
   below -- a shrink-to-fit box has nothing for a child's own `max-width:
   100%` to resolve against. */
.top-stack {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  right: var(--space-2);
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  /* The stack's own box spans the full width so its children have a real
     width to center within, but most of that box is empty space either
     side of the centred content -- `.action-dock-rail` hits the same
     problem below. `pointer-events: none` here, `auto` on the actual
     content, stops that empty space from blocking clicks to the map. */
  pointer-events: none;
}

.top-stack > * {
  pointer-events: auto;
}

.top-banners {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
}

/* The action dock's rail: inset from *both* sides by chat's width
   (`min(22rem, 100%)` -- ChatLog.vue's `.chat-log`), so the dock below can
   never run under chat, and -- because the insets match -- the rail's
   centre is the map's true centre. Insetting only the left side kept the
   dock clear of chat too, but centred it in a right-shifted box, about
   half of chat's width off the middle of the screen. */
.action-dock-rail {
  position: absolute;
  left: calc(min(22rem, 100%) + 2 * var(--space-2));
  right: calc(min(22rem, 100%) + 2 * var(--space-2));
  bottom: var(--space-2);
  display: flex;
  justify-content: center;
  pointer-events: none;
}

/* The action dock (ActionTray, ActionBar): docked bottom-center of its
   rail over the map, Owlcat-style, rather than pushing the map up from
   below. Solid `--color-surface`, not `--overlay-bg`'s 90% -- this is the
   one deliberate exception to the shared look: action-economy buttons need
   full legibility, where chat's whole point is staying see-through so the
   map underneath still reads. Border/radius/shadow still match every other
   panel. */
.action-dock {
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  overflow-x: auto;
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
  pointer-events: auto;
}

.sheet-pane {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: var(--z-drawer);
  width: min(36rem, 100%);
  overflow-y: auto;
  padding: var(--space-3);
  border: var(--overlay-border);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: 4px 0 16px rgb(0 0 0 / 0.25);
}

/* The scene drawer comes in from the right, so both can be open without covering each other entirely. */
.scene-pane {
  right: 0;
  left: auto;
  box-shadow: -4px 0 16px rgb(0 0 0 / 0.25);
}

/* Rules, Seats, Manage party, and Game content all share the scene
   drawer's right-edge slot -- closeOtherRightDrawers keeps only one of the
   five open at a time, so they never actually overlap. */
.rules-pane,
.seats-pane,
.party-manager-pane,
.content-pane {
  right: 0;
  left: auto;
  box-shadow: -4px 0 16px rgb(0 0 0 / 0.25);
}

.leave-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  margin: 0;
  border: 2px solid var(--color-accent);
  border-radius: 4px;
  background: var(--color-surface);
}

.leave-confirm p {
  margin: 0;
  flex-basis: 100%;
}

.leave-confirm button {
  min-height: var(--touch-target-min);
}

.targeting-banner {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
}

.preview-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: var(--overlay-radius);
  background: var(--color-surface);
  box-shadow: var(--overlay-shadow);
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
