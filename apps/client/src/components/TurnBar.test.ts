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

  it('hides the initiative override until the GM clicks that portrait, and never shows it to a player', async () => {
    const target = item({ initiative: 9 });
    const gm = mount(TurnBar, {
      props: { showControls: true, unseenActing: false, items: [target], round: 1 },
      attachTo: document.body,
    });
    expect(gm.find('form.override').exists()).toBe(false);

    await gm.get('li button').trigger('click');
    expect(gm.emitted('focus')).toEqual([[target.tokenId]]);
    expect(gm.get('li button').attributes('aria-expanded')).toBe('true');
    const input = gm.get<HTMLInputElement>('form.override input');
    expect(input.element.value).toBe('9');
    expect(document.activeElement).toBe(input.element);

    await input.setValue('14');
    await gm.get('form.override').trigger('submit');
    expect(gm.emitted('setInitiative')).toEqual([[target.id, 14]]);
    expect(gm.find('form.override').exists()).toBe(false);
    expect(document.activeElement).toBe(gm.get('li button').element);
    gm.unmount();

    const player = mount(TurnBar, {
      props: { showControls: false, unseenActing: false, items: [target], round: 1 },
    });
    await player.get('li button').trigger('click');
    expect(player.find('form.override').exists()).toBe(false);
    expect(player.get('li button').attributes('aria-expanded')).toBeUndefined();
  });

  it('closes the editor on a second click or Escape, and opens only one at a time', async () => {
    const [a, b] = [item({ label: 'Ada' }), item({ label: 'Bo' })];
    const wrapper = mount(TurnBar, {
      props: { showControls: true, unseenActing: false, items: [a, b], round: 1 },
      attachTo: document.body,
    });
    const [first, second] = wrapper.findAll('li');
    await first?.get('button').trigger('click');
    await second?.get('button').trigger('click');
    expect(wrapper.findAll('form.override')).toHaveLength(1);
    expect(second?.find('form.override').exists()).toBe(true);

    await second?.get('button').trigger('click');
    expect(wrapper.find('form.override').exists()).toBe(false);

    await first?.get('button').trigger('click');
    await first?.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('form.override').exists()).toBe(false);
    wrapper.unmount();
  });

  it('lets the GM edit a combatant with no readable token, without focusing anything', async () => {
    const wrapper = mount(TurnBar, {
      props: {
        showControls: true,
        unseenActing: false,
        items: [item({ tokenId: undefined })],
        round: 1,
      },
    });
    expect(wrapper.get('li button').attributes('disabled')).toBeUndefined();
    await wrapper.get('li button').trigger('click');
    expect(wrapper.emitted('focus')).toBeUndefined();
    expect(wrapper.find('form.override').exists()).toBe(true);
  });

  it('does not emit an override for an empty or non-numeric field', async () => {
    const target = item({ initiative: undefined });
    const wrapper = mount(TurnBar, {
      props: {
        showControls: true,
        unseenActing: false,
        items: [target],
        round: 1,
      },
    });
    await wrapper.get('li button').trigger('click');
    await wrapper.get('form.override').trigger('submit');
    expect(wrapper.emitted('setInitiative')).toBeUndefined();
  });
});
