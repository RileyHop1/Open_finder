// @vitest-environment jsdom
import type { Scene } from '@hearthtable/core';
import { sceneSchema } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

import SceneManager from './SceneManager.vue';

const NOW = '2026-10-01T00:00:00.000Z';

const send = vi.fn<(type: string, payload: unknown) => Promise<boolean>>();
const previewScene = vi.fn<(id: string | undefined) => void>();
const state = reactive<{
  scenes: Scene[];
  partySceneId: string | undefined;
  shownSceneId: string | undefined;
  isPreviewing: boolean;
  send: typeof send;
  previewScene: typeof previewScene;
}>({
  scenes: [],
  partySceneId: undefined,
  shownSceneId: undefined,
  isPreviewing: false,
  send,
  previewScene,
});
vi.mock('../../stores/scenes.js', () => ({ useScenesStore: () => state }));

const makeScene = (name: string, kind = 'battle'): Scene =>
  sceneSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'scene',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    name,
    kind,
  });

const mountManager = () => mount(SceneManager, { props: { worldId: 'world-1' } });

const rowOf = (wrapper: ReturnType<typeof mountManager>, name: string) =>
  wrapper.findAll('.scene-row').find((row) => row.text().includes(name));

const button = (row: ReturnType<typeof rowOf>, label: string) =>
  row?.findAll('button').find((b) => b.text() === label);

beforeEach(() => {
  vi.resetAllMocks();
  send.mockResolvedValue(true);
  state.scenes = [];
  state.partySceneId = undefined;
  state.shownSceneId = undefined;
  state.isPreviewing = false;
});

describe('the list', () => {
  it('says there are no scenes, and offers to make one', () => {
    const wrapper = mountManager();
    expect(wrapper.text()).toContain('No scenes yet');
    expect(wrapper.find('form.new-scene').exists()).toBe(true);
  });

  it('lists each scene with its kind, and says in words where the party is', () => {
    const [bog, keep] = [makeScene('Bog'), makeScene('Keep', 'area')];
    state.scenes = [bog, keep];
    state.partySceneId = keep.id;
    const wrapper = mountManager();

    expect(rowOf(wrapper, 'Bog')?.text()).toContain('Battle map');
    expect(rowOf(wrapper, 'Keep')?.text()).toContain('Area');
    expect(rowOf(wrapper, 'Keep')?.text()).toContain('Party is here');
    expect(rowOf(wrapper, 'Bog')?.text()).not.toContain('Party is here');
  });

  it('says "Previewing" on the scene being previewed', () => {
    const [bog, keep] = [makeScene('Bog'), makeScene('Keep')];
    state.scenes = [bog, keep];
    state.partySceneId = keep.id;
    state.shownSceneId = bog.id;
    state.isPreviewing = true;
    expect(rowOf(mountManager(), 'Bog')?.text()).toContain('Previewing');
  });
});

describe('making a scene', () => {
  it('sends the name and kind, and clears the name when it is accepted', async () => {
    const wrapper = mountManager();
    await wrapper.get('#new-scene-name').setValue('  Old Mill ');
    await wrapper.get('#new-scene-kind').setValue('area');
    await wrapper.get('form.new-scene').trigger('submit');
    await flushPromises();

    expect(send).toHaveBeenCalledWith('scene.create', { name: 'Old Mill', kind: 'area' });
    expect((wrapper.get('#new-scene-name').element as HTMLInputElement).value).toBe('');
  });

  it('keeps the name when the server refuses', async () => {
    send.mockResolvedValue(false);
    const wrapper = mountManager();
    await wrapper.get('#new-scene-name').setValue('Old Mill');
    await wrapper.get('form.new-scene').trigger('submit');
    await flushPromises();
    expect((wrapper.get('#new-scene-name').element as HTMLInputElement).value).toBe(
      'Old Mill',
    );
  });

  it('ignores a blank name', async () => {
    const wrapper = mountManager();
    await wrapper.get('#new-scene-name').setValue('   ');
    await wrapper.get('form.new-scene').trigger('submit');
    expect(send).not.toHaveBeenCalled();
  });

  it('opens the new scene’s settings, and previews it, when it arrives', async () => {
    const wrapper = mountManager();
    await wrapper.get('#new-scene-name').setValue('Old Mill');
    await wrapper.get('form.new-scene').trigger('submit');
    await flushPromises();

    const mill = makeScene('Old Mill');
    state.scenes = [mill];
    await flushPromises();
    expect(wrapper.find('.scene-editor').exists()).toBe(true);
    expect(previewScene).toHaveBeenCalledWith(mill.id);
  });
});

describe('moving the party and previewing', () => {
  it('moves the party with scene.activate, then stops previewing', async () => {
    const bog = makeScene('Bog');
    state.scenes = [bog];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Move party here')?.trigger('click');
    await flushPromises();

    expect(send).toHaveBeenCalledWith('scene.activate', { sceneId: bog.id });
    expect(previewScene).toHaveBeenCalledWith(undefined);
  });

  it('keeps previewing if the server refuses', async () => {
    send.mockResolvedValue(false);
    state.scenes = [makeScene('Bog')];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Move party here')?.trigger('click');
    await flushPromises();
    expect(previewScene).not.toHaveBeenCalled();
  });

  it('cannot move the party to, or preview, the scene it is already on', () => {
    const bog = makeScene('Bog');
    state.scenes = [bog];
    state.partySceneId = bog.id;
    const row = rowOf(mountManager(), 'Bog');
    expect(button(row, 'Move party here')?.attributes('disabled')).toBeDefined();
    expect(button(row, 'Preview')?.attributes('disabled')).toBeDefined();
  });

  it('previews a scene, and a second press goes back', async () => {
    const [bog, keep] = [makeScene('Bog'), makeScene('Keep')];
    state.scenes = [bog, keep];
    state.partySceneId = keep.id;
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Preview')?.trigger('click');
    expect(previewScene).toHaveBeenLastCalledWith(bog.id);

    state.shownSceneId = bog.id;
    state.isPreviewing = true;
    await flushPromises();
    await button(rowOf(wrapper, 'Bog'), 'Preview')?.trigger('click');
    expect(previewScene).toHaveBeenLastCalledWith(undefined);
  });
});

describe('editing', () => {
  it('opens a scene’s settings and previews it so changes are seen as they are made', async () => {
    const bog = makeScene('Bog');
    state.scenes = [bog];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Edit')?.trigger('click');

    expect(wrapper.find('.scene-editor').exists()).toBe(true);
    expect(previewScene).toHaveBeenCalledWith(bog.id);
    expect(button(rowOf(wrapper, 'Bog'), 'Edit')?.attributes('aria-pressed')).toBe(
      'true',
    );

    await button(rowOf(wrapper, 'Bog'), 'Edit')?.trigger('click');
    expect(wrapper.find('.scene-editor').exists()).toBe(false);
  });

  it('sends each change as a scene.update for that scene', async () => {
    const bog = makeScene('Bog');
    state.scenes = [bog];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Edit')?.trigger('click');

    await wrapper.get(`#grid-size-${bog.id}`).setValue('64');
    await wrapper.get(`#grid-size-${bog.id}`).trigger('change');
    expect(send).toHaveBeenCalledWith('scene.update', {
      sceneId: bog.id,
      changes: { grid: { size: 64 } },
    });
  });

  it('closes the settings when the scene is deleted from under it', async () => {
    const bog = makeScene('Bog');
    state.scenes = [bog];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Edit')?.trigger('click');
    state.scenes = [];
    await flushPromises();
    expect(wrapper.find('.scene-editor').exists()).toBe(false);
  });
});

describe('deleting', () => {
  it('asks first, says what goes with it, and deletes only on confirmation', async () => {
    const bog = makeScene('Bog');
    state.scenes = [bog];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Delete')?.trigger('click');

    expect(send).not.toHaveBeenCalled();
    expect(wrapper.get('.confirm').text()).toContain('Its tokens go with it');
    await wrapper.get('.confirm .danger').trigger('click');
    await flushPromises();
    expect(send).toHaveBeenCalledWith('scene.delete', { sceneId: bog.id });
    expect(wrapper.find('.confirm').exists()).toBe(false);
  });

  it('keeps the scene when the GM changes their mind', async () => {
    state.scenes = [makeScene('Bog')];
    const wrapper = mountManager();
    await button(rowOf(wrapper, 'Bog'), 'Delete')?.trigger('click');
    await button(rowOf(wrapper, 'Bog'), 'Keep it')?.trigger('click');
    expect(send).not.toHaveBeenCalled();
    expect(wrapper.find('.confirm').exists()).toBe(false);
  });
});
