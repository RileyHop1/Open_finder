// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import DeityFields from './DeityFields.vue';

// An invented deity (ADR 0013).
const lantern = { name: 'The Lantern', font: 'heal' as const, skill: 'medicine' };

describe('DeityFields', () => {
  it('shows the facts entered', () => {
    const wrapper = mount(DeityFields, { props: { deity: lantern } });
    expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe(
      'The Lantern',
    );
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('medicine');
    const heal = wrapper
      .findAll('label.option')
      .find((l) => l.text() === 'Heal')
      ?.get('input').element as HTMLInputElement;
    expect(heal.checked).toBe(true);
  });

  it('emits the whole set of facts on each change, and drops one cleared', async () => {
    const wrapper = mount(DeityFields, { props: { deity: lantern } });
    await wrapper.get('select').setValue('religion');
    await wrapper
      .findAll('label.option')
      .find((l) => l.text() === 'Unholy')
      ?.get('input')
      .setValue(true);
    await wrapper.findAll('input[type="text"]')[0]?.setValue('  ');
    expect(wrapper.emitted('change')).toEqual([
      [{ ...lantern, skill: 'religion' }],
      [{ ...lantern, sanctification: 'unholy' }],
      [{ font: 'heal', skill: 'medicine' }],
    ]);
  });

  it('starts empty for a new character', async () => {
    const wrapper = mount(DeityFields, { props: { deity: undefined } });
    await wrapper.findAll('input[type="text"]')[1]?.setValue('Lantern staff');
    expect(wrapper.emitted('change')).toEqual([[{ weapon: 'Lantern staff' }]]);
  });
});
