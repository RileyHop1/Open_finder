// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { TurnBarItem } from './turnBarModel.js';
import TurnBar from './TurnBar.vue';

function item(fields: Partial<TurnBarItem> = {}): TurnBarItem {
  return {
    id: crypto.randomUUID(),
    tokenId: crypto.randomUUID(),
    label: 'Ada',
    initials: 'A',
    portraitUrl: undefined,
    initiative: 10,
    active: false,
    defeated: false,
    ...fields,
  };
}

describe('TurnBar', () => {
  it('lists combatants in order, with the round and who is acting', () => {
    const [first, second] = [
      item({ active: true }),
      item({ label: 'Goblin', initiative: 5 }),
    ];
    const wrapper = mount(TurnBar, {
      props: { items: [first, second], round: 3, unseenActing: false },
    });
    expect(wrapper.text()).toContain('Round 3');
    const buttons = wrapper.findAll('li');
    expect(buttons[0]?.text()).toContain('Taking their turn');
    expect(buttons[1]?.text()).toContain('Goblin');
    expect(wrapper.text()).not.toContain('Someone is acting');
  });

  it('marks a defeated combatant and says so unseen creature is acting', () => {
    const wrapper = mount(TurnBar, {
      props: { items: [item({ defeated: true })], round: 1, unseenActing: true },
    });
    expect(wrapper.text()).toContain('(defeated)');
    expect(wrapper.text()).toContain('Someone is acting');
  });

  it('shows "not rolled" and disables a portrait with no readable token', () => {
    const wrapper = mount(TurnBar, {
      props: {
        items: [item({ initiative: undefined, tokenId: undefined })],
        round: 1,
        unseenActing: false,
      },
    });
    expect(wrapper.text()).toContain('not rolled');
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('emits focus with the token id on click', async () => {
    const target = item();
    const wrapper = mount(TurnBar, {
      props: { items: [target], round: 1, unseenActing: false },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('focus')).toEqual([[target.tokenId]]);
  });
});
