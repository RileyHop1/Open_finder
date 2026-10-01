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
 */
import type { Application } from 'pixi.js';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { assetUrl } from '../../api/assets.js';
import { useDocumentsStore } from '../../stores/documents.js';
import { useScenesStore } from '../../stores/scenes.js';
import { type Camera, fitCamera, type Size } from './camera.js';
import MapCanvas from './MapCanvas.vue';
import { loadMapBitmap } from './mapImage.js';
import { afterResize, createMapInput, type PointerSample } from './mapInput.js';
import { tokenViews } from './tokenModel.js';
import TokenList from './TokenList.vue';

/** A portrait is a small picture in a circle: this is more than enough, and keeps a big upload from costing GPU memory. */
const PORTRAIT_TEXTURE_SIZE = 256;
import { createSceneView, maxTextureSize, type SceneView } from './sceneView.js';

const props = defineProps<{ worldId: string }>();

const emit = defineEmits<{ openActor: [actorId: string] }>();

const scenes = useScenesStore();
const documents = useDocumentsStore();
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

/** What changes the picture: not the links, name, or kind. */
const drawKey = computed(() => {
  const scene = scenes.shownScene;
  return scene === undefined
    ? undefined
    : JSON.stringify([scene.id, scene.background, scene.width, scene.height, scene.grid]);
});

/** What to draw and list for each token on the shown scene. */
const views = computed(() =>
  tokenViews(scenes.shownTokens, scenes.shownScene?.grid.size ?? 100, (actorId) => {
    const actor = documents.actorById(actorId);
    return actor === undefined
      ? undefined
      : { name: actor.name, portrait: actor.portrait };
  }),
);

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
  surface.value?.setPointerCapture(event.pointerId);
  surface.value?.focus();
  input.pointerDown(sample(event));
  dragging.value = true;
}

function onPointerUp(event: PointerEvent): void {
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
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    input.keyDown(event.key, event.shiftKey)
  ) {
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

onBeforeUnmount(release);
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
      @pointermove="input.pointerMove(sample($event))"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @keydown="onKeyDown"
    >
      <MapCanvas @ready="onReady" />
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
    <TokenList :views="views" @open="(actorId) => emit('openActor', actorId)" />
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
