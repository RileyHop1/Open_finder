// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../api/compendium.js';
import CharacterRoster from './CharacterRoster.vue';

vi.mock('../api/compendium.js');

const NOW = '2026-10-01T00:00:00.000Z';
const actor = (name: string, kind: Actor['kind'] = 'character'): Actor => ({
  id: name,
  worldId: crypto.randomUUID(),
  type: 'actor',
  schemaVersion: 1,
  permissions: { default: 'observer', seats: {} },
  createdAt: NOW,
  updatedAt: NOW,
  kind,
  name,
  system: {},
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([]);
});

function mountRoster(
  fields: Partial<InstanceType<typeof CharacterRoster>['$props']> = {},
) {
  return mount(CharacterRoster, {
    props: {
      actors: [actor('Ada'), actor('Goblin', 'npc')],
      selectedId: 'Ada',
      isGm: false,
      hasScene: true,
      contentVersion: 0,
      create: vi.fn().mockResolvedValue(true),
      ...fields,
    },
  });
}

describe('CharacterRoster', () => {
  it('lists every actor with its kind and marks the open one pressed', () => {
    const wrapper = mountRoster();
    const buttons = wrapper.findAll('.roster li > button');
    expect(buttons.map((b) => b.text())).toEqual(['Ada (character)', 'Goblin (npc)']);
    expect(buttons[0]?.attributes('aria-pressed')).toBe('true');
    expect(buttons[1]?.attributes('aria-pressed')).toBe('false');
  });

  it('reports which character was chosen', async () => {
    const wrapper = mountRoster();
    await wrapper.findAll('.roster li > button')[1]?.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['Goblin']]);
  });

  it('gives a player neither Place on map nor the drag handle nor the monster picker', () => {
    const wrapper = mountRoster();
    expect(wrapper.find('.drag-handle').exists()).toBe(false);
    expect(wrapper.find('button[aria-label^="Place "]').exists()).toBe(false);
  });

  it('gives the GM Place on map and a drag handle, off until a scene is shown', async () => {
    const wrapper = mountRoster({ isGm: true, hasScene: false });
    const place = wrapper.get('button[aria-label="Place Ada on the map"]');
    expect(place.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Make a scene and move the party to it');
    await wrapper.setProps({ hasScene: true });
    await place.trigger('click');
    expect(wrapper.emitted('place')).toEqual([['Ada']]);
    await wrapper.get('.drag-handle').trigger('dragend');
    expect(wrapper.emitted('dragEnd')).toHaveLength(1);
    await flushPromises();
  });

  it('says so when there are no characters', () => {
    expect(mountRoster({ actors: [] }).text()).toContain('No characters yet');
  });

  it('creates a character with a trimmed name and clears the field once accepted', async () => {
    const create = vi.fn().mockResolvedValue(true);
    const wrapper = mountRoster({ create });
    await wrapper.get('#new-character-name').setValue('  Valeria ');
    await wrapper.get('form.new-character').trigger('submit');
    await flushPromises();
    expect(create).toHaveBeenCalledWith('Valeria');
    expect((wrapper.get('#new-character-name').element as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('keeps the typed name when the server refused it, and ignores a blank one', async () => {
    const create = vi.fn().mockResolvedValue(false);
    const wrapper = mountRoster({ create });
    await wrapper.get('#new-character-name').setValue('   ');
    await wrapper.get('form.new-character').trigger('submit');
    expect(create).not.toHaveBeenCalled();
    await wrapper.get('#new-character-name').setValue('Valeria');
    await wrapper.get('form.new-character').trigger('submit');
    await flushPromises();
    expect((wrapper.get('#new-character-name').element as HTMLInputElement).value).toBe(
      'Valeria',
    );
  });

  it('offers guided creation, which only asks the parent to open the creator', async () => {
    const wrapper = mountRoster();
    await wrapper.get('button.guided').trigger('click');
    expect(wrapper.emitted('guided')).toHaveLength(1);
  });
});
