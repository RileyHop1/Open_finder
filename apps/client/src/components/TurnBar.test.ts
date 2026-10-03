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

const baseProps = { active: true, showControls: false, unseenActing: false };

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

  it('shows no list at all while there is no active combat', () => {
    const wrapper = mount(TurnBar, {
      props: { ...baseProps, active: false, items: [], round: 0 },
    });
    expect(wrapper.find('ol').exists()).toBe(false);
  });
});

describe('TurnBar -- the GM’s controls', () => {
  it('offers only Start combat when none is running, for the GM', () => {
    const wrapper = mount(TurnBar, {
      props: {
        active: false,
        showControls: true,
        unseenActing: false,
        items: [],
        round: 0,
      },
    });
    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels).toEqual(['Start combat']);
  });

  it('offers Previous/Next/End once a combat is active, for the GM', () => {
    const wrapper = mount(TurnBar, {
      props: {
        active: true,
        showControls: true,
        unseenActing: false,
        items: [],
        round: 1,
      },
    });
    const labels = wrapper.findAll('button').map((b) => b.text());
    expect(labels).toEqual(['Previous turn', 'Next turn', 'End combat']);
  });

  it('offers no controls at all for a player, in either state', () => {
    const noCombat = mount(TurnBar, {
      props: {
        active: false,
        showControls: false,
        unseenActing: false,
        items: [],
        round: 0,
      },
    });
    expect(noCombat.findAll('button')).toHaveLength(0);

    const running = mount(TurnBar, {
      props: {
        active: true,
        showControls: false,
        unseenActing: false,
        items: [item()],
        round: 1,
      },
    });
    // Only the one portrait button, no GM controls.
    expect(running.findAll('button')).toHaveLength(1);
  });

  it('emits start, previous, next and end', async () => {
    const start = mount(TurnBar, {
      props: {
        active: false,
        showControls: true,
        unseenActing: false,
        items: [],
        round: 0,
      },
    });
    await start.find('button').trigger('click');
    expect(start.emitted('start')).toHaveLength(1);

    const running = mount(TurnBar, {
      props: {
        active: true,
        showControls: true,
        unseenActing: false,
        items: [],
        round: 1,
      },
    });
    const [previous, next, end] = running.findAll('button');
    await previous?.trigger('click');
    await next?.trigger('click');
    await end?.trigger('click');
    expect(running.emitted('previous')).toHaveLength(1);
    expect(running.emitted('next')).toHaveLength(1);
    expect(running.emitted('end')).toHaveLength(1);
  });
});
