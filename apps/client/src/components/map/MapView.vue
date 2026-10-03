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
 *
 * **Placing tokens** (GM): dropping a character from the roster onto the map puts
 * a token there, and `placeAtCentre` (for the roster's "Place on map" button, the
 * keyboard route to the same thing) puts one in the middle of what can be seen.
 * The server sizes and snaps it; it appears when the broadcast arrives.
 *
 * **The token menu** (GM, `TokenMenu.vue`): right-click a token, or select one and
 * press the Menu key or Shift+F10, to hide or show it, rename or resize it, or
 * remove it from the map. It closes on Escape (focus goes back to the map), on a
 * click elsewhere, and when its token goes away.
 *
 * **Exits** (GM, `exitModel.ts`): a scene's links are drawn as labelled markers and
 * listed beside the tokens. Pressing one (or its list button) asks "Move the party
 * to <scene>?", and yes sends `scene.activate`, arriving at the target's own exit
 * back to this scene if it has one. The players' screens follow.
 *
 * **Making and removing exits** (GM, `ExitMenu.vue`): right-click empty ground (or
 * press the Menu key / Shift+F10 with no token selected, for the middle of the
 * view) to add an exit there, and right-click an exit's marker to remove it. The
 * scene's settings have the same two as a form.
 *
 * **The ruler** (`ruler.ts`): the Ruler button, or M, turns it on; each click adds a
 * point (on the cell's centre) and the distance along the route, by the scene's
 * grid rules, follows the pointer. Backspace takes the last point back; M or
 * Escape puts it away. It is local to this screen. The keyboard equivalent is in
 * the token list, which says how far each token is from the selected one.
 */
import { TEMPLATE_SHAPES, type Cell, type TemplateShape } from '@hearthtable/core';
import type { Application } from 'pixi.js';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import { assetUrl } from '../../api/assets.js';
import { useCombatStore } from '../../stores/combat.js';
import { useDocumentsStore } from '../../stores/documents.js';
import { useLobbyStore } from '../../stores/lobby.js';
import { useScenesStore } from '../../stores/scenes.js';
import {
  type Camera,
  constrainCamera,
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
import ExitMenu from './ExitMenu.vue';
import { ACTOR_DRAG_TYPE, type Covered, viewCentre } from './placement.js';
import { cellsFor } from './templateCells.js';
import {
  COMPASS_DIRECTIONS,
  type CompassDirection,
  compassAim,
  placePayload,
} from './templatePlacement.js';
import {
  arrivalPoint,
  type ExitView,
  exitAt,
  exitRadius,
  exitViews,
} from './exitModel.js';
import { rulerFeet, rulerPoint, tokenDistances } from './ruler.js';
import { createThrottle } from './throttle.js';
import {
  canMoveToken,
  describeToken,
  tokenAt,
  type TokenView,
  tokenViews,
} from './tokenModel.js';
import { ARROW_DIRECTIONS, type Direction, dragTarget, stepToken } from './tokenStep.js';
import TemplateList from './TemplateList.vue';
import TokenList from './TokenList.vue';
import TokenMenu from './TokenMenu.vue';

/** A portrait is a small picture in a circle: this is more than enough, and keeps a big upload from costing GPU memory. */
const PORTRAIT_TEXTURE_SIZE = 256;
import { createSceneView, maxTextureSize, type SceneView } from './sceneView.js';

const props = defineProps<{
  worldId: string;
  /** The action bar's range highlight (TableView.vue): shaded red, under the tokens. */
  highlightedCells?: readonly Cell[] | undefined;
  /**
   * While a strike is waiting on a target (TableView.vue), a token click here
   * or in the list below picks it instead of selecting it -- so aiming at an
   * enemy never steals the acting token's own selection and action bar away.
   */
  targeting?: boolean;
}>();

const emit = defineEmits<{
  openActor: [actorId: string];
  nextTurn: [];
  pickTarget: [tokenId: string];
}>();

const scenes = useScenesStore();
const documents = useDocumentsStore();
const combat = useCombatStore();
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
      activeTokenId: combat.activeCombatant?.tokenId,
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

/** The cells every placed template on this scene covers (M5 C.9a), under the tokens. */
const placedTemplateCells = computed<Cell[]>(() => {
  const scene = scenes.shownScene;
  if (scene === undefined) {
    return [];
  }
  const grid = gridForScene(scene);
  return scenes.shownTemplates.flatMap((template) =>
    cellsFor(grid, template, scenes.shownTokens),
  );
});

/** The template layer: placed templates plus the pending one being placed (M5 C.9b), same shading for both. */
const templateCells = computed<Cell[]>(() => [
  ...placedTemplateCells.value,
  ...templatePreviewCells.value,
]);

function drawTokens(): void {
  view?.setTokens(views.value, portraits, scenes.shownScene?.grid.size ?? 100);
  view?.setExits(exits.value, scenes.shownScene?.grid.size ?? 100);
  view?.setRuler(rulerPath.value, scenes.shownScene?.grid.size ?? 100);
  if (scenes.shownScene !== undefined) {
    view?.setHighlightedCells(props.highlightedCells ?? [], scenes.shownScene.grid);
    view?.setTemplateCells(templateCells.value, scenes.shownScene.grid);
  }
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
  menu.value = undefined;
  exitMenu.value = undefined;
  surface.value?.focus();
  const point = sample(event);
  if (rulerOn.value && event.button === 0) {
    const spot = rulerAt(point);
    const last = rulerPoints.value[rulerPoints.value.length - 1];
    if (spot !== undefined && (last?.x !== spot.x || last?.y !== spot.y)) {
      rulerPoints.value = [...rulerPoints.value, spot];
      const scene = scenes.shownScene;
      if (scene !== undefined && rulerPoints.value.length > 1) {
        announcement.value = `Ruler: ${rulerFeet(gridForScene(scene), rulerPoints.value)} ft so far.`;
      }
    }
    return;
  }
  if (placingTemplate.value && event.button === 0) {
    const scenePoint = screenToScene(
      camera ?? { x: 0, y: 0, zoom: 1 },
      viewportSize(),
      point,
    );
    if (templateShape.value === 'emanation') {
      const source = tokenAt(views.value, scenePoint);
      if (source !== undefined) {
        templateTokenId.value = source.id;
      }
    } else {
      const scene = scenes.shownScene;
      if (scene !== undefined) {
        templateOrigin.value =
          templateShape.value === 'line'
            ? scenePoint
            : gridForScene(scene).snap(scenePoint, 1);
      }
    }
    return;
  }
  const hit = tokenAt(
    views.value,
    screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), point),
  );
  if (hit !== undefined) {
    if (props.targeting) {
      emit('pickTarget', hit.id);
      return;
    }
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
  const pressed = exitAt(
    exits.value,
    screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), point),
    exitRadius(scenes.shownScene?.grid.size ?? 100),
  );
  if (pressed !== undefined) {
    void askExit(pressed.id);
    return;
  }
  surface.value?.setPointerCapture(event.pointerId);
  input.pointerDown(point);
  dragging.value = true;
}

function onPointerMove(event: PointerEvent): void {
  const point = sample(event);
  if (rulerOn.value) {
    rulerCursor.value = rulerAt(point);
  }
  if (
    placingTemplate.value &&
    (templateShape.value === 'cone' || templateShape.value === 'line') &&
    templateOrigin.value !== undefined
  ) {
    templateAim.value = screenToScene(
      camera ?? { x: 0, y: 0, zoom: 1 },
      viewportSize(),
      point,
    );
  }
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

/** The ruler: on or off, its points so far, and where the pointer is now. */
const rulerOn = ref(false);
const rulerPoints = ref<Point[]>([]);
const rulerCursor = ref<Point>();
const rulerPath = computed(() =>
  rulerCursor.value === undefined
    ? rulerPoints.value
    : [...rulerPoints.value, rulerCursor.value],
);
const rulerReadout = computed(() => {
  const scene = scenes.shownScene;
  const cursor = rulerCursor.value;
  if (
    !rulerOn.value ||
    scene === undefined ||
    cursor === undefined ||
    camera === undefined
  ) {
    return undefined;
  }
  const place = sceneToScreen(camera, viewportSize(), cursor);
  return {
    x: place.x,
    y: place.y,
    feet: rulerFeet(gridForScene(scene), rulerPoints.value, cursor),
  };
});

function clearRuler(): void {
  rulerPoints.value = [];
  rulerCursor.value = undefined;
}

function setRuler(on: boolean): void {
  rulerOn.value = on;
  clearRuler();
  announcement.value = on
    ? 'Ruler on. Click to measure, Backspace to undo a point, M or Escape to stop. The token list says how far each token is from the selected one.'
    : 'Ruler off.';
}

/** Where the pointer is on the scene, snapped for the ruler. */
function rulerAt(point: Point): Point | undefined {
  const scene = scenes.shownScene;
  return scene === undefined
    ? undefined
    : rulerPoint(
        gridForScene(scene),
        scene,
        screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), point),
      );
}

/**
 * Placing an area template (M5 C.9b): a shape, its size, and, while the tool
 * is on, the origin (click, or the source token for an emanation) and, for a
 * cone or line, where it aims -- set by hovering (it follows the pointer, as
 * the ruler's cursor does) or by one of the eight compass buttons, the
 * keyboard route to the same rotation. Nothing is sent until "Place
 * template" or Enter: the preview is purely local.
 */
const placingTemplate = ref(false);
const templateShape = ref<TemplateShape>('burst');
const templateFeet = ref(20);
const templateWidthFeet = ref(5);
const templateLabel = ref('');
const templateOrigin = ref<Point>();
const templateAim = ref<Point>();
/** Empty while none is chosen: the placeholder `<option>` needs a real string value. */
const templateTokenId = ref('');

function clearTemplatePlacement(): void {
  templateOrigin.value = undefined;
  templateAim.value = undefined;
  templateTokenId.value = '';
}

function setPlacingTemplate(on: boolean): void {
  placingTemplate.value = on;
  clearTemplatePlacement();
  if (on) {
    setRuler(false);
  }
  announcement.value = on
    ? 'Placing a template. Click the map for its origin (or pick a token for an emanation), Escape to stop.'
    : 'Template placement off.';
}

/** The pending template as `templateCells.ts` and `templatePlacement.ts` need it. */
const pendingTemplate = computed(() => ({
  shape: templateShape.value,
  origin: templateOrigin.value,
  aim: templateAim.value,
  feet: templateFeet.value,
  widthFeet: templateWidthFeet.value,
  tokenId: templateTokenId.value === '' ? undefined : templateTokenId.value,
  label: templateLabel.value.trim() === '' ? undefined : templateLabel.value.trim(),
}));

/** The cells the pending template would cover, previewed live as it is positioned. */
const templatePreviewCells = computed<Cell[]>(() => {
  const scene = scenes.shownScene;
  const pending = pendingTemplate.value;
  if (scene === undefined) {
    return [];
  }
  const origin =
    pending.shape === 'emanation'
      ? views.value.find((view) => view.id === pending.tokenId)
      : pending.origin;
  if (origin === undefined) {
    return [];
  }
  if (
    (pending.shape === 'cone' || pending.shape === 'line') &&
    pending.aim === undefined
  ) {
    return [];
  }
  return cellsFor(
    gridForScene(scene),
    {
      shape: pending.shape,
      x: origin.x,
      y: origin.y,
      toX: pending.aim?.x,
      toY: pending.aim?.y,
      feet: pending.feet,
      widthFeet: pending.widthFeet,
      tokenId: pending.tokenId,
    },
    views.value,
  );
});

/** Tokens caught by the live preview, visible to this seat -- the final chat message also splits out hidden ones for the GM. */
const templateCaught = computed(() => {
  const scene = scenes.shownScene;
  const cells = templatePreviewCells.value;
  if (scene === undefined || cells.length === 0) {
    return [];
  }
  const grid = gridForScene(scene);
  const covered = new Set(cells.map((cell) => `${cell.col},${cell.row}`));
  return views.value.filter((view) =>
    grid
      .cellsUnder({ center: { x: view.x, y: view.y }, size: view.size })
      .some((cell) => covered.has(`${cell.col},${cell.row}`)),
  );
});

/** The `template.place` payload for the pending template, or undefined when it is not yet placeable. */
const templatePayload = computed(() => {
  const scene = scenes.shownScene;
  return scene === undefined ? undefined : placePayload(scene.id, pendingTemplate.value);
});

function rotateTemplate(direction: CompassDirection): void {
  const scene = scenes.shownScene;
  const origin = templateOrigin.value;
  if (scene === undefined || origin === undefined) {
    return;
  }
  templateAim.value = compassAim(scene.grid, origin, templateFeet.value, direction);
}

async function confirmTemplate(): Promise<void> {
  const payload = templatePayload.value;
  if (payload === undefined) {
    return;
  }
  const accepted = await scenes.send('template.place', payload);
  announcement.value = accepted
    ? 'Template placed.'
    : (scenes.error ?? 'Template refused.');
  if (accepted) {
    clearTemplatePlacement();
  }
}

/** How far each other token is from the selected one, for the keyboard list. */
const distances = computed(() => {
  const scene = scenes.shownScene;
  return selectedId.value === undefined || scene === undefined
    ? {}
    : tokenDistances(gridForScene(scene), views.value, selectedId.value);
});

/** The scene's exits: only the GM moves the party, so only the GM is shown them. */
const exits = computed(() =>
  lobby.mySeat?.isGM === true ? exitViews(scenes.shownScene, scenes.scenes) : [],
);

/** The exit the GM has pressed, while "Move the party?" waits for an answer. */
const pendingExit = ref<ExitView>();
const exitMove = useTemplateRef<HTMLElement>('exitMove');

async function askExit(exitId: string): Promise<void> {
  pendingExit.value = exits.value.find((exit) => exit.id === exitId);
  await nextTick();
  exitMove.value?.focus();
  // A press on the map is followed by the browser moving focus to the map itself, so look again a beat later.
  globalThis.setTimeout(() => exitMove.value?.focus(), 0);
}

function cancelExit(): void {
  if (pendingExit.value !== undefined) {
    pendingExit.value = undefined;
    surface.value?.focus();
  }
}

async function confirmExit(): Promise<void> {
  const exit = pendingExit.value;
  const from = scenes.shownScene;
  if (exit === undefined || from === undefined) {
    return;
  }
  pendingExit.value = undefined;
  const at = arrivalPoint(
    scenes.scenes.find((scene) => scene.id === exit.targetSceneId),
    from.id,
  );
  const accepted = await scenes.send('scene.activate', {
    sceneId: exit.targetSceneId,
    ...(at === undefined ? {} : { at }),
  });
  if (accepted) {
    // The party is there now, so there is nothing left to preview.
    scenes.previewScene(undefined);
    announcement.value = `The party moved to ${exit.targetName ?? 'the next scene'}.`;
  }
  surface.value?.focus();
}

/** The open token menu: whose, and where (pixels in the map). */
const menu = ref<{ tokenId: string; x: number; y: number }>();
const menuToken = computed(() =>
  views.value.find((view) => view.id === menu.value?.tokenId),
);

/** Whether the menu's token can be offered "Add to combat": a combat is running and it has not joined yet. */
const menuTokenCanJoinCombat = computed(
  () =>
    combat.activeCombat?.status === 'active' &&
    menu.value !== undefined &&
    combat.combatantByToken(menu.value.tokenId) === undefined,
);

/** The menu's token's movement grant, or undefined with no active combat (hides the item). */
const menuTokenMovementGrant = computed(() => {
  if (combat.activeCombat?.status !== 'active' || menu.value === undefined) {
    return undefined;
  }
  return combat.combatantByToken(menu.value.tokenId)?.movementGrant ?? false;
});

/** How big the menu is allowed to be, so it can be kept inside the map when it opens near an edge. */
const MENU_ROOM = { width: 220, height: 180 };

/** Where a pop-up for something at `screen` sits: just beside it, and kept inside the map. */
function menuSpot(screen: Point): { x: number; y: number } {
  const room = viewportSize();
  return {
    x: Math.max(0, Math.min(screen.x + 12, room.width - MENU_ROOM.width)),
    y: Math.max(0, Math.min(screen.y + 12, room.height - MENU_ROOM.height)),
  };
}

function openMenu(token: TokenView): void {
  const scene = scenes.shownScene;
  if (lobby.mySeat?.isGM !== true || scene === undefined) {
    return;
  }
  const at = sceneToScreen(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), token);
  menu.value = { tokenId: token.id, ...menuSpot(at) };
  selectedId.value = token.id;
}

/** The open exit pop-up: adding an exit at `at` (scene pixels), or removing `exitId`; and where it sits. */
const exitMenu = ref<{
  mode: 'add' | 'remove';
  x: number;
  y: number;
  at: Point;
  exitId?: string;
}>();
const menuExit = computed(() =>
  exits.value.find((exit) => exit.id === exitMenu.value?.exitId),
);
/** An exit leads to a different scene, so these are the choices. */
const exitTargets = computed(() =>
  scenes.scenes
    .filter((scene) => scene.id !== scenes.shownScene?.id)
    .map((scene) => ({ id: scene.id, name: scene.name })),
);

function openAddExit(at: Point, screen: Point): void {
  if (lobby.mySeat?.isGM === true && scenes.shownScene !== undefined) {
    exitMenu.value = { mode: 'add', at, ...menuSpot(screen) };
  }
}

function closeExitMenu(): void {
  if (exitMenu.value !== undefined) {
    exitMenu.value = undefined;
    surface.value?.focus();
  }
}

async function addExit(label: string, targetSceneId: string): Promise<void> {
  const scene = scenes.shownScene;
  const open = exitMenu.value;
  closeExitMenu();
  if (scene === undefined || open === undefined) {
    return;
  }
  const accepted = await scenes.send('scene.addLink', {
    sceneId: scene.id,
    label,
    x: Math.round(open.at.x),
    y: Math.round(open.at.y),
    targetSceneId,
  });
  if (accepted) {
    announcement.value = `Exit ${label} added.`;
  }
}

async function removeExit(): Promise<void> {
  const scene = scenes.shownScene;
  const exit = menuExit.value;
  closeExitMenu();
  if (scene !== undefined && exit !== undefined) {
    if (await scenes.send('scene.removeLink', { sceneId: scene.id, linkId: exit.id })) {
      announcement.value = `Exit ${exit.label} removed.`;
    }
  }
}

function closeMenu(): void {
  if (menu.value !== undefined) {
    menu.value = undefined;
    surface.value?.focus();
  }
}

/** Sends one change to the menu's token and says what happened. */
async function tokenChange(
  changes: { hidden?: boolean; name?: string | null; size?: number },
  said: (token: TokenView) => string,
): Promise<void> {
  const token = menuToken.value;
  closeMenu();
  if (
    token !== undefined &&
    (await scenes.send('token.update', { tokenId: token.id, changes }))
  ) {
    announcement.value = said(token);
  }
}

/** Joins the menu's token to the active combat, hidden exactly as the token already is. */
async function addTokenToCombat(): Promise<void> {
  const token = menuToken.value;
  closeMenu();
  if (token !== undefined && (await combat.addCombatant(token.id, token.hidden))) {
    announcement.value = `${token.label} joined the fight.`;
  }
}

/** Grants, or revokes, the menu's token's out-of-turn move. */
async function toggleMovementGrant(): Promise<void> {
  const token = menuToken.value;
  const combatant = token === undefined ? undefined : combat.combatantByToken(token.id);
  closeMenu();
  if (token === undefined || combatant === undefined) {
    return;
  }
  const allowed = !combatant.movementGrant;
  if (await combat.setMovementGrant(combatant.id, allowed)) {
    announcement.value = allowed
      ? `${token.label} can move out of turn.`
      : `${token.label}'s grant was revoked.`;
  }
}

async function removeToken(): Promise<void> {
  const token = menuToken.value;
  closeMenu();
  if (token !== undefined && (await scenes.send('token.delete', { tokenId: token.id }))) {
    announcement.value = `${token.label} removed from the map.`;
  }
}

/** M5 C.9a: the GM or the placing seat may remove a template, from `TemplateList`. */
async function removeTemplate(templateId: string): Promise<void> {
  if (await scenes.send('template.remove', { templateId })) {
    announcement.value = 'Template removed.';
  }
}

function onContextMenu(event: MouseEvent): void {
  if (lobby.mySeat?.isGM !== true) {
    return;
  }
  if (menu.value !== undefined || exitMenu.value !== undefined) {
    // The Menu key opened it on key down; the browser's own menu would follow.
    event.preventDefault();
    return;
  }
  const scene = scenes.shownScene;
  const point = sample(event as PointerEvent);
  const at = screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), point);
  const hit = tokenAt(views.value, at);
  if (hit !== undefined) {
    event.preventDefault();
    openMenu(hit);
    return;
  }
  const exit = exitAt(exits.value, at, exitRadius(scene?.grid.size ?? 100));
  if (exit !== undefined) {
    event.preventDefault();
    exitMenu.value = { mode: 'remove', at, exitId: exit.id, ...menuSpot(point) };
    return;
  }
  if (
    scene !== undefined &&
    at.x >= 0 &&
    at.y >= 0 &&
    at.x <= scene.width &&
    at.y <= scene.height
  ) {
    event.preventDefault();
    openAddExit(at, point);
  }
}

/** Puts `actorId`'s token on the shown scene at `at`, or in the middle of what can be seen, and says so. */
async function placeActor(actorId: string, at?: Point): Promise<void> {
  const scene = scenes.shownScene;
  const actor = documents.actorById(actorId);
  if (scene === undefined || actor === undefined) {
    return;
  }
  const accepted = await scenes.placeToken(actorId, at);
  announcement.value = accepted ? `${actor.name} placed on the map.` : '';
}

/**
 * Places `actorId` in the middle of the visible map. `covered` is how much of
 * its left and right edges a drawer hides, so the token lands where it can be seen.
 */
function placeAtCentre(actorId: string, covered?: Covered): Promise<void> {
  const scene = scenes.shownScene;
  return placeActor(
    actorId,
    scene === undefined || camera === undefined
      ? undefined
      : viewCentre(camera, viewportSize(), scene, covered),
  );
}

/**
 * Selects `tokenId` and centres the camera on it (the turn bar's portraits), at the
 * zoom the user has. A token this seat cannot see on this scene is ignored.
 */
function focusToken(tokenId: string): void {
  const scene = scenes.shownScene;
  const token = scenes.shownTokens.find((t) => t.id === tokenId);
  if (scene === undefined || token === undefined || camera === undefined) {
    return;
  }
  apply(
    constrainCamera({ ...camera, x: token.x, y: token.y }, scene, viewportSize()),
    false,
  );
  selectFromList(tokenId);
}

defineExpose({ placeAtCentre, focusToken, selectedId });

/** Whether a drag carries a character from the roster, and this seat may place it (the GM). */
function isActorDrag(event: DragEvent): boolean {
  return (
    lobby.mySeat?.isGM === true &&
    event.dataTransfer?.types.includes(ACTOR_DRAG_TYPE) === true
  );
}

function onDragOver(event: DragEvent): void {
  if (isActorDrag(event)) {
    // Without this the browser refuses the drop.
    event.preventDefault();
    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }
}

function onDrop(event: DragEvent): void {
  const actorId = event.dataTransfer?.getData(ACTOR_DRAG_TYPE);
  if (!isActorDrag(event) || actorId === undefined || actorId === '') {
    return;
  }
  event.preventDefault();
  const box = surface.value?.getBoundingClientRect();
  void placeActor(
    actorId,
    screenToScene(camera ?? { x: 0, y: 0, zoom: 1 }, viewportSize(), {
      x: event.clientX - (box?.left ?? 0),
      y: event.clientY - (box?.top ?? 0),
    }),
  );
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
  if (
    (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) &&
    lobby.mySeat?.isGM === true
  ) {
    event.preventDefault();
    if (selectedView.value !== undefined) {
      openMenu(selectedView.value);
    } else if (scenes.shownScene !== undefined && camera !== undefined) {
      // Nothing selected: an exit in the middle of what is on screen.
      const room = viewportSize();
      openAddExit(viewCentre(camera, room, scenes.shownScene), {
        x: room.width / 2,
        y: room.height / 2,
      });
    }
    return;
  }
  if (event.key.toLowerCase() === 'm' && !event.shiftKey) {
    event.preventDefault();
    setRuler(!rulerOn.value);
    return;
  }
  if (event.key.toLowerCase() === 't' && !event.shiftKey && lobby.mySeat !== undefined) {
    event.preventDefault();
    setPlacingTemplate(!placingTemplate.value);
    return;
  }
  // End turn (GM only): a combat not yet active makes this a no-op on the
  // store side, so nothing here needs to know whether one is running.
  if (event.key.toLowerCase() === 'n' && event.shiftKey && lobby.mySeat?.isGM === true) {
    event.preventDefault();
    emit('nextTurn');
    return;
  }
  if (rulerOn.value && event.key === 'Backspace') {
    event.preventDefault();
    rulerPoints.value = rulerPoints.value.slice(0, -1);
    return;
  }
  if (rulerOn.value && event.key === 'Escape') {
    event.preventDefault();
    setRuler(false);
    return;
  }
  if (placingTemplate.value && event.key === 'Escape') {
    event.preventDefault();
    setPlacingTemplate(false);
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
  // While a strike is waiting on a target, Escape is the table's to skip
  // targeting with (TableView.vue) -- not this seat's to clear the acting
  // token's own selection and lose the action bar along with it.
  if (event.key === 'Escape' && selectedId.value !== undefined && !props.targeting) {
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
watch(
  [
    views,
    exits,
    rulerPath,
    () => scenes.shownScene?.grid,
    () => props.highlightedCells,
    templateCells,
  ],
  () => {
    drawTokens();
    loadPortraits();
  },
);

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
      :class="{ 'is-dragging': dragging, 'is-measuring': rulerOn }"
      tabindex="0"
      role="group"
      aria-label="Map. Arrow keys move the view, plus and minus zoom, zero shows the whole map."
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @dragover="onDragOver"
      @drop="onDrop"
      @contextmenu="onContextMenu"
      @keydown="onKeyDown"
    >
      <MapCanvas @ready="onReady" />
      <ExitMenu
        v-if="exitMenu && (exitMenu.mode === 'add' || menuExit)"
        :key="`${exitMenu.mode}-${exitMenu.exitId ?? ''}`"
        :mode="exitMenu.mode"
        :x="exitMenu.x"
        :y="exitMenu.y"
        :targets="exitTargets"
        :exit="menuExit"
        @close="closeExitMenu"
        @add="addExit"
        @remove="removeExit"
      />
      <TokenMenu
        v-if="menu && menuToken"
        :key="menu.tokenId"
        :token="menuToken"
        :x="menu.x"
        :y="menu.y"
        :can-join-combat="menuTokenCanJoinCombat"
        :movement-granted="menuTokenMovementGrant"
        @close="closeMenu"
        @toggle-hidden="
          tokenChange({ hidden: !menuToken.hidden }, (token) =>
            token.hidden
              ? `${token.label} shown to the players.`
              : `${token.label} hidden from the players.`,
          )
        "
        @remove="removeToken"
        @add-to-combat="addTokenToCombat"
        @toggle-movement-grant="toggleMovementGrant"
        @update="(changes) => tokenChange(changes, (token) => `${token.label} updated.`)"
      />
      <output
        v-if="readout"
        class="move-readout"
        :style="{ left: `${readout.x}px`, top: `${readout.y}px` }"
      >
        {{ readout.feet }} ft
      </output>
      <output
        v-if="rulerReadout"
        class="move-readout"
        :style="{ left: `${rulerReadout.x}px`, top: `${rulerReadout.y}px` }"
      >
        {{ rulerReadout.feet }} ft
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
        <button
          type="button"
          title="Measure distances (M)"
          :aria-pressed="rulerOn"
          @click="setRuler(!rulerOn)"
        >
          Ruler
        </button>
        <button
          v-if="lobby.mySeat !== undefined"
          type="button"
          title="Place an area template (T)"
          :aria-pressed="placingTemplate"
          @click="setPlacingTemplate(!placingTemplate)"
        >
          Template
        </button>
      </div>
    </div>
    <p v-else class="map-empty">
      No scene is showing yet. When the GM moves the party to a scene, its map appears
      here.
    </p>
    <div
      v-if="pendingExit"
      class="exit-confirm"
      role="alertdialog"
      aria-labelledby="exit-question"
      @keydown.esc.stop="cancelExit"
    >
      <p id="exit-question">
        Move the party to
        <strong>{{ pendingExit.targetName ?? 'a scene that is gone' }}</strong
        >?
      </p>
      <button
        ref="exitMove"
        type="button"
        :disabled="pendingExit.targetName === undefined"
        @click="confirmExit"
      >
        Move the party
      </button>
      <button type="button" @click="cancelExit">Cancel</button>
    </div>
    <TokenList
      :views="views"
      :exits="exits"
      :distances="distances"
      :targeting="targeting"
      @exit="askExit"
      @select="selectFromList"
      @target="(tokenId) => emit('pickTarget', tokenId)"
      @open="(actorId) => emit('openActor', actorId)"
    />
    <TemplateList
      :templates="scenes.shownTemplates"
      :my-seat-id="lobby.mySeat?.id"
      :is-gm="lobby.mySeat?.isGM === true"
      @remove="removeTemplate"
    />
    <form
      v-if="placingTemplate"
      class="template-placement"
      aria-label="Place an area template"
      @pointerdown.stop
      @submit.prevent="confirmTemplate"
    >
      <label for="template-shape">Shape</label>
      <select id="template-shape" v-model="templateShape">
        <option v-for="shape in TEMPLATE_SHAPES" :key="shape" :value="shape">
          {{ shape }}
        </option>
      </select>

      <label for="template-feet">{{
        templateShape === 'line' ? 'Length (ft)' : 'Feet'
      }}</label>
      <input
        id="template-feet"
        v-model.number="templateFeet"
        type="number"
        min="5"
        step="5"
      />

      <template v-if="templateShape === 'line'">
        <label for="template-width">Width (ft)</label>
        <input
          id="template-width"
          v-model.number="templateWidthFeet"
          type="number"
          min="5"
          step="5"
        />
      </template>

      <label for="template-label">Label</label>
      <input id="template-label" v-model="templateLabel" type="text" autocomplete="off" />

      <template v-if="templateShape === 'emanation'">
        <label for="template-token">Source token</label>
        <select id="template-token" v-model="templateTokenId">
          <option value="" disabled>Choose…</option>
          <option v-for="tokenView in views" :key="tokenView.id" :value="tokenView.id">
            {{ tokenView.label }}
          </option>
        </select>
      </template>

      <fieldset v-if="templateShape === 'cone' || templateShape === 'line'">
        <legend>Aim (drag on the map, or pick a direction)</legend>
        <button
          v-for="direction in COMPASS_DIRECTIONS"
          :key="direction"
          type="button"
          :disabled="templateOrigin === undefined"
          @click="rotateTemplate(direction)"
        >
          {{ direction }}
        </button>
      </fieldset>

      <p v-if="templateCaught.length > 0">
        Catches: {{ templateCaught.map((view) => view.label).join(', ') }}
      </p>
      <p v-else-if="templatePreviewCells.length > 0">Catches: no creatures.</p>

      <button type="submit" :disabled="templatePayload === undefined">
        Place template
      </button>
      <button type="button" @click="setPlacingTemplate(false)">Cancel</button>
    </form>
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

.map-surface.is-measuring {
  cursor: crosshair;
}

.map-zoom button[aria-pressed='true'] {
  background: var(--color-accent);
  color: var(--color-accent-contrast);
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

.exit-confirm {
  position: absolute;
  top: var(--space-2);
  left: 50%;
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
  transform: translateX(-50%);
}

.template-placement {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  max-width: calc(100% - 2 * var(--space-2));
  padding: var(--space-2) var(--space-3);
  border: 2px solid var(--color-accent);
  border-radius: 4px;
  background: var(--color-surface);
  color: var(--color-text);
}

.template-placement fieldset {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: 4px;
}

.template-placement input[type='number'],
.template-placement input[type='text'] {
  width: 7rem;
}

.template-placement input,
.template-placement select,
.template-placement button {
  min-height: var(--touch-target-min);
}

.exit-confirm p {
  margin: 0;
}

.exit-confirm button {
  min-height: var(--touch-target-min);
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
