// @vitest-environment jsdom
import type { Actor, Scene, Seat, Token } from '@hearthtable/core';
import { sceneSchema, tokenSchema } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, reactive } from 'vue';

import MapView from './MapView.vue';
import * as mapImage from './mapImage.js';
import { ACTOR_DRAG_TYPE } from './placement.js';
import * as sceneViewModule from './sceneView.js';

const NOW = '2026-10-01T00:00:00.000Z';

const moveToken = vi.fn<(id: string, x: number, y: number) => Promise<boolean>>();
const setLocalDrag = vi.fn<(id: string, x: number, y: number) => void>();
const clearLocalDrag = vi.fn<(id: string) => void>();
const sendDrag = vi.fn<(id: string, x: number, y: number) => void>();
const previewScene = vi.fn<(id: string | undefined) => void>();
const send = vi.fn<(type: string, payload: unknown) => Promise<boolean>>();
const placeToken =
  vi.fn<(actorId: string, at?: { x: number; y: number }) => Promise<boolean>>();
const state = reactive<{
  shownScene: Scene | undefined;
  scenes: Scene[];
  previewScene: typeof previewScene;
  shownTokens: Token[];
  error: string | undefined;
  placeToken: typeof placeToken;
  send: typeof send;
  moveToken: typeof moveToken;
  setLocalDrag: typeof setLocalDrag;
  clearLocalDrag: typeof clearLocalDrag;
  sendDrag: typeof sendDrag;
}>({
  shownScene: undefined,
  scenes: [],
  previewScene,
  shownTokens: [],
  error: undefined,
  placeToken,
  send,
  moveToken,
  setLocalDrag,
  clearLocalDrag,
  sendDrag,
});
const lobby = reactive<{ mySeat: Seat | undefined }>({ mySeat: undefined });
vi.mock('../../stores/lobby.js', () => ({ useLobbyStore: () => lobby }));
const docs = reactive<{ actors: Actor[] }>({ actors: [] });
vi.mock('../../stores/scenes.js', () => ({ useScenesStore: () => state }));
vi.mock('../../stores/documents.js', () => ({
  useDocumentsStore: () => ({
    actorById: (id: string) => docs.actors.find((actor) => actor.id === id),
  }),
}));
const addCombatant = vi.fn<(tokenId: string, hidden: boolean) => Promise<boolean>>();
const combat = reactive<{
  activeCombat: { status: string } | undefined;
  combatantByToken: (tokenId: string) => unknown;
  addCombatant: typeof addCombatant;
}>({
  activeCombat: undefined,
  combatantByToken: () => undefined,
  addCombatant,
});
vi.mock('../../stores/combat.js', () => ({ useCombatStore: () => combat }));
vi.mock('./mapImage.js');
vi.mock('./sceneView.js');
vi.mock('pixi.js', () => ({}));

const makeScene = (overrides: Record<string, unknown> = {}): Scene =>
  sceneSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'scene',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Bog',
    kind: 'battle',
    width: 2000,
    height: 1000,
    ...overrides,
  });

/** Stands in for the real canvas: no WebGL in jsdom. Tests press its `ready` themselves. */
const CanvasStub = defineComponent({
  emits: ['ready'],
  template: '<div data-testid="canvas-stub" />',
});

const app = { screen: { width: 1048, height: 548 }, renderer: { on: vi.fn() } };
const view = {
  update: vi.fn(),
  setCamera: vi.fn(),
  setTokens: vi.fn(),
  setExits: vi.fn(),
  setRuler: vi.fn(),
  destroy: vi.fn(),
};

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const wrapper = mount(MapView, {
    props: { worldId: 'world-1' },
    // Attached to the page so focus can be asserted.
    attachTo: document.body,
    global: { stubs: { MapCanvas: CanvasStub } },
  });
  mounted.push(wrapper);
  return wrapper;
}

// Every view watches the same shared state, so one left behind would answer the next test's changes.
afterEach(() => {
  state.shownScene = undefined;
  state.shownTokens = [];
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount();
  }
});

async function ready(wrapper: ReturnType<typeof mountView>) {
  wrapper.getComponent(CanvasStub).vm.$emit('ready', app);
  await flushPromises();
}

beforeEach(() => {
  vi.resetAllMocks();
  state.shownScene = undefined;
  state.shownTokens = [];
  state.scenes = [];
  state.error = undefined;
  moveToken.mockResolvedValue(true);
  placeToken.mockResolvedValue(true);
  send.mockResolvedValue(true);
  addCombatant.mockResolvedValue(true);
  combat.activeCombat = undefined;
  combat.combatantByToken = () => undefined;
  lobby.mySeat = undefined;
  docs.actors = [];
  vi.mocked(sceneViewModule.createSceneView).mockReturnValue(view);
  vi.mocked(sceneViewModule.maxTextureSize).mockReturnValue(8192);
  vi.mocked(mapImage.loadMapBitmap).mockResolvedValue({
    close: vi.fn(),
  } as unknown as ImageBitmap);
});

describe('MapView', () => {
  it('says so in words, and mounts no canvas, while there is no scene', () => {
    const wrapper = mountView();
    expect(wrapper.text()).toContain('No scene is showing yet');
    expect(wrapper.findComponent(CanvasStub).exists()).toBe(false);
  });

  it('mounts the canvas once a scene is showing', async () => {
    const wrapper = mountView();
    state.shownScene = makeScene();
    await flushPromises();
    expect(wrapper.findComponent(CanvasStub).exists()).toBe(true);
    expect(wrapper.text()).not.toContain('No scene is showing yet');
  });

  it('draws a scene with no picture straight away, fitted to the box', async () => {
    state.shownScene = makeScene();
    const wrapper = mountView();
    await ready(wrapper);

    expect(mapImage.loadMapBitmap).not.toHaveBeenCalled();
    expect(view.update).toHaveBeenCalledWith(state.shownScene, undefined);
    // 2000 x 1000 in 1048 x 548: the whole scene at half size, centred.
    expect(view.setCamera).toHaveBeenCalledWith(
      { x: 1000, y: 500, zoom: 0.5 },
      { width: 1048, height: 548 },
    );
  });

  it('loads the picture at the card’s limit from the asset URL, then draws it', async () => {
    state.shownScene = makeScene({ background: `${'a'.repeat(64)}.png` });
    const wrapper = mountView();
    await ready(wrapper);

    expect(mapImage.loadMapBitmap).toHaveBeenCalledWith(
      `/api/worlds/world-1/assets/${'a'.repeat(64)}.png`,
      8192,
    );
    expect(view.update).toHaveBeenCalledWith(
      state.shownScene,
      expect.objectContaining({ close: expect.any(Function) as unknown }),
    );
  });

  it('draws a blank map and says why when the picture cannot be loaded', async () => {
    vi.mocked(mapImage.loadMapBitmap).mockRejectedValue(new Error('gone'));
    state.shownScene = makeScene({ background: `${'b'.repeat(64)}.png` });
    const wrapper = mountView();
    await ready(wrapper);

    expect(view.update).toHaveBeenCalledWith(state.shownScene, undefined);
    expect(wrapper.get('.map-note[role="status"]').text()).toContain(
      'could not be loaded',
    );
  });

  it('redraws when the picture or grid changes, but not for a change that is not drawn', async () => {
    const scene = makeScene();
    state.shownScene = scene;
    const wrapper = mountView();
    await ready(wrapper);
    view.update.mockClear();

    state.shownScene = { ...scene, name: 'Renamed' };
    await flushPromises();
    expect(view.update).not.toHaveBeenCalled();

    state.shownScene = { ...scene, grid: { ...scene.grid, size: 50 } };
    await flushPromises();
    expect(view.update).toHaveBeenCalledTimes(1);
  });

  it('drops a picture that arrives after the scene has moved on', async () => {
    const closeLate = vi.fn();
    let finish: (bitmap: ImageBitmap) => void = () => undefined;
    vi.mocked(mapImage.loadMapBitmap).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    state.shownScene = makeScene({ background: `${'c'.repeat(64)}.png` });
    const wrapper = mountView();
    wrapper.getComponent(CanvasStub).vm.$emit('ready', app);
    await flushPromises();

    state.shownScene = makeScene();
    await flushPromises();
    finish({ close: closeLate } as unknown as ImageBitmap);
    await flushPromises();

    expect(closeLate).toHaveBeenCalledTimes(1);
    expect(view.update).toHaveBeenCalledTimes(1);
    expect(view.update).toHaveBeenCalledWith(state.shownScene, undefined);
  });

  it('refits when the box is resized, and lets the scene view go when the scene does', async () => {
    state.shownScene = makeScene();
    const wrapper = mountView();
    await ready(wrapper);

    const call = app.renderer.on.mock.calls[0] as [string, () => void];
    expect(call[0]).toBe('resize');
    view.setCamera.mockClear();
    call[1]();
    expect(view.setCamera).toHaveBeenCalledTimes(1);

    state.shownScene = undefined;
    await flushPromises();
    expect(view.destroy).toHaveBeenCalledTimes(1);
  });
});

/** jsdom has no PointerEvent, so a mouse event stands in with the pointer's id added. */
async function pointer(
  target: { element: Element },
  type: string,
  init: { pointerId: number; button?: number; clientX: number; clientY: number },
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerId', { value: init.pointerId });
  target.element.dispatchEvent(event);
  await flushPromises();
}

async function wheel(
  target: { element: Element },
  init: { deltaY: number; clientX: number; clientY: number },
) {
  target.element.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }),
  );
  await flushPromises();
}

describe('moving around', () => {
  /** The camera of the most recent `setCamera` call. */
  const camera = () =>
    view.setCamera.mock.lastCall?.[0] as { x: number; y: number; zoom: number };

  async function shown(overrides: Record<string, unknown> = {}) {
    state.shownScene = makeScene(overrides);
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, surface: wrapper.get('.map-surface') };
  }

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  it('is a labelled, focusable group that says which keys do what', async () => {
    const { surface } = await shown();
    expect(surface.attributes('tabindex')).toBe('0');
    expect(surface.attributes('aria-label')).toContain('Arrow keys');
  });

  it('pans with the arrows and fits with 0, stopping the page from scrolling', async () => {
    const { surface } = await shown();
    expect(camera()).toEqual({ x: 1000, y: 500, zoom: 0.5 });

    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    surface.element.dispatchEvent(event);
    // 100 screen pixels at half zoom: the map moves left by 200 scene pixels.
    expect(camera()).toEqual({ x: 1200, y: 500, zoom: 0.5 });
    expect(event.defaultPrevented).toBe(true);

    await surface.trigger('keydown', { key: '0' });
    expect(camera()).toEqual({ x: 1000, y: 500, zoom: 0.5 });
  });

  it('leaves Ctrl and other keys to the browser', async () => {
    const { surface } = await shown();
    view.setCamera.mockClear();
    await surface.trigger('keydown', { key: '+', ctrlKey: true });
    await surface.trigger('keydown', { key: 'a' });
    expect(view.setCamera).not.toHaveBeenCalled();
  });

  it('zooms with the wheel, and with the buttons', async () => {
    const { wrapper, surface } = await shown();
    await wheel(surface, { deltaY: -100, clientX: 100, clientY: 100 });
    expect(camera().zoom).toBeGreaterThan(0.5);

    await surface.trigger('keydown', { key: '0' });
    await wrapper.get('button[aria-label="Zoom in"]').trigger('click');
    expect(camera().zoom).toBeCloseTo(0.625, 9);
    await wrapper.get('button[aria-label="Zoom out"]').trigger('click');
    expect(camera().zoom).toBeCloseTo(0.5, 9);
    await wrapper.get('button[title="Show the whole map"]').trigger('click');
    expect(camera()).toEqual({ x: 1000, y: 500, zoom: 0.5 });
  });

  it('pans by dragging, and lets go on release', async () => {
    const { surface } = await shown();
    await pointer(surface, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 300,
      clientY: 200,
    });
    expect(surface.classes()).toContain('is-dragging');
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 400, clientY: 160 });
    expect(camera()).toEqual({ x: 800, y: 580, zoom: 0.5 });

    await pointer(surface, 'pointerup', { pointerId: 1, clientX: 400, clientY: 160 });
    expect(surface.classes()).not.toContain('is-dragging');
    view.setCamera.mockClear();
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 500, clientY: 160 });
    expect(view.setCamera).not.toHaveBeenCalled();
  });

  it('ignores the right mouse button', async () => {
    const { surface } = await shown();
    view.setCamera.mockClear();
    await pointer(surface, 'pointerdown', {
      pointerId: 1,
      button: 2,
      clientX: 0,
      clientY: 0,
    });
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 50, clientY: 50 });
    expect(view.setCamera).not.toHaveBeenCalled();
  });

  it('keeps where the user looked when the same scene is redrawn, but refits for a new one', async () => {
    const scene = makeScene();
    state.shownScene = scene;
    const wrapper = mountView();
    await ready(wrapper);
    await wrapper.get('.map-surface').trigger('keydown', { key: 'ArrowRight' });
    expect(camera().x).toBe(1200);

    state.shownScene = { ...scene, grid: { ...scene.grid, size: 50 } };
    await flushPromises();
    expect(camera().x).toBe(1200);

    state.shownScene = makeScene();
    await flushPromises();
    expect(camera()).toEqual({ x: 1000, y: 500, zoom: 0.5 });
  });

  it('refits on resize while still the whole-map view, and keeps the view once moved', async () => {
    const { wrapper, surface } = await shown();
    const onResize = (app.renderer.on.mock.calls[0] as [string, () => void])[1];
    app.screen = { width: 548, height: 348 };
    onResize();
    expect(camera()).toEqual({ x: 1000, y: 500, zoom: 0.25 });

    await surface.trigger('keydown', { key: 'ArrowRight' });
    app.screen = { width: 1048, height: 548 };
    onResize();
    expect(camera().x).toBe(1400);
    expect(wrapper.exists()).toBe(true);
  });
});

describe('tokens', () => {
  const makeActor = (name: string, portrait?: string): Actor => ({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name,
    system: {},
    ...(portrait === undefined ? {} : { portrait }),
  });

  const makeToken = (
    sceneId: string,
    actorId: string,
    overrides: Record<string, unknown> = {},
  ) =>
    tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: crypto.randomUUID(),
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId,
      actorId,
      x: 250,
      y: 350,
      ...overrides,
    });

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  const lastViews = () =>
    view.setTokens.mock.lastCall?.[0] as { label: string; diameter: number }[];

  it('draws the shown scene’s tokens, sized by the grid and named for their actor', async () => {
    const hero = makeActor('Valeros');
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    state.shownTokens = [makeToken(scene.id, hero.id, { size: 2 })];
    const wrapper = mountView();
    await ready(wrapper);

    expect(lastViews()).toEqual([
      expect.objectContaining({ label: 'Valeros', diameter: 200, x: 250, y: 350 }),
    ]);
    expect(view.setTokens.mock.lastCall?.[2]).toBe(100);
  });

  it('redraws just the tokens when one changes, not the map', async () => {
    const hero = makeActor('Valeros');
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    const token = makeToken(scene.id, hero.id);
    state.shownTokens = [token];
    const wrapper = mountView();
    await ready(wrapper);
    view.update.mockClear();

    state.shownTokens = [{ ...token, x: 400, y: 450 }];
    await flushPromises();
    expect(lastViews()).toEqual([expect.objectContaining({ x: 400, y: 450 })]);
    expect(view.update).not.toHaveBeenCalled();
  });

  it('lists them for the keyboard and opens the actor’s sheet on activation', async () => {
    const hero = makeActor('Valeros');
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    state.shownTokens = [
      makeToken(scene.id, hero.id),
      makeToken(scene.id, crypto.randomUUID(), { hidden: true }),
    ];
    const wrapper = mountView();
    await ready(wrapper);

    const list = wrapper.get('[aria-label="Tokens on the map"]');
    expect(list.findAll('li').map((li) => li.text())).toEqual([
      'Valeros Sheet',
      'Unknown (hidden)',
    ]);
    // Everyone can be selected; only the token whose actor this seat can see has a sheet button.
    expect(list.findAll('button').map((b) => b.text())).toEqual([
      'Valeros',
      'Sheet',
      'Unknown (hidden)',
    ]);
    await list.get('button.sheet').trigger('click');
    expect(wrapper.emitted('openActor')).toEqual([[hero.id]]);
  });

  it('fetches a portrait once, small, then redraws the tokens with it', async () => {
    const hero = makeActor('Valeros', `${'d'.repeat(64)}.png`);
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    state.shownTokens = [makeToken(scene.id, hero.id)];
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    vi.mocked(mapImage.loadMapBitmap).mockResolvedValue(bitmap);
    const wrapper = mountView();
    await ready(wrapper);

    expect(mapImage.loadMapBitmap).toHaveBeenCalledTimes(1);
    expect(mapImage.loadMapBitmap).toHaveBeenCalledWith(
      `/api/worlds/world-1/assets/${'d'.repeat(64)}.png`,
      256,
    );
    const portraits = view.setTokens.mock.lastCall?.[1] as Map<string, ImageBitmap>;
    expect(portraits.get(`${'d'.repeat(64)}.png`)).toBe(bitmap);

    state.shownTokens = [{ ...state.shownTokens[0]!, x: 300 }];
    await flushPromises();
    expect(mapImage.loadMapBitmap).toHaveBeenCalledTimes(1);
  });

  it('keeps the initials when a portrait cannot be fetched', async () => {
    const hero = makeActor('Valeros', `${'e'.repeat(64)}.png`);
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    state.shownTokens = [makeToken(scene.id, hero.id)];
    vi.mocked(mapImage.loadMapBitmap).mockRejectedValue(new Error('gone'));
    const wrapper = mountView();
    await ready(wrapper);

    expect(lastViews()).toHaveLength(1);
    expect((view.setTokens.mock.lastCall?.[1] as Map<string, unknown>).size).toBe(0);
    expect(wrapper.find('.map-note').exists()).toBe(false);
  });
});

describe('selecting and moving tokens', () => {
  const GM: Seat = {
    id: crypto.randomUUID(),
    worldId: 'w',
    schemaVersion: 1,
    name: 'GM',
    isGM: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const world = crypto.randomUUID();
  const player: Seat = { ...GM, id: crypto.randomUUID(), worldId: world, isGM: false };

  const makeActor = (name: string, owner?: Seat): Actor => ({
    id: crypto.randomUUID(),
    worldId: world,
    type: 'actor',
    schemaVersion: 1,
    permissions: {
      default: 'observer',
      seats: owner === undefined ? {} : { [owner.id]: 'owner' },
    },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name,
    system: {},
  });

  const makeToken = (sceneId: string, actorId: string, x = 250, y = 250): Token =>
    tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: world,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId,
      actorId,
      x,
      y,
    });

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  /** A scene 2000 x 1000 fitted at 0.5 with its centre at (524, 274) on screen, so scene (250, 250) is at screen (149, 149). */
  async function setup(seat: Seat | undefined, owner?: Seat) {
    lobby.mySeat = seat;
    const hero = makeActor('Valeros', owner);
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    const token = makeToken(scene.id, hero.id);
    state.shownTokens = [token];
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, hero, token, surface: wrapper.get('.map-surface') };
  }

  const press = (
    surface: { trigger: (e: string, o: object) => Promise<unknown> },
    key: string,
  ) => surface.trigger('keydown', { key });

  it('selects a token from the list, hands focus to the map, and says how to move it', async () => {
    const { wrapper, token, surface } = await setup(GM);
    const select = wrapper.get('.token-list button');
    await select.trigger('click');

    expect(select.attributes('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(surface.element);
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Valeros selected. The arrow keys move it.',
    );
    const looks = view.setTokens.mock.lastCall?.[0] as {
      id: string;
      selected: boolean;
    }[];
    expect(looks.find((v) => v.id === token.id)?.selected).toBe(true);
  });

  it('selects a token by clicking it, and not the empty ground', async () => {
    const { wrapper, token, surface } = await setup(GM);
    await pointer(surface, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 149,
      clientY: 149,
    });
    await pointer(surface, 'pointerup', { pointerId: 1, clientX: 149, clientY: 149 });
    expect(wrapper.get('.token-list button').attributes('aria-pressed')).toBe('true');

    // A click on a token does not start a pan.
    view.setCamera.mockClear();
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 300, clientY: 300 });
    expect(view.setCamera).not.toHaveBeenCalled();
    expect(token.id).toBeDefined();
  });

  it('lets the GM move the selected token one square with the arrows, at once', async () => {
    const { wrapper, token, surface } = await setup(GM);
    await wrapper.get('.token-list button').trigger('click');

    await press(surface, 'ArrowRight');
    expect(moveToken).toHaveBeenCalledWith(token.id, 350, 250);
    await press(surface, 'ArrowDown');
    expect(moveToken).toHaveBeenLastCalledWith(token.id, 250, 350);
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('Valeros moved 5 ft.');
  });

  it('keeps the arrows for panning when nothing is selected, and stops the page scrolling for a move', async () => {
    const { wrapper, surface } = await setup(GM);
    view.setCamera.mockClear();
    await press(surface, 'ArrowRight');
    expect(moveToken).not.toHaveBeenCalled();
    expect(view.setCamera).toHaveBeenCalled();

    await wrapper.get('.token-list button').trigger('click');
    const event = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    surface.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(moveToken).toHaveBeenCalledTimes(1);
  });

  it('lets a player move a token they own', async () => {
    const { wrapper, token, surface } = await setup(player, player);
    await wrapper.get('.token-list button').trigger('click');
    await press(surface, 'ArrowLeft');
    expect(moveToken).toHaveBeenCalledWith(token.id, 150, 250);
  });

  it('does not let a player move a token they do not own, and the arrows pan instead', async () => {
    const { wrapper, surface } = await setup(player);
    await wrapper.get('.token-list button').trigger('click');
    expect(wrapper.get('[role="status"]').text()).toBe('Valeros selected.');

    view.setCamera.mockClear();
    await press(surface, 'ArrowLeft');
    expect(moveToken).not.toHaveBeenCalled();
    expect(view.setCamera).toHaveBeenCalled();
  });

  it('says so, and sends nothing, at the edge of the map', async () => {
    const hero = makeActor('Valeros');
    docs.actors = [hero];
    lobby.mySeat = GM;
    const scene = makeScene();
    state.shownScene = scene;
    state.shownTokens = [makeToken(scene.id, hero.id, 50, 250)];
    const wrapper = mountView();
    await ready(wrapper);
    await wrapper.get('.token-list button').trigger('click');

    await press(wrapper.get('.map-surface'), 'ArrowLeft');
    expect(moveToken).not.toHaveBeenCalled();
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Valeros is at the edge of the map.',
    );
  });

  it('lets go of the selection on Escape', async () => {
    const { wrapper, surface } = await setup(GM);
    await wrapper.get('.token-list button').trigger('click');
    await press(surface, 'Escape');
    expect(wrapper.get('.token-list button').attributes('aria-pressed')).toBe('false');
    await press(surface, 'ArrowRight');
    expect(moveToken).not.toHaveBeenCalled();
  });

  it('drops the selection when its token goes away', async () => {
    const { wrapper } = await setup(GM);
    await wrapper.get('.token-list button').trigger('click');
    state.shownTokens = [];
    await flushPromises();
    expect(wrapper.find('.token-list').exists()).toBe(false);
  });

  it('shows the server’s reason when a move is refused, and announces nothing', async () => {
    moveToken.mockResolvedValue(false);
    const { wrapper, surface } = await setup(GM);
    await wrapper.get('.token-list button').trigger('click');
    await press(surface, 'ArrowRight');
    await flushPromises();
    state.error = 'you do not have permission to move this token';
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('permission');
    // Nothing is announced as moved, and the earlier message is not left standing.
    expect(wrapper.get('.visually-hidden').text()).toBe('');
  });
});

describe('dragging tokens', () => {
  const world = crypto.randomUUID();
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: world,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const GM = seat(true);
  const player = seat(false);

  const makeActor = (name: string, owner?: Seat): Actor => ({
    id: crypto.randomUUID(),
    worldId: world,
    type: 'actor',
    schemaVersion: 1,
    permissions: {
      default: 'observer',
      seats: owner === undefined ? {} : { [owner.id]: 'owner' },
    },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name,
    system: {},
  });

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Scene 2000 x 1000 fitted at 0.5, centre on screen (524, 274): scene (250, 250) is screen (149, 149). */
  async function setup(who: Seat, owner?: Seat) {
    lobby.mySeat = who;
    const hero = makeActor('Valeros', owner);
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    const token = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: world,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: hero.id,
      x: 250,
      y: 250,
    });
    state.shownTokens = [token];
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, token, surface: wrapper.get('.map-surface') };
  }

  const grab = (surface: { element: Element }, x = 149, y = 149) =>
    pointer(surface, 'pointerdown', { pointerId: 1, button: 0, clientX: x, clientY: y });
  const drag = (surface: { element: Element }, x: number, y: number) =>
    pointer(surface, 'pointermove', { pointerId: 1, clientX: x, clientY: y });
  const drop = (surface: { element: Element }, x: number, y: number) =>
    pointer(surface, 'pointerup', { pointerId: 1, clientX: x, clientY: y });

  it('follows the pointer cell by cell, with the distance in feet beside it', async () => {
    const { wrapper, token, surface } = await setup(GM);
    await grab(surface);
    // 100 screen px right is 200 scene px: two squares.
    await drag(surface, 249, 149);

    expect(setLocalDrag).toHaveBeenLastCalledWith(token.id, 450, 250);
    expect(wrapper.get('output.move-readout').text()).toBe('10 ft');
    expect(wrapper.get('.map-surface').classes()).toContain('is-dragging');
  });

  it('sends one move on release, hands over from the drag, and announces it', async () => {
    const { wrapper, token, surface } = await setup(GM);
    await grab(surface);
    await drag(surface, 249, 149);
    await drop(surface, 249, 149);
    await flushPromises();

    expect(moveToken).toHaveBeenCalledTimes(1);
    expect(moveToken).toHaveBeenCalledWith(token.id, 450, 250);
    // The move is pending before the drag is released, so there is no flicker.
    expect(moveToken.mock.invocationCallOrder[0]).toBeLessThan(
      clearLocalDrag.mock.invocationCallOrder[0] ?? 0,
    );
    expect(clearLocalDrag).toHaveBeenCalledWith(token.id);
    expect(wrapper.find('output.move-readout').exists()).toBe(false);
    expect(wrapper.get('.visually-hidden').text()).toBe('Valeros moved 10 ft.');
    expect(wrapper.get('.map-surface').classes()).not.toContain('is-dragging');
  });

  it('sends nothing for a click or a wobble inside the starting cell', async () => {
    const { surface } = await setup(GM);
    await grab(surface);
    await drag(surface, 160, 140);
    await drop(surface, 160, 140);
    await flushPromises();

    expect(moveToken).not.toHaveBeenCalled();
    expect(clearLocalDrag).toHaveBeenCalledTimes(1);
  });

  it('shows the others a throttled preview, never one per pointer event', async () => {
    const { surface, token } = await setup(GM);
    await grab(surface);
    for (let x = 160; x <= 400; x += 10) {
      await drag(surface, x, 149);
      vi.advanceTimersByTime(5);
    }
    // 25 pointer events over about 125 ms: the first goes at once, then one per 50 ms.
    expect(sendDrag.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sendDrag.mock.calls.length).toBeLessThanOrEqual(5);
    expect(sendDrag.mock.calls[0]?.[0]).toBe(token.id);
    expect(setLocalDrag.mock.calls.length).toBeGreaterThan(sendDrag.mock.calls.length);
  });

  it('drops a held preview on release, since the settled move replaces it', async () => {
    const { surface } = await setup(GM);
    await grab(surface);
    await drag(surface, 249, 149);
    await drag(surface, 349, 149);
    sendDrag.mockClear();
    await drop(surface, 349, 149);
    vi.advanceTimersByTime(500);
    expect(sendDrag).not.toHaveBeenCalled();
  });

  it('puts the token back on Escape, and on a cancelled pointer', async () => {
    const { wrapper, surface } = await setup(GM);
    await grab(surface);
    await drag(surface, 249, 149);
    await surface.trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(moveToken).not.toHaveBeenCalled();
    expect(clearLocalDrag).toHaveBeenCalledTimes(1);
    expect(wrapper.get('.visually-hidden').text()).toBe('Move cancelled.');
    expect(wrapper.find('output.move-readout').exists()).toBe(false);

    await grab(surface);
    await drag(surface, 249, 149);
    await pointer(surface, 'pointercancel', { pointerId: 1, clientX: 249, clientY: 149 });
    expect(moveToken).not.toHaveBeenCalled();
    expect(clearLocalDrag).toHaveBeenCalledTimes(2);
  });

  it('lets a player drag a token they own', async () => {
    const { surface, token } = await setup(player, player);
    await grab(surface);
    await drag(surface, 149, 249);
    await drop(surface, 149, 249);
    await flushPromises();
    expect(moveToken).toHaveBeenCalledWith(token.id, 250, 450);
  });

  it('only selects a token a player does not own: no drag, no preview, no move', async () => {
    const { wrapper, surface } = await setup(player);
    await grab(surface);
    expect(wrapper.get('.token-list button').attributes('aria-pressed')).toBe('true');
    await drag(surface, 249, 149);
    await drop(surface, 249, 149);
    await flushPromises();
    expect(setLocalDrag).not.toHaveBeenCalled();
    expect(sendDrag).not.toHaveBeenCalled();
    expect(moveToken).not.toHaveBeenCalled();
  });

  it('does not pan the map while a token is held, and ignores another finger', async () => {
    const { surface } = await setup(GM);
    await grab(surface);
    view.setCamera.mockClear();
    await drag(surface, 249, 149);
    await pointer(surface, 'pointermove', { pointerId: 2, clientX: 400, clientY: 300 });
    expect(view.setCamera).not.toHaveBeenCalled();
    expect(setLocalDrag).toHaveBeenCalledTimes(1);
  });

  it('still pans from empty ground', async () => {
    const { surface } = await setup(GM);
    view.setCamera.mockClear();
    await pointer(surface, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 600,
      clientY: 400,
    });
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 650, clientY: 400 });
    expect(view.setCamera).toHaveBeenCalled();
    expect(setLocalDrag).not.toHaveBeenCalled();
  });

  it('lets go of a held token if the map goes away mid-drag', async () => {
    const { wrapper, token, surface } = await setup(GM);
    await grab(surface);
    await drag(surface, 249, 149);
    wrapper.unmount();
    expect(clearLocalDrag).toHaveBeenCalledWith(token.id);
  });
});

describe('placing tokens', () => {
  const world = crypto.randomUUID();
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: world,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const hero: Actor = {
    id: crypto.randomUUID(),
    worldId: world,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Valeros',
    system: {},
  };

  /** Scene 2000 x 1000 fitted at 0.5, centre on screen (524, 274): screen (149, 149) is scene (250, 250). */
  async function setup(who: Seat) {
    lobby.mySeat = who;
    docs.actors = [hero];
    state.shownScene = makeScene();
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, surface: wrapper.get('.map-surface') };
  }

  /** A drag event as a browser makes it: jsdom has no `DragEvent`, so the data is attached by hand. */
  function dragEvent(type: string, data: Record<string, string>, x = 0, y = 0) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: x },
      clientY: { value: y },
      dataTransfer: {
        value: {
          types: Object.keys(data),
          getData: (key: string) => data[key] ?? '',
          dropEffect: 'none',
        },
      },
    });
    return event as Event & { dataTransfer: { dropEffect: string } };
  }

  const status = (wrapper: ReturnType<typeof mountView>) =>
    wrapper.get('p[role="status"].visually-hidden').text();

  it('places a character dropped on the map where it was dropped', async () => {
    const { wrapper, surface } = await setup(seat(true));
    const event = dragEvent('drop', { [ACTOR_DRAG_TYPE]: hero.id }, 149, 149);
    surface.element.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(placeToken).toHaveBeenCalledWith(hero.id, { x: 250, y: 250 });
    expect(status(wrapper)).toBe('Valeros placed on the map.');
  });

  it('accepts a roster drag over the map, as a copy', async () => {
    const { surface } = await setup(seat(true));
    const event = dragEvent('dragover', { [ACTOR_DRAG_TYPE]: hero.id });
    surface.element.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.dataTransfer.dropEffect).toBe('copy');
  });

  it('ignores a drag of anything else, and a drop from a player', async () => {
    const { surface } = await setup(seat(true));
    const other = dragEvent('dragover', { 'text/plain': 'hello' });
    surface.element.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
    surface.element.dispatchEvent(dragEvent('drop', { 'text/plain': 'hello' }));
    expect(placeToken).not.toHaveBeenCalled();

    lobby.mySeat = seat(false);
    const refused = dragEvent('drop', { [ACTOR_DRAG_TYPE]: hero.id });
    surface.element.dispatchEvent(refused);
    expect(refused.defaultPrevented).toBe(false);
    expect(placeToken).not.toHaveBeenCalled();
  });

  it('places in the middle of what a drawer leaves visible', async () => {
    const { wrapper } = await setup(seat(true));
    // 400 px of the left edge covered: the visible middle is screen x 724, which is scene x 1400.
    await wrapper.vm.placeAtCentre(hero.id, { left: 400, right: 0 });
    expect(placeToken).toHaveBeenCalledWith(hero.id, { x: 1400, y: 500 });
    expect(status(wrapper)).toBe('Valeros placed on the map.');
  });

  it('says nothing was placed when the server refuses', async () => {
    placeToken.mockResolvedValue(false);
    const { wrapper } = await setup(seat(true));
    await wrapper.vm.placeAtCentre(hero.id);
    expect(status(wrapper)).toBe('');
  });

  it('does nothing for a character that is gone', async () => {
    const { wrapper } = await setup(seat(true));
    await wrapper.vm.placeAtCentre(crypto.randomUUID());
    expect(placeToken).not.toHaveBeenCalled();
  });
});

describe('the token menu', () => {
  const world = crypto.randomUUID();
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: world,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const hero: Actor = {
    id: crypto.randomUUID(),
    worldId: world,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Valeros',
    system: {},
  };

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  /** Scene 2000 x 1000 fitted at 0.5: the token at scene (250, 250) is at screen (149, 149). */
  async function setup(who: Seat, hidden = false) {
    lobby.mySeat = who;
    docs.actors = [hero];
    const scene = makeScene();
    state.shownScene = scene;
    const token = tokenSchema.parse({
      id: crypto.randomUUID(),
      worldId: world,
      type: 'token',
      schemaVersion: 1,
      permissions: { default: 'observer', seats: {} },
      createdAt: NOW,
      updatedAt: NOW,
      sceneId: scene.id,
      actorId: hero.id,
      x: 250,
      y: 250,
      hidden,
    });
    state.shownTokens = [token];
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, token, surface: wrapper.get('.map-surface') };
  }

  const rightClick = async (surface: { element: Element }, x: number, y: number) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });
    surface.element.dispatchEvent(event);
    await flushPromises();
    return event;
  };

  const status = (wrapper: ReturnType<typeof mountView>) =>
    wrapper.get('p[role="status"].visually-hidden').text();

  it('opens on a right click on a token, and selects it', async () => {
    const { wrapper, surface } = await setup(seat(true));
    const event = await rightClick(surface, 149, 149);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.find('.token-menu').exists()).toBe(true);
    expect(wrapper.find('.token-list button[aria-pressed="true"]').exists()).toBe(true);
  });

  it('opens no token menu on empty ground, and leaves every click by a player to the browser', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await rightClick(surface, 600, 400);
    expect(wrapper.find('.token-menu').exists()).toBe(false);

    lobby.mySeat = seat(false);
    const refused = await rightClick(surface, 149, 149);
    expect(refused.defaultPrevented).toBe(false);
    expect(wrapper.find('.token-menu').exists()).toBe(false);
  });

  it('opens from the keyboard for the selected token, by the Menu key or Shift+F10', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await surface.trigger('keydown', { key: 'ContextMenu' });
    expect(wrapper.find('.token-menu').exists()).toBe(false);

    await wrapper.get('.token-list button').trigger('click');
    await surface.trigger('keydown', { key: 'ContextMenu' });
    expect(wrapper.find('.token-menu').exists()).toBe(true);

    await wrapper.get('.token-menu').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.token-menu').exists()).toBe(false);
    expect(document.activeElement).toBe(surface.element);

    await surface.trigger('keydown', { key: 'F10', shiftKey: true });
    expect(wrapper.find('.token-menu').exists()).toBe(true);
  });

  it('is not offered to a player by the keyboard either', async () => {
    const { wrapper, surface } = await setup(seat(false));
    await wrapper.get('.token-list button').trigger('click');
    await surface.trigger('keydown', { key: 'ContextMenu' });
    expect(wrapper.find('.token-menu').exists()).toBe(false);
  });

  it('hides a token with token.update, and says so', async () => {
    const { wrapper, token, surface } = await setup(seat(true));
    await rightClick(surface, 149, 149);
    await wrapper.get('.token-menu [role="menuitem"]').trigger('click');
    await flushPromises();

    expect(send).toHaveBeenCalledWith('token.update', {
      tokenId: token.id,
      changes: { hidden: true },
    });
    expect(wrapper.find('.token-menu').exists()).toBe(false);
    expect(status(wrapper)).toBe('Valeros hidden from the players.');
  });

  it('shows a hidden token', async () => {
    const { wrapper, token, surface } = await setup(seat(true), true);
    await rightClick(surface, 149, 149);
    await wrapper.get('.token-menu [role="menuitem"]').trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('token.update', {
      tokenId: token.id,
      changes: { hidden: false },
    });
    expect(status(wrapper)).toBe('Valeros shown to the players.');
  });

  it('offers "Add to combat" only with a combat the token has not joined, and sends it', async () => {
    const { wrapper, token, surface } = await setup(seat(true), true);
    await rightClick(surface, 149, 149);
    expect(
      wrapper
        .findAll('.token-menu [role="menuitem"]')
        .find((b) => b.text() === 'Add to combat'),
    ).toBeUndefined();
    await wrapper.get('[role="menu"]').trigger('keydown', { key: 'Escape' });

    combat.activeCombat = { status: 'active' };
    await rightClick(surface, 149, 149);
    const add = wrapper
      .findAll('.token-menu [role="menuitem"]')
      .find((b) => b.text() === 'Add to combat');
    await add?.trigger('click');
    await flushPromises();
    expect(addCombatant).toHaveBeenCalledWith(token.id, true);
    expect(status(wrapper)).toBe('Valeros joined the fight.');
  });

  it('removes a token with token.delete', async () => {
    const { wrapper, token, surface } = await setup(seat(true));
    await rightClick(surface, 149, 149);
    const remove = wrapper
      .findAll('.token-menu [role="menuitem"]')
      .find((b) => b.text() === 'Remove from map');
    await remove?.trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('token.delete', { tokenId: token.id });
    expect(status(wrapper)).toBe('Valeros removed from the map.');
  });

  it('resizes from the form, and says nothing when the server refuses', async () => {
    send.mockResolvedValue(false);
    const { wrapper, token, surface } = await setup(seat(true));
    await rightClick(surface, 149, 149);
    await wrapper
      .findAll('.token-menu [role="menuitem"]')
      .find((b) => b.text() === 'Name and size')
      ?.trigger('click');
    await wrapper.get('#token-size').setValue('2');
    await wrapper.get('.token-menu form').trigger('submit');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('token.update', {
      tokenId: token.id,
      changes: { size: 2 },
    });
    expect(status(wrapper)).toBe('');
  });

  it('closes when the map is pressed elsewhere, and when its token goes away', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await rightClick(surface, 149, 149);
    await pointer(surface, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 600,
      clientY: 400,
    });
    expect(wrapper.find('.token-menu').exists()).toBe(false);

    await rightClick(surface, 149, 149);
    expect(wrapper.find('.token-menu').exists()).toBe(true);
    state.shownTokens = [];
    await flushPromises();
    expect(wrapper.find('.token-menu').exists()).toBe(false);
  });

  it('keeps the menu’s keys from moving the selected token', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await rightClick(surface, 149, 149);
    await wrapper.get('.token-menu').trigger('keydown', { key: 'ArrowDown' });
    expect(moveToken).not.toHaveBeenCalled();
  });
});

describe('exits', () => {
  const world = crypto.randomUUID();
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: world,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  /**
   * A Yard (2000 x 1000, fitted at 0.5: scene (250, 250) is screen (149, 149)) with a
   * Gate at (250, 250) leading to a Keep, which may have its own way back.
   */
  async function setup(who: Seat, withWayBack = false) {
    lobby.mySeat = who;
    const keep = makeScene({
      name: 'Keep',
      links: withWayBack ? [] : [],
    });
    const yard = makeScene({
      name: 'Yard',
      links: [
        {
          id: crypto.randomUUID(),
          label: 'Gate',
          x: 250,
          y: 250,
          targetSceneId: keep.id,
        },
      ],
    });
    const keepWithBack = withWayBack
      ? makeScene({
          id: keep.id,
          name: 'Keep',
          links: [
            {
              id: crypto.randomUUID(),
              label: 'Door',
              x: 700,
              y: 300,
              targetSceneId: yard.id,
            },
          ],
        })
      : keep;
    state.scenes = [yard, keepWithBack];
    state.shownScene = yard;
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, yard, keep: keepWithBack, surface: wrapper.get('.map-surface') };
  }

  const click = (surface: { element: Element }, x: number, y: number) =>
    pointer(surface, 'pointerdown', { pointerId: 1, button: 0, clientX: x, clientY: y });

  it('draws the GM’s exits and lists them beside the tokens', async () => {
    const { wrapper, keep } = await setup(seat(true));
    expect(view.setExits.mock.lastCall?.[0]).toEqual([
      expect.objectContaining({
        label: 'Gate',
        targetName: 'Keep',
        targetSceneId: keep.id,
      }),
    ]);
    expect(wrapper.get('.token-list').text()).toContain('Exit: Gate, to Keep');
  });

  it('shows a player none', async () => {
    const { wrapper } = await setup(seat(false));
    expect(view.setExits.mock.lastCall?.[0]).toEqual([]);
    expect(wrapper.text()).not.toContain('Exit: Gate');
  });

  it('asks before moving the party when an exit marker is pressed', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await click(surface, 149, 149);
    const question = wrapper.get('[role="alertdialog"]');
    expect(question.text()).toContain('Move the party to Keep?');
    expect(send).not.toHaveBeenCalled();
    expect(document.activeElement?.textContent).toContain('Move the party');
  });

  it('does not pan the map when an exit is pressed, and still pans from empty ground', async () => {
    const { surface } = await setup(seat(true));
    view.setCamera.mockClear();
    await click(surface, 149, 149);
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 200, clientY: 149 });
    expect(view.setCamera).not.toHaveBeenCalled();

    await click(surface, 800, 400);
    await pointer(surface, 'pointermove', { pointerId: 1, clientX: 850, clientY: 400 });
    expect(view.setCamera).toHaveBeenCalled();
  });

  it('moves the party on yes, and goes back to showing the party’s scene', async () => {
    const { wrapper, keep, surface } = await setup(seat(true));
    await click(surface, 149, 149);
    await wrapper.get('[role="alertdialog"] button').trigger('click');
    await flushPromises();

    expect(send).toHaveBeenCalledWith('scene.activate', { sceneId: keep.id });
    expect(previewScene).toHaveBeenCalledWith(undefined);
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(wrapper.get('p[role="status"].visually-hidden').text()).toBe(
      'The party moved to Keep.',
    );
    expect(document.activeElement).toBe(surface.element);
  });

  it('arrives at the target’s own exit back, when it has one', async () => {
    const { wrapper, keep, surface } = await setup(seat(true), true);
    await click(surface, 149, 149);
    await wrapper.get('[role="alertdialog"] button').trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('scene.activate', {
      sceneId: keep.id,
      at: { x: 700, y: 300 },
    });
  });

  it('keeps the party where it is on Cancel and on Escape', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await click(surface, 149, 149);
    await wrapper.get('[role="alertdialog"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(surface.element);

    await click(surface, 149, 149);
    const cancel = wrapper
      .findAll('[role="alertdialog"] button')
      .find((b) => b.text() === 'Cancel');
    await cancel?.trigger('click');
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('does nothing further, and says nothing, when the server refuses', async () => {
    send.mockResolvedValue(false);
    const { wrapper, surface } = await setup(seat(true));
    await click(surface, 149, 149);
    await wrapper.get('[role="alertdialog"] button').trigger('click');
    await flushPromises();
    expect(previewScene).not.toHaveBeenCalled();
    expect(wrapper.get('p[role="status"].visually-hidden').text()).toBe('');
  });

  it('asks through the keyboard list too', async () => {
    const { wrapper } = await setup(seat(true));
    const button = wrapper
      .findAll('.token-list button')
      .find((b) => b.text().startsWith('Exit: Gate'));
    await button?.trigger('click');
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true);
  });

  it('will not move the party to a scene that is gone', async () => {
    const { wrapper } = await setup(seat(true));
    state.scenes = state.scenes.filter((scene) => scene.name !== 'Keep');
    await flushPromises();
    const button = wrapper
      .findAll('.token-list button')
      .find((b) => b.text().includes('a scene that is gone'));
    await button?.trigger('click');
    expect(
      wrapper.get('[role="alertdialog"] button').attributes('disabled'),
    ).toBeDefined();
  });

  const rightClick = async (surface: { element: Element }, x: number, y: number) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
    });
    surface.element.dispatchEvent(event);
    await flushPromises();
    return event;
  };

  const status = (wrapper: ReturnType<typeof mountView>) =>
    wrapper.get('p[role="status"].visually-hidden').text();

  it('adds an exit where the GM right-clicks empty ground', async () => {
    const { wrapper, yard, keep, surface } = await setup(seat(true));
    // Screen (449, 349) is scene (850, 650).
    const event = await rightClick(surface, 449, 349);
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.get('.exit-menu').attributes('aria-label')).toBe('Add an exit here');

    await wrapper.get('#exit-label').setValue('Trapdoor');
    await wrapper.get('.exit-menu form').trigger('submit');
    await flushPromises();

    expect(send).toHaveBeenCalledWith('scene.addLink', {
      sceneId: yard.id,
      label: 'Trapdoor',
      x: 850,
      y: 650,
      targetSceneId: keep.id,
    });
    expect(wrapper.find('.exit-menu').exists()).toBe(false);
    expect(status(wrapper)).toBe('Exit Trapdoor added.');
    expect(document.activeElement).toBe(surface.element);
  });

  it('adds one in the middle of the view from the keyboard, when nothing is selected', async () => {
    const { wrapper, yard, keep, surface } = await setup(seat(true));
    await surface.trigger('keydown', { key: 'ContextMenu' });
    await wrapper.get('#exit-label').setValue('Stairs');
    await wrapper.get('.exit-menu form').trigger('submit');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('scene.addLink', {
      sceneId: yard.id,
      label: 'Stairs',
      x: 1000,
      y: 500,
      targetSceneId: keep.id,
    });

    await surface.trigger('keydown', { key: 'F10', shiftKey: true });
    expect(wrapper.find('.exit-menu').exists()).toBe(true);
  });

  it('offers the other scenes only', async () => {
    const { wrapper, yard } = await setup(seat(true));
    await rightClick(wrapper.get('.map-surface'), 449, 349);
    const names = wrapper.findAll('.exit-menu option').map((o) => o.text());
    expect(names).toEqual(['Keep']);
    expect(names).not.toContain(yard.name);
  });

  it('is never offered to a player', async () => {
    const { wrapper, surface } = await setup(seat(false));
    const event = await rightClick(surface, 449, 349);
    expect(event.defaultPrevented).toBe(false);
    await surface.trigger('keydown', { key: 'ContextMenu' });
    expect(wrapper.find('.exit-menu').exists()).toBe(false);
  });

  it('does not open off the scene', async () => {
    const { wrapper, surface } = await setup(seat(true));
    // The scene is 2000 x 1000 at half size, centred: its left edge is screen x 24.
    const event = await rightClick(surface, 5, 149);
    expect(event.defaultPrevented).toBe(false);
    expect(wrapper.find('.exit-menu').exists()).toBe(false);
  });

  it('removes an exit from a right click on its marker', async () => {
    const { wrapper, yard, surface } = await setup(seat(true));
    await rightClick(surface, 149, 149);
    expect(wrapper.get('.exit-menu').text()).toContain('Gate leads to Keep');
    const remove = wrapper
      .findAll('.exit-menu button')
      .find((b) => b.text() === 'Remove exit');
    await remove?.trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('scene.removeLink', {
      sceneId: yard.id,
      linkId: yard.links[0]?.id,
    });
    expect(status(wrapper)).toBe('Exit Gate removed.');
  });

  it('closes on Escape, and when the map is pressed elsewhere', async () => {
    const { wrapper, surface } = await setup(seat(true));
    await rightClick(surface, 449, 349);
    await wrapper.get('.exit-menu').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.exit-menu').exists()).toBe(false);
    expect(send).not.toHaveBeenCalled();

    await rightClick(surface, 449, 349);
    await pointer(surface, 'pointerdown', {
      pointerId: 1,
      button: 0,
      clientX: 700,
      clientY: 450,
    });
    expect(wrapper.find('.exit-menu').exists()).toBe(false);
  });

  it('says nothing was added when the server refuses', async () => {
    send.mockResolvedValue(false);
    const { wrapper, surface } = await setup(seat(true));
    await rightClick(surface, 449, 349);
    await wrapper.get('#exit-label').setValue('Trapdoor');
    await wrapper.get('.exit-menu form').trigger('submit');
    await flushPromises();
    expect(status(wrapper)).toBe('');
  });
});

describe('the ruler', () => {
  const world = crypto.randomUUID();
  const seat = (isGM: boolean): Seat => ({
    id: crypto.randomUUID(),
    worldId: world,
    schemaVersion: 1,
    name: 'S',
    isGM,
    createdAt: NOW,
    updatedAt: NOW,
  });

  beforeEach(() => {
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  /** Scene 2000 x 1000, 100 px squares, fitted at 0.5: scene (250, 250) is screen (149, 149), a square is 50 px. */
  async function setup(who = seat(false)) {
    lobby.mySeat = who;
    state.shownScene = makeScene();
    const wrapper = mountView();
    await ready(wrapper);
    return { wrapper, surface: wrapper.get('.map-surface') };
  }

  const press = (surface: { element: Element }, x: number, y: number) =>
    pointer(surface, 'pointerdown', { pointerId: 1, button: 0, clientX: x, clientY: y });
  const move = (surface: { element: Element }, x: number, y: number) =>
    pointer(surface, 'pointermove', { pointerId: 1, clientX: x, clientY: y });
  const status = (wrapper: ReturnType<typeof mountView>) =>
    wrapper.get('p[role="status"].visually-hidden').text();
  const rulerButton = (wrapper: ReturnType<typeof mountView>) =>
    wrapper.get('.map-zoom button[title^="Measure"]');
  const lastRuler = () => view.setRuler.mock.lastCall?.[0] as { x: number; y: number }[];

  it('turns on with M or the button, and off again, saying so', async () => {
    const { wrapper, surface } = await setup();
    expect(rulerButton(wrapper).attributes('aria-pressed')).toBe('false');
    await surface.trigger('keydown', { key: 'm' });
    expect(rulerButton(wrapper).attributes('aria-pressed')).toBe('true');
    expect(surface.classes()).toContain('is-measuring');
    expect(status(wrapper)).toContain('Ruler on');

    await surface.trigger('keydown', { key: 'M' });
    expect(rulerButton(wrapper).attributes('aria-pressed')).toBe('false');
    expect(status(wrapper)).toBe('Ruler off.');

    await rulerButton(wrapper).trigger('click');
    expect(surface.classes()).toContain('is-measuring');
  });

  it('measures from the first click to the pointer, in feet, by the grid rules', async () => {
    const { wrapper, surface } = await setup();
    await surface.trigger('keydown', { key: 'm' });
    await press(surface, 149, 149);
    await move(surface, 399, 149);
    // From square centre (250, 250) to (750, 250): five squares.
    expect(wrapper.get('output.move-readout').text()).toBe('25 ft');
    expect(lastRuler()).toEqual([
      { x: 250, y: 250 },
      { x: 750, y: 250 },
    ]);

    await move(surface, 399, 399);
    // Five across and five down: five diagonals, 5 + 10 + 5 + 10 + 5.
    expect(wrapper.get('output.move-readout').text()).toBe('35 ft');
  });

  it('adds up a route through several points, and announces the total', async () => {
    const { wrapper, surface } = await setup();
    await surface.trigger('keydown', { key: 'm' });
    await press(surface, 149, 149);
    await press(surface, 349, 149);
    expect(status(wrapper)).toBe('Ruler: 20 ft so far.');
    await move(surface, 349, 249);
    expect(wrapper.get('output.move-readout').text()).toBe('30 ft');
  });

  it('takes the last point back with Backspace, and puts the ruler away with Escape', async () => {
    const { wrapper, surface } = await setup();
    await surface.trigger('keydown', { key: 'm' });
    await press(surface, 149, 149);
    await press(surface, 349, 149);
    await surface.trigger('keydown', { key: 'Backspace' });
    await move(surface, 349, 149);
    expect(wrapper.get('output.move-readout').text()).toBe('20 ft');

    await surface.trigger('keydown', { key: 'Escape' });
    expect(rulerButton(wrapper).attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('output.move-readout').exists()).toBe(false);
    expect(lastRuler()).toEqual([]);
  });

  it('does not pan the map while measuring, and does not select tokens', async () => {
    const { surface } = await setup();
    await surface.trigger('keydown', { key: 'm' });
    view.setCamera.mockClear();
    await press(surface, 149, 149);
    await move(surface, 300, 300);
    expect(view.setCamera).not.toHaveBeenCalled();
  });

  it('forgets its points when the ruler is turned off and on again', async () => {
    const { surface } = await setup();
    await surface.trigger('keydown', { key: 'm' });
    await press(surface, 149, 149);
    await surface.trigger('keydown', { key: 'm' });
    await surface.trigger('keydown', { key: 'm' });
    await move(surface, 300, 300);
    expect(lastRuler()).toHaveLength(1);
  });

  it('is there for a player as well as the GM', async () => {
    const { wrapper } = await setup(seat(false));
    expect(wrapper.find('.map-zoom button[title^="Measure"]').exists()).toBe(true);
    const gm = await setup(seat(true));
    expect(gm.wrapper.find('.map-zoom button[title^="Measure"]').exists()).toBe(true);
  });
});

describe('distances in the token list', () => {
  const world = crypto.randomUUID();
  const hero = (name: string): Actor => ({
    id: crypto.randomUUID(),
    worldId: world,
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name,
    system: {},
  });

  it('says how far each other token is from the selected one, in feet', async () => {
    lobby.mySeat = undefined;
    const [anna, ben] = [hero('Anna'), hero('Ben')];
    docs.actors = [anna, ben];
    const scene = makeScene();
    state.shownScene = scene;
    const token = (actor: Actor, x: number) =>
      tokenSchema.parse({
        id: crypto.randomUUID(),
        worldId: world,
        type: 'token',
        schemaVersion: 1,
        permissions: { default: 'observer', seats: {} },
        createdAt: NOW,
        updatedAt: NOW,
        sceneId: scene.id,
        actorId: actor.id,
        x,
        y: 250,
      });
    state.shownTokens = [token(anna, 250), token(ben, 650)];
    const wrapper = mountView();
    await ready(wrapper);

    const buttons = () =>
      wrapper.findAll('.token-list li > button:first-child').map((b) => b.text());
    expect(buttons()).toEqual(['Anna', 'Ben']);

    await wrapper.get('.token-list li button').trigger('click');
    expect(buttons()).toEqual(['Anna', 'Ben, 20 ft away']);
  });
});
