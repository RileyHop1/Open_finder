// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import CharacterCreator from './CharacterCreator.vue';
import { loadDraft } from './creatorModel.js';

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

const mountCreator = () => mount(CharacterCreator, { attachTo: document.body });

const stepButtons = (wrapper: ReturnType<typeof mountCreator>) =>
  wrapper.findAll('.rail button');

describe('CharacterCreator', () => {
  it('is a modal dialog with the step rail, the step and a live preview of the sheet', () => {
    const wrapper = mountCreator();
    expect(wrapper.attributes('role')).toBe('dialog');
    expect(wrapper.attributes('aria-modal')).toBe('true');
    expect(stepButtons(wrapper).map((b) => b.text().replace(/^\d+\s*/, ''))).toEqual([
      'Ancestry',
      'Background',
      'Class',
      'Class choices',
      'Attributes',
      'Skills',
      'Feats',
      'Equipment',
      'Review',
    ]);
    expect(wrapper.get('.step h3').text()).toBe('Ancestry');
    // The real sheet, showing the character so far.
    expect(wrapper.get('.preview h3').text()).toBe('New character');
    wrapper.unmount();
  });

  it('marks the current step with aria-current, and moves with the rail and Back/Next', async () => {
    const wrapper = mountCreator();
    const current = () =>
      stepButtons(wrapper).filter((b) => b.attributes('aria-current') === 'step');
    expect(current()).toHaveLength(1);
    expect(current()[0]?.text()).toContain('Ancestry');

    const [back, next] = wrapper.findAll('.creator-footer button');
    expect(back?.attributes('disabled')).toBeDefined();
    await next?.trigger('click');
    expect(wrapper.get('.step h3').text()).toBe('Background');
    expect(wrapper.get('.progress').text()).toBe('Step 2 of 9');
    await back?.trigger('click');
    expect(wrapper.get('.step h3').text()).toBe('Ancestry');

    await stepButtons(wrapper)[8]?.trigger('click');
    expect(wrapper.get('.step h3').text()).toBe('Review');
    expect(next?.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });

  it('puts the typed name on the preview and saves the draft as it changes', async () => {
    const wrapper = mountCreator();
    await wrapper.get('.name input').setValue('Valeria');
    await wrapper.findAll('.creator-footer button')[1]?.trigger('click');
    expect(wrapper.get('.preview h3').text()).toBe('Valeria');
    expect(loadDraft()).toMatchObject({ name: 'Valeria', step: 'background' });
    wrapper.unmount();
  });

  it('reopens on the saved draft, and Start over forgets it', async () => {
    const first = mountCreator();
    await first.get('.name input').setValue('Valeria');
    await stepButtons(first)[2]?.trigger('click');
    first.unmount();

    const again = mountCreator();
    expect((again.get('.name input').element as HTMLInputElement).value).toBe('Valeria');
    expect(again.get('.step h3').text()).toBe('Class');

    await again.get('.discard').trigger('click');
    expect((again.get('.name input').element as HTMLInputElement).value).toBe('');
    expect(again.get('.step h3').text()).toBe('Ancestry');
    expect(loadDraft().name).toBe('');
    again.unmount();
  });

  it('closes on Escape and on the Close button, keeping the draft', async () => {
    const wrapper = mountCreator();
    await wrapper.get('.name input').setValue('Valeria');
    await wrapper.trigger('keydown', { key: 'Escape' });
    await wrapper.get('.close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    expect(loadDraft().name).toBe('Valeria');
    wrapper.unmount();
  });

  it('takes focus when it opens and gives it back to what opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const wrapper = mountCreator();
    expect(document.activeElement).toBe(wrapper.get('.creator').element);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('keeps Tab inside: from the last control it wraps to the first, and Shift+Tab goes back', async () => {
    const wrapper = mountCreator();
    const controls = [
      ...wrapper
        .get('.creator')
        .element.querySelectorAll<HTMLElement>('button:not([disabled]), input'),
    ];
    const first = controls[0];
    const last = controls[controls.length - 1];
    last?.focus();
    await wrapper.trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first?.focus();
    await wrapper.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    wrapper.unmount();
  });
});
