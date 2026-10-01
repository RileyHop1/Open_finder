// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PortraitPicker from './PortraitPicker.vue';

const base = { name: 'Valeria', worldId: 'w1' };

async function pick(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.find('#portrait-file');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
}

const file = (type: string) => new File([new Uint8Array([1, 2, 3])], 'p', { type });

describe('showing', () => {
  it('shows the image, named for the character, when there is a portrait', () => {
    const wrapper = mount(PortraitPicker, {
      props: { ...base, portrait: `${'a'.repeat(64)}.png` },
    });
    const img = wrapper.find('img');
    expect(img.attributes('src')).toBe(`/api/worlds/w1/assets/${'a'.repeat(64)}.png`);
    expect(img.attributes('alt')).toBe('Portrait of Valeria');
  });

  it('shows an initial placeholder, said aloud as having no portrait, when there is none', () => {
    const wrapper = mount(PortraitPicker, { props: base });
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.placeholder').text()).toBe('V');
    expect(wrapper.find('.placeholder').attributes('aria-label')).toBe(
      'Valeria has no portrait',
    );
  });

  it('has no controls for someone who may not edit', () => {
    const wrapper = mount(PortraitPicker, { props: base });
    expect(wrapper.find('input, button').exists()).toBe(false);
  });
});

describe('uploading', () => {
  const editable = { ...base, editable: true };

  it('has a labelled file input that asks only for the accepted image types', () => {
    const wrapper = mount(PortraitPicker, { props: editable });
    expect(wrapper.find('label[for="portrait-file"]').text()).toBe('Portrait image');
    expect(wrapper.find('#portrait-file').attributes('accept')).toBe(
      'image/png,image/jpeg,image/webp,image/gif',
    );
  });

  it('emits the chosen image', async () => {
    const wrapper = mount(PortraitPicker, { props: editable });
    const image = file('image/png');
    await pick(wrapper, image);
    expect(wrapper.emitted('upload')).toEqual([[image]]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('refuses a file that is not an accepted image, in words, and sends nothing', async () => {
    const wrapper = mount(PortraitPicker, { props: editable });
    await pick(wrapper, file('image/svg+xml'));
    expect(wrapper.emitted('upload')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'Choose a PNG, JPEG, WebP, or GIF image.',
    );
  });

  it('shows an upload in progress and disables the picker while it runs', () => {
    const wrapper = mount(PortraitPicker, { props: { ...editable, busy: true } });
    expect(wrapper.find('[role="status"]').text()).toBe('Uploading…');
    expect(wrapper.find('#portrait-file').attributes('disabled')).toBeDefined();
  });

  it('shows the reason an upload failed', () => {
    const wrapper = mount(PortraitPicker, {
      props: { ...editable, error: 'the file is not a valid image of that type' },
    });
    expect(wrapper.find('[role="alert"]').text()).toBe(
      'the file is not a valid image of that type',
    );
  });

  it('offers Remove only when there is a portrait, and emits clear', async () => {
    expect(mount(PortraitPicker, { props: editable }).find('button').exists()).toBe(
      false,
    );
    const wrapper = mount(PortraitPicker, {
      props: { ...editable, portrait: `${'a'.repeat(64)}.png` },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('clear')).toHaveLength(1);
  });
});
