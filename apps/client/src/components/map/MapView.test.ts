// @vitest-environment jsdom
import type { Scene } from '@hearthtable/core';
import { sceneSchema } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, reactive } from 'vue';

import MapView from './MapView.vue';
import * as mapImage from './mapImage.js';
import * as sceneViewModule from './sceneView.js';

const NOW = '2026-10-01T00:00:00.000Z';

const state = reactive<{ shownScene: Scene | undefined }>({ shownScene: undefined });
vi.mock('../../stores/scenes.js', () => ({ useScenesStore: () => state }));
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
const view = { update: vi.fn(), setCamera: vi.fn(), destroy: vi.fn() };

const mounted: { unmount: () => void }[] = [];

function mountView() {
  const wrapper = mount(MapView, {
    props: { worldId: 'world-1' },
    global: { stubs: { MapCanvas: CanvasStub } },
  });
  mounted.push(wrapper);
  return wrapper;
}

// Every view watches the same shared state, so one left behind would answer the next test's changes.
afterEach(() => {
  state.shownScene = undefined;
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
    expect(wrapper.get('[role="status"]').text()).toContain('could not be loaded');
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
