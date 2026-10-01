// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import PartyManager from './PartyManager.vue';

const NOW = '2026-09-30T00:00:00.000Z';

function actor(name: string, kind: Actor['kind'] = 'character'): Actor {
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind,
    name,
    system: {},
  };
}

const [anna, bram, cora] = [actor('Anna'), actor('Bram'), actor('Cora')];

const mountManager = (members: Actor[], actors: Actor[] = members) =>
  mount(PartyManager, { props: { members, actors } });

describe('the member list', () => {
  it('says so when the party is empty', () => {
    expect(mountManager([], [anna]).text()).toContain('Nobody is in the party yet');
  });

  it('lists members in order', () => {
    const wrapper = mountManager([anna, bram]);
    expect(wrapper.findAll('.members .name').map((n) => n.text())).toEqual([
      'Anna',
      'Bram',
    ]);
  });
});

describe('reordering by button', () => {
  it('moves a member up and emits the whole new order', async () => {
    const wrapper = mountManager([anna, bram, cora]);
    await wrapper.find('button[aria-label="Move Cora up"]').trigger('click');
    expect(wrapper.emitted('reorder')).toEqual([[[anna.id, cora.id, bram.id]]]);
  });

  it('moves a member down', async () => {
    const wrapper = mountManager([anna, bram, cora]);
    await wrapper.find('button[aria-label="Move Anna down"]').trigger('click');
    expect(wrapper.emitted('reorder')).toEqual([[[bram.id, anna.id, cora.id]]]);
  });

  it('cannot move the first member up or the last down', () => {
    const wrapper = mountManager([anna, bram]);
    expect(
      wrapper.find('button[aria-label="Move Anna up"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.find('button[aria-label="Move Bram down"]').attributes('disabled'),
    ).toBeDefined();
    expect(
      wrapper.find('button[aria-label="Move Anna down"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('announces the move in a status line, so it is heard as well as seen', async () => {
    const wrapper = mountManager([anna, bram, cora]);
    await wrapper.find('button[aria-label="Move Cora up"]').trigger('click');
    expect(wrapper.find('[role="status"]').text()).toBe('Cora moved to position 2 of 3.');
  });
});

describe('removing', () => {
  it('removes the named member and announces it', async () => {
    const wrapper = mountManager([anna, bram]);
    await wrapper
      .find('button[aria-label="Remove Bram from the party"]')
      .trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[bram.id]]);
    expect(wrapper.find('[role="status"]').text()).toBe('Bram removed from the party.');
  });
});

describe('adding', () => {
  it('offers only characters and NPCs not already in the party', () => {
    const hazard = actor('Spike Trap', 'hazard');
    const npc = actor('Innkeeper', 'npc');
    const wrapper = mountManager([anna], [anna, bram, npc, hazard]);
    const options = wrapper.findAll('#party-add option').map((o) => o.text());
    expect(options.slice(1)).toEqual(['Bram (character)', 'Innkeeper (npc)']);
  });

  it('adds the chosen actor and clears the choice', async () => {
    const wrapper = mountManager([anna], [anna, bram]);
    expect(wrapper.find('form.add button').attributes('disabled')).toBeDefined();

    await wrapper.find('#party-add').setValue(bram.id);
    await wrapper.find('form.add').trigger('submit');

    expect(wrapper.emitted('add')).toEqual([[bram.id]]);
    expect(wrapper.find('[role="status"]').text()).toBe('Bram added to the party.');
    expect((wrapper.find('#party-add').element as HTMLSelectElement).value).toBe('');
  });

  it('says when everyone is already in, and disables the picker', () => {
    const wrapper = mountManager([anna], [anna]);
    expect(wrapper.find('#party-add').attributes('disabled')).toBeDefined();
    expect(wrapper.find('#party-add option').text()).toBe('Everyone is already in');
  });
});
