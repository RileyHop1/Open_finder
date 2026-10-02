// @vitest-environment jsdom
import type { Scene } from '@hearthtable/core';
import { sceneSchema } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as assets from '../../api/assets.js';
import SceneEditor from './SceneEditor.vue';
import * as imageSize from './imageSize.js';

vi.mock('../../api/assets.js', async (importOriginal) => ({
  ...(await importOriginal<typeof assets>()),
  uploadAsset: vi.fn(),
}));
vi.mock('./imageSize.js');

const NOW = '2026-10-01T00:00:00.000Z';

const makeScene = (overrides: Record<string, unknown> = {}): Scene =>
  sceneSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'scene',
    schemaVersion: 1,
    permissions: { default: 'none', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Bog',
    kind: 'battle',
    ...overrides,
  });

function mountEditor(scene = makeScene()) {
  return mount(SceneEditor, { props: { scene, worldId: 'world-1' } });
}

const emitted = (wrapper: ReturnType<typeof mountEditor>) =>
  wrapper.emitted('change')?.map((call) => call[0]);

async function set(wrapper: ReturnType<typeof mountEditor>, id: string, value: string) {
  // `setValue` fires both `input` and `change`, as typing and leaving the box does.
  await wrapper.get(`#${id}`).setValue(value);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('name and kind', () => {
  it('saves a new name, trimmed, and ignores an empty one', () => {
    const scene = makeScene();
    const wrapper = mountEditor(scene);
    const name = wrapper.get(`#scene-name-${scene.id}`);
    (name.element as HTMLInputElement).value = '  Deep Bog ';
    void name.trigger('change');
    (name.element as HTMLInputElement).value = '   ';
    void name.trigger('change');
    expect(emitted(wrapper)).toEqual([{ name: 'Deep Bog' }]);
  });

  it('saves a new kind', async () => {
    const scene = makeScene();
    const wrapper = mountEditor(scene);
    await wrapper.get(`#scene-kind-${scene.id}`).setValue('overworld');
    expect(emitted(wrapper)).toEqual([{ kind: 'overworld' }]);
  });
});

describe('grid and size', () => {
  it('saves one grid field at a time, so it cannot reset the others', async () => {
    const scene = makeScene();
    const wrapper = mountEditor(scene);
    await set(wrapper, `grid-size-${scene.id}`, '70');
    await set(wrapper, `grid-x-${scene.id}`, '-12');
    await set(wrapper, `grid-y-${scene.id}`, '5');
    await set(wrapper, `grid-distance-${scene.id}`, '10');
    await wrapper.get(`#grid-type-${scene.id}`).setValue('none');
    expect(emitted(wrapper)).toEqual([
      { grid: { size: 70 } },
      { grid: { offsetX: -12 } },
      { grid: { offsetY: 5 } },
      { grid: { distance: 10 } },
      { grid: { type: 'none' } },
    ]);
  });

  it('shows the current values', () => {
    const scene = makeScene({ grid: { size: 64, offsetX: 3 } });
    const wrapper = mountEditor(scene);
    expect(
      (wrapper.get(`#grid-size-${scene.id}`).element as HTMLInputElement).value,
    ).toBe('64');
    expect((wrapper.get(`#grid-x-${scene.id}`).element as HTMLInputElement).value).toBe(
      '3',
    );
  });

  it('saves nothing for a value outside the limits or an empty box', async () => {
    const scene = makeScene();
    const wrapper = mountEditor(scene);
    await set(wrapper, `grid-size-${scene.id}`, '5');
    await set(wrapper, `grid-size-${scene.id}`, '5000');
    await set(wrapper, `grid-size-${scene.id}`, '');
    await set(wrapper, `scene-width-${scene.id}`, '50');
    expect(emitted(wrapper)).toBeUndefined();
  });

  it('saves the scene’s size', async () => {
    const scene = makeScene();
    const wrapper = mountEditor(scene);
    await set(wrapper, `scene-width-${scene.id}`, '4000');
    await set(wrapper, `scene-height-${scene.id}`, '3000');
    expect(emitted(wrapper)).toEqual([{ width: 4000 }, { height: 3000 }]);
  });
});

describe('the map picture', () => {
  const pick = async (wrapper: ReturnType<typeof mountEditor>, file: File) => {
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await flushPromises();
  };
  const png = () => new File(['x'], 'map.png', { type: 'image/png' });

  it('reads the picture’s size, uploads it, and sets the scene to match', async () => {
    vi.mocked(imageSize.readImageSize).mockResolvedValue({ width: 3000, height: 1500 });
    vi.mocked(assets.uploadAsset).mockResolvedValue({ name: 'abc.png', url: '/x' });
    const wrapper = mountEditor();
    await pick(wrapper, png());

    expect(assets.uploadAsset).toHaveBeenCalledWith('world-1', expect.any(File));
    expect(emitted(wrapper)).toEqual([
      { background: 'abc.png', width: 3000, height: 1500 },
    ]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('offers to replace a picture that is there, and to remove it', async () => {
    const scene = makeScene({ background: `${'a'.repeat(64)}.png` });
    const wrapper = mountEditor(scene);
    expect(wrapper.get('img.map-thumb').attributes('src')).toBe(
      `/api/worlds/world-1/assets/${'a'.repeat(64)}.png`,
    );
    expect(wrapper.text()).toContain('Replace the picture');
    await wrapper.get('fieldset button').trigger('click');
    expect(emitted(wrapper)).toEqual([{ background: null }]);
  });

  it('says there is no picture yet, with no remove button', () => {
    const wrapper = mountEditor();
    expect(wrapper.text()).toContain('No picture yet');
    expect(wrapper.text()).toContain('Upload a picture');
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('refuses a file that is not a picture, uploading nothing', async () => {
    const wrapper = mountEditor();
    await pick(wrapper, new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(wrapper.get('[role="alert"]').text()).toContain('PNG, JPEG, WebP, or GIF');
    expect(assets.uploadAsset).not.toHaveBeenCalled();
  });

  it('refuses a picture too large or too small for a scene, before uploading', async () => {
    const wrapper = mountEditor();
    vi.mocked(imageSize.readImageSize).mockResolvedValueOnce({
      width: 40000,
      height: 900,
    });
    await pick(wrapper, png());
    expect(wrapper.get('[role="alert"]').text()).toContain('at most 32000');

    vi.mocked(imageSize.readImageSize).mockResolvedValueOnce({ width: 50, height: 900 });
    await pick(wrapper, png());
    expect(wrapper.get('[role="alert"]').text()).toContain('smaller than 100');
    expect(assets.uploadAsset).not.toHaveBeenCalled();
    expect(emitted(wrapper)).toBeUndefined();
  });

  it('shows the server’s reason when the upload is refused, and changes nothing', async () => {
    vi.mocked(imageSize.readImageSize).mockResolvedValue({ width: 3000, height: 1500 });
    vi.mocked(assets.uploadAsset).mockRejectedValue(new Error('not an image'));
    const wrapper = mountEditor();
    await pick(wrapper, png());
    expect(wrapper.get('[role="alert"]').text()).toBe('not an image');
    expect(emitted(wrapper)).toBeUndefined();
  });

  it('says so when the browser cannot read the picture', async () => {
    vi.mocked(imageSize.readImageSize).mockRejectedValue(new Error('could not decode'));
    const wrapper = mountEditor();
    await pick(wrapper, png());
    expect(wrapper.get('[role="alert"]').text()).toBe('could not decode');
  });
});

describe('exits', () => {
  const keep = { id: crypto.randomUUID(), name: 'Keep' };

  function mountWithOthers(scene = makeScene(), others = [keep]) {
    return mount(SceneEditor, { props: { scene, worldId: 'world-1', others } });
  }

  const added = (wrapper: ReturnType<typeof mountWithOthers>) =>
    wrapper.emitted('addExit');

  it('lists the exits with where each leads, and removes one by its id', async () => {
    const scene = makeScene({
      links: [
        { id: crypto.randomUUID(), label: 'Gate', x: 5, y: 6, targetSceneId: keep.id },
      ],
    });
    const wrapper = mountWithOthers(scene);
    expect(wrapper.get('.exits ul').text()).toContain('Gate to Keep');
    await wrapper.get('button[aria-label="Remove the exit Gate"]').trigger('click');
    expect(wrapper.emitted('removeExit')).toEqual([[scene.links[0]?.id]]);
  });

  it('says so when there are no exits, or the target is gone', () => {
    expect(mountWithOthers().text()).toContain('No exits yet');
    const scene = makeScene({
      links: [
        {
          id: crypto.randomUUID(),
          label: 'Gate',
          x: 5,
          y: 6,
          targetSceneId: crypto.randomUUID(),
        },
      ],
    });
    expect(mountWithOthers(scene).text()).toContain('Gate to a scene that is gone');
  });

  it('adds an exit at the middle of the scene unless a spot is given', async () => {
    const scene = makeScene({ width: 3000, height: 1000 });
    const wrapper = mountWithOthers(scene);
    await wrapper.get(`#exit-label-${scene.id}`).setValue('  Gate ');
    await wrapper.get('.exits form').trigger('submit');
    expect(added(wrapper)).toEqual([
      [{ label: 'Gate', targetSceneId: keep.id, x: 1500, y: 500 }],
    ]);
  });

  it('adds one at the spot typed, to the scene chosen, and clears the form', async () => {
    const scene = makeScene();
    const cellar = { id: crypto.randomUUID(), name: 'Cellar' };
    const wrapper = mountWithOthers(scene, [keep, cellar]);
    await wrapper.get(`#exit-label-${scene.id}`).setValue('Trapdoor');
    await wrapper.get(`#exit-target-${scene.id}`).setValue(cellar.id);
    await wrapper.get(`#exit-x-${scene.id}`).setValue('120');
    await wrapper.get(`#exit-y-${scene.id}`).setValue('340');
    await wrapper.get('.exits form').trigger('submit');
    expect(added(wrapper)).toEqual([
      [{ label: 'Trapdoor', targetSceneId: cellar.id, x: 120, y: 340 }],
    ]);
    expect(
      (wrapper.get(`#exit-label-${scene.id}`).element as HTMLInputElement).value,
    ).toBe('');
  });

  it('adds nothing for a blank label', async () => {
    const scene = makeScene();
    const wrapper = mountWithOthers(scene);
    await wrapper.get(`#exit-label-${scene.id}`).setValue('   ');
    await wrapper.get('.exits form').trigger('submit');
    expect(added(wrapper)).toBeUndefined();
  });

  it('says to make another scene when there is none to lead to', () => {
    const wrapper = mountWithOthers(makeScene(), []);
    expect(wrapper.text()).toContain('Make another scene to add an exit');
    expect(wrapper.find('.exits form').exists()).toBe(false);
  });
});
