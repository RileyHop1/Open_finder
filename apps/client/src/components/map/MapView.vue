<script setup lang="ts">
/**
 * The map: the scene on screen right now (`scenes.shownScene`, which is the
 * party's scene unless the GM is previewing another) drawn into a
 * `MapCanvas`, fitted to the view. With no scene to show it says so in words
 * and mounts no canvas at all, so a table that has not started playing never
 * starts PixiJS or asks the browser for a WebGL context.
 *
 * This owns the wiring between the stores and the picture: it loads the map
 * image (shrunk to the graphics card's limit, `mapImage.ts`), hands it to the
 * scene view (`sceneView.ts`), and keeps the camera fitted when the box is
 * resized. Redrawing is keyed on what actually changes the picture (the
 * scene's id, image, size, and grid), so a link added to the scene does not
 * reload the map.
 *
 * **Moving around** (`mapInput.ts`): drag to pan, wheel or pinch to zoom, and
 * the keyboard does all of it too (arrows pan, + and - zoom, 0 shows the whole
 * map), with three buttons for people on a tablet or with only a mouse. The
 * camera stays where the user put it across a redraw of the same scene and a
 * resize, and only follows the box while it is still the whole-map view.
 *
 * **Tokens** (`tokenModel.ts`): the shown scene's tokens are worked out once as
 * `TokenView`s and used twice, to draw the canvas and to fill the keyboard list
 * (`TokenList.vue`), so the two cannot disagree. Portraits are fetched lazily,
 * small, and a token shows its initials until its picture arrives (or if it
 * never does).
 *
 * **Selecting and moving** (`tokenStep.ts`): click a token, or press its button
 * in the list, to select it. If this seat may move it (the GM any, a player the
 * tokens of actors they own), the arrow keys then move it one grid square, shown
 * at once and rolled back if the server refuses; Escape lets go, and with
 * nothing movable selected the arrows pan the map as before. Each move is
 * announced in words for screen readers.
 *
 * **Dragging**: grabbing a token this seat may move picks it up. It follows the
 * pointer cell by cell (snapped, as the server will snap it), with the distance
 * moved in feet beside it; the others see a throttled live preview, and letting
 * go sends the one real move (`token.move`). Escape while holding puts it back.
 * Grabbing a token this seat may not move only selects it.
 */
import type { Application } from 'pixi.js';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { assetUrl } from '../../api/assets.js';
import { useDocumentsStore } from '../../stores/documents.js';
import { useLobbyStore } from '../../stores/lobby.js';
import { useScenesStore } from '../../stores/scenes.js';
import {
  type Camera,
  fitCamera,
  type Point,
  sceneToScreen,
  screenToScene,
  type Size,
} from './camera.js';
import MapCanvas from './MapCanvas.vue';
import { gridForScene } from './mapGrid.js';
import { loadMapBitmap } from './mapImage.js';
import { afterResize, createMapInput, type PointerSample } from './mapInput.js';
import { createThrottle } from './throttle.js';
import { canMoveToken, describeToken, tokenAt, tokenViews } from './tokenModel.js';
import { ARROW_DIRECTIONS, type Direction, dragTarget, stepToken } from './tokenStep.js';
import TokenList from './TokenList.vue';

/** A portrait is a small picture in a circle: this is more than enough, and keeps a big upload from costing GPU memory. */
const PORTRAIT_TEXTURE_SIZE = 256;
import { createSceneView, maxTextureSize, type SceneView } from './sceneView.js';

const props = defineProps<{ worldId: string }>();

const emit = defineEmits<{ openActor: [actorId: string] }>();

const scenes = useScenesStore();
const documents = useDocumentsStore();
const lobby = useLobbyStore();
const selectedId = ref<string>();
/** What was last done to a token, in words, for a screen reader's live region. */
const announcement = ref('');
const imageError = ref(false);

let app: Application | undefined;
let view: SceneView | undefined;
/** Bumped by every redraw and on unmount, so a map image that arrives late is dropped instead of drawn over a newer scene. */
let drawing = 0;
let camera: Camera | undefined;
/** True while the camera is the whole-map view, so a resize can refit it; false once the user has moved it. */
let fitted = true;
let drawnSceneId: string | undefined;
const surface = ref<HTMLElement | null>(null);
const dragging = ref(false);

/** How often a drag preview goes to the others while the pointer moves (about 20 a second; ADR 0005). */
const DRAG_PREVIEW_INTERVAL_MS = 50;

/** The token this seat is holding, if any. */
interface HeldToken {
  readonly pointerId: number;
  readonly tokenId: string;
  readonly label: string;
  readonly size: number;
  /** Where in the token the pointer took hold, in scene pixels from its centre. */
  readonly grab: Point;
  /** The cell centre it started in: the start of the measured distance. */
  readonly from: Point;
  /** Where it would land if let go now. */
  to: Point;
  feet: number;
}
let held: HeldToken | undefined;
/** Distance moved so far, drawn beside the held token. */
const readout = ref<{ x: number; y: number; feet: number }>();
const sendPreview = createThrottle(
  (tokenId: string, x: number, y: number) => scenes.sendDrag(tokenId, x, y),
  DRAG_PREVIEW_INTERVAL_MS,
);

/** What changes the picture: not the links, name, or kind. */
const drawKey = computed(() => {
  const scene = scenes.shownScene;
  return scene === undefined
    ? undefined
    : JSON.stringify([scene.id, scene.background, scene.width, scene.height, scene.grid]);
});

/** What to draw and list for each token on the shown scene. */
const views = computed(() =>
  tokenViews(
    scenes.shownTokens,
    scenes.shownScene?.grid.size ?? 100,
    (actorId) => {
      const actor = documents.actorById(actorId);
      return actor === undefined
        ? undefined
        : { name: actor.name, portrait: actor.portrait };
    },
    {
      selectedId: selectedId.value,
      canMove: (actorId) => canMoveToken(lobby.mySeat, documents.actorById(actorId)),
    },
  ),
);

const selectedView = computed(() => views.value.find((view) => view.selected));

// A token that goes away (deleted, hidden, the scene changed) cannot stay selected.
watch(views, (current) => {
  if (
    selectedId.value !== undefined &&
    !current.some((view) => view.id === selectedId.value)
  ) {
    selectedId.value = undefined;
  }
});

/** One grid square in `direction` for the selected token, shown at once and announced. */
async function moveSelected(direction: Direction): Promise<void> {
  const token = selectedView.value;
  const scene = scenes.shownScene;
  if (token === undefined || scene === undefined) {
    return;
  }
  const step = stepToken(gridForScene(scene), scene, token, direction);
  if (step === undefined) {
    announcement.value = `${token.label} is at the edge of the map.`;
    return;
  }
  const accepted = await scenes.moveToken(token.id, step.to.x, step.to.y);
  announcement.value = accepted ? `${token.label} moved ${step.feet} ft.` : '';
}

/** Selects a token from the list, then hands focus to the map so the arrow keys act on it. */
function selectFromList(tokenId: string): void {
  selectedId.value = tokenId;
  const token = views.value.find((view) => view.id === tokenId);
  announcement.value =
    token === undefined
      ? ''
      : `${describeToken(token)} selected${token.movable ? '. The arrow keys move it' : ''}.`;
  surface.value?.focus();
}

/** Decoded portraits by asset name, and the ones being fetched, so each is fetched once. */
const portraits = new Map<string, ImageBitmap>();
const fetchingPortraits = new Set<string>();

function drawTokens(): void {
  view?.setTokens(views.value, portraits, scenes.shownScene?.grid.size ?? 100);
}

function loadPortraits(): void {
  const current = app;
  if (current === undefined) {
    return;
  }
  for (const { portrait } of views.value) {
    if (
      portrait === undefined ||
      portraits.has(portrait) ||
      fetchingPortraits.has(portrait)
    ) {
      continue;
    }
    fetchingPortraits.add(portrait);
    void loadMapBitmap(assetUrl(props.worldId, portrait), PORTRAIT_TEXTURE_SIZE)
      .then((bitmap) => {
        if (app !== current) {
          bitmap.close();
          return;
        }
        portraits.set(portrait, bitmap);
        drawTokens();
      })
      .catch(() => {
        // No picture: the token keeps its initials.
      })
      .finally(() => fetchingPortraits.delete(portrait));
  }
}

function viewportSize(): Size {
  return app === undefined
    ? { width: 1, height: 1 }
    : { width: app.screen.width, height: app.screen.height };
}

function apply(next: Camera, isFitted: boolean): void {
  camera = next;
  fitted = isFitted;
  view?.setCamera(next, viewportSize());
}

/** Fits the box on first draw and on a new scene; otherwise keeps where the user is looking, within the limits. */
function refit(newScene: boolean): void {
  const scene = scenes.shownScene;
  if (app === undefined || view === undefined || scene === undefined) {
    return;
  }
  const viewport = viewportSize();
  if (camera === undefined || newScene) {
    apply(fitCamera(scene, viewport), true);
  } else {
    apply(afterResize(camera, fitted, scene, viewport), fitted);
  }
}

const input = createMapInput({
  camera: () => camera ?? { x: 0, y: 0, zoom: 1 },
  scene: () => (view === undefined ? undefined : scenes.shownScene),
  viewport: viewportSize,
  apply,
});

function sample(event: PointerEvent): PointerSample {
  const box = surface.value?.getBoundingClientRect();
  return {
    pointerId: event.pointerId,
    x: event.clientX - (box?.left ?? 0),
    y: event.clientY - (box?.top ?? 0),
  };
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1) {
    return;
  }
  surface.value?.focus();
  const point = sample(event);
  const hit = tokenAt(
    views.value,
    screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), point),
  );
  if (hit !== undefined) {
    // A token is selected, not panned. If this seat may move it, it is also picked up.
    selectedId.value = hit.id;
    const scene = scenes.shownScene;
    if (hit.movable && scene !== undefined && held === undefined) {
      const pointer = screenToScene(
        camera ?? { x: 0, y: 0, zoom: 1 },
        viewportSize(),
        point,
      );
      const from = gridForScene(scene).snap(hit, hit.size);
      held = {
        pointerId: event.pointerId,
        tokenId: hit.id,
        label: hit.label,
        size: hit.size,
        grab: { x: pointer.x - hit.x, y: pointer.y - hit.y },
        from,
        to: from,
        feet: 0,
      };
      surface.value?.setPointerCapture(event.pointerId);
      dragging.value = true;
    }
    return;
  }
  surface.value?.setPointerCapture(event.pointerId);
  input.pointerDown(point);
  dragging.value = true;
}

function onPointerMove(event: PointerEvent): void {
  const point = sample(event);
  const current = held;
  if (current === undefined) {
    input.pointerMove(point);
    return;
  }
  const scene = scenes.shownScene;
  if (event.pointerId !== current.pointerId || scene === undefined) {
    return;
  }
  const pointer = screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), point);
  const { to, feet } = dragTarget(gridForScene(scene), scene, {
    pointer,
    grab: current.grab,
    from: current.from,
    size: current.size,
  });
  current.to = to;
  current.feet = feet;
  scenes.setLocalDrag(current.tokenId, to.x, to.y);
  sendPreview(current.tokenId, to.x, to.y);
  const place = sceneToScreen(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), to);
  readout.value = { x: place.x, y: place.y, feet };
}

/** Puts the held token down: sends the move if it went anywhere, and lets go either way. */
async function dropToken(send: boolean): Promise<void> {
  const current = held;
  held = undefined;
  readout.value = undefined;
  sendPreview.cancel();
  if (current === undefined) {
    return;
  }
  const moved = current.to.x !== current.from.x || current.to.y !== current.from.y;
  if (!send || !moved) {
    scenes.clearLocalDrag(current.tokenId);
    return;
  }
  // The move is pending before the drag is released, so the token never flickers back.
  const accepted = scenes.moveToken(current.tokenId, current.to.x, current.to.y);
  scenes.clearLocalDrag(current.tokenId);
  announcement.value = (await accepted)
    ? `${current.label} moved ${current.feet} ft.`
    : '';
}

function onPointerUp(event: PointerEvent): void {
  if (held !== undefined) {
    if (event.pointerId === held.pointerId) {
      void dropToken(event.type === 'pointerup');
      dragging.value = false;
    }
    return;
  }
  input.pointerUp(sample(event));
  dragging.value = input.dragging;
}

function onWheel(event: WheelEvent): void {
  const box = surface.value?.getBoundingClientRect();
  input.wheel({
    x: event.clientX - (box?.left ?? 0),
    y: event.clientY - (box?.top ?? 0),
    deltaY: event.deltaY,
    deltaMode: event.deltaMode,
    ctrlKey: event.ctrlKey,
  });
}

function onKeyDown(event: KeyboardEvent): void {
  // Ctrl, Cmd and Alt belong to the browser (Ctrl + zooms the page).
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const direction = ARROW_DIRECTIONS[event.key];
  if (direction !== undefined && selectedView.value?.movable === true) {
    event.preventDefault();
    void moveSelected(direction);
    return;
  }
  if (event.key === 'Escape' && held !== undefined) {
    // Put the held token back where it was picked up.
    void dropToken(false);
    dragging.value = false;
    announcement.value = 'Move cancelled.';
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && selectedId.value !== undefined) {
    selectedId.value = undefined;
    announcement.value = 'Selection cleared.';
    event.preventDefault();
    return;
  }
  if (input.keyDown(event.key, event.shiftKey)) {
    event.preventDefault();
  }
}

async function redraw(): Promise<void> {
  const scene = scenes.shownScene;
  if (app === undefined || view === undefined || scene === undefined) {
    return;
  }
  const mine = ++drawing;
  let background: ImageBitmap | undefined;
  imageError.value = false;
  if (scene.background !== undefined) {
    try {
      background = await loadMapBitmap(
        assetUrl(props.worldId, scene.background),
        maxTextureSize(app),
      );
    } catch {
      imageError.value = true;
    }
  }
  if (mine !== drawing || view === undefined) {
    background?.close();
    return;
  }
  view.update(scene, background);
  refit(scene.id !== drawnSceneId);
  drawnSceneId = scene.id;
  drawTokens();
  loadPortraits();
}

async function onReady(created: Application): Promise<void> {
  const pixi = await import('pixi.js');
  app = created;
  view = createSceneView(pixi, created);
  created.renderer.on('resize', () => refit(false));
  await redraw();
}

function release(): void {
  drawing += 1;
  view?.destroy();
  view = undefined;
  app = undefined;
  for (const bitmap of portraits.values()) {
    bitmap.close();
  }
  portraits.clear();
  fetchingPortraits.clear();
  camera = undefined;
  fitted = true;
  drawnSceneId = undefined;
}

// Tokens and the actors behind them change often (a drag preview, a rename): redraw only the tokens.
watch([views, () => scenes.shownScene?.grid.size], () => {
  drawTokens();
  loadPortraits();
});

watch(drawKey, (key, previous) => {
  if (key === undefined) {
    // No scene any more: the canvas is about to go, and takes the application with it.
    release();
  } else if (key !== previous) {
    void redraw();
  }
});

onBeforeUnmount(() => {
  if (held !== undefined) {
    scenes.clearLocalDrag(held.tokenId);
    held = undefined;
  }
  sendPreview.cancel();
  release();
});
</script>

<template>
  <div class="map-view">
    <div
      v-if="scenes.shownScene"
      ref="surface"
      class="map-surface"
      :class="{ 'is-dragging': dragging }"
      tabindex="0"
      role="group"
      aria-label="Map. Arrow keys move the view, plus and minus zoom, zero shows the whole map."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @keydown="onKeyDown"
    >
      <MapCanvas @ready="onReady" />
      <output
        v-if="readout"
        class="move-readout"
        :style="{ left: `${readout.x}px`, top: `${readout.y}px` }"
      >
        {{ readout.feet }} ft
      </output>
      <div class="map-zoom" role="group" aria-label="Zoom" @pointerdown.stop>
        <button
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          @click="input.zoomBy(1.25)"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          @click="input.zoomBy(0.8)"
        >
          −
        </button>
        <button type="button" title="Show the whole map" @click="input.fit()">Fit</button>
      </div>
    </div>
    <p v-else class="map-empty">
      No scene is showing yet. When the GM moves the party to a scene, its map appears
      here.
    </p>
    <TokenList
      :views="views"
      @select="selectFromList"
      @open="(actorId) => emit('openActor', actorId)"
    />
    <p class="visually-hidden" role="status">{{ announcement }}</p>
    <p v-if="scenes.error" class="map-note map-error" role="alert">{{ scenes.error }}</p>
    <p v-if="imageError" class="map-note" role="status">
      The map picture could not be loaded, so a blank map is shown.
    </p>
  </div>
</template>

<style scoped>
.map-view {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.map-surface {
  position: absolute;
  inset: 0;
  cursor: grab;
  /* The map handles touch itself: without this the browser scrolls or zooms the page instead. */
  touch-action: none;
}

.map-surface.is-dragging {
  cursor: grabbing;
}

.move-readout {
  position: absolute;
  padding: var(--space-1) var(--space-2);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  font-weight: bold;
  /* Above the held token, centred on it, and never in the way of the pointer. */
  transform: translate(-50%, calc(-100% - 2.5rem));
  pointer-events: none;
  white-space: nowrap;
}

.map-zoom {
  position: absolute;
  right: var(--space-2);
  top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.map-zoom button {
  min-width: var(--touch-target-min);
  min-height: var(--touch-target-min);
  cursor: pointer;
}

.map-empty {
  max-width: 28rem;
  margin: 0;
  padding: var(--space-4);
  color: var(--color-text-muted);
  text-align: center;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.map-error {
  top: var(--space-2);
  right: auto;
  bottom: auto;
  left: var(--space-2);
  background: var(--color-danger);
  color: var(--color-accent-contrast);
}

.map-note {
  position: absolute;
  right: var(--space-2);
  bottom: var(--space-2);
  margin: 0;
  padding: var(--space-1) var(--space-2);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
}
</style>
