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

const baseProps = {
  showControls: false,
  unseenActing: false,
};

describe('TurnBar -- combatants', () => {
  it('lists combatants in order, with the round and who is acting', () => {
    const [first, second] = [
      item({ active: true }),
      item({ label: 'Goblin', initiative: 5 }),
    ];
    const wrapper = mount(TurnBar, {
      props: { ...baseProps, items: [first, second], round: 3 },
    });
    expect(wrapper.text()).toContain('Round 3');
    const buttons = wrapper.findAll('li');
    expect(buttons[0]?.text()).toContain('Taking their turn');
    expect(buttons[1]?.text()).toContain('Goblin');
    expect(wrapper.text()).not.toContain('Someone is acting');
  });

  it('marks a defeated combatant and says an unseen creature is acting', () => {
    const wrapper = mount(TurnBar, {
      props: {
        ...baseProps,
        items: [item({ defeated: true })],
        round: 1,
        unseenActing: true,
      },
    });
    expect(wrapper.text()).toContain('(defeated)');
    expect(wrapper.text()).toContain('Someone is acting');
  });

  it('shows "not rolled" and disables a portrait with no readable token', () => {
    const wrapper = mount(TurnBar, {
      props: {
        ...baseProps,
        items: [item({ initiative: undefined, tokenId: undefined })],
        round: 1,
      },
    });
    expect(wrapper.text()).toContain('not rolled');
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
  });

  it('emits focus with the token id on click', async () => {
    const target = item();
    const wrapper = mount(TurnBar, {
      props: { ...baseProps, items: [target], round: 1 },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('focus')).toEqual([[target.tokenId]]);
  });
});

describe('TurnBar -- the GM’s controls', () => {
  it('offers no controls at all for a player', () => {
    const running = mount(TurnBar, {
      props: {
        showControls: false,
        unseenActing: false,
        items: [item()],
        round: 1,
      },
    });
    // Only the one portrait button, no GM controls.
    expect(running.findAll('button')).toHaveLength(1);
  });

  it('offers no Previous/Next/End buttons here -- TurnControls.vue has those now', () => {
    const wrapper = mount(TurnBar, {
      props: {
        showControls: true,
        unseenActing: false,
        items: [],
        round: 1,
      },
    });
    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels).not.toContain('Previous turn');
    expect(labels).not.toContain('Next turn');
    expect(labels).not.toContain('End combat');
  });

  it('offers the GM a per-combatant initiative override, absent for a player', async () => {
    const target = item();
    const gm = mount(TurnBar, {
      props: {
        showControls: true,
        unseenActing: false,
        items: [target],
        round: 1,
      },
    });
    await gm.get('form.override input').setValue('14');
    await gm.get('form.override').trigger('submit');
    expect(gm.emitted('setInitiative')).toEqual([[target.id, 14]]);

    const player = mount(TurnBar, {
      props: {
        showControls: false,
        unseenActing: false,
        items: [target],
        round: 1,
      },
    });
    expect(player.find('form.override').exists()).toBe(false);
  });

  it('does not emit an override for an empty or non-numeric field', async () => {
    const target = item();
    const wrapper = mount(TurnBar, {
      props: {
        showControls: true,
        unseenActing: false,
        items: [target],
        round: 1,
      },
    });
    await wrapper.get('form.override').trigger('submit');
    expect(wrapper.emitted('setInitiative')).toBeUndefined();
  });
});
