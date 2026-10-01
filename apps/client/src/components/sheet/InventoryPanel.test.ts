// @vitest-environment jsdom
import type { Actor } from '@hearthtable/core';
import type { CharacterData } from '@hearthtable/pf2e';
import { newCharacterData } from '@hearthtable/pf2e';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import InventoryPanel from './InventoryPanel.vue';

vi.mock('../../api/compendium.js');

const NOW = '2026-09-30T00:00:00.000Z';
const provenance = {
  publication: 'Pathfinder Player Core',
  license: 'ORC' as const,
  remaster: true as const,
};

function entry(kind: 'gear' | 'weapon', name: string, inert = false) {
  const base = {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
    packId: 'equipment',
    slug: name.toLowerCase().replace(/ /g, '-'),
    name,
    provenance,
    traits: [],
    ruleElements: inert
      ? [{ kind: 'inert' as const, upstreamKind: 'Invented', reason: 'unsupported' }]
      : [],
    description: '',
  };
  return kind === 'gear'
    ? { ...base, kind }
    : {
        ...base,
        kind,
        category: 'martial' as const,
        group: 'sword',
        damage: { diceNumber: 1, dieFaces: 8, damageType: 'slashing' },
        hands: 1,
      };
}

function actorWith(items: CharacterData['items']): Actor {
  return {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'actor',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    kind: 'character',
    name: 'Hero',
    system: { ...newCharacterData(), items },
  };
}

type Item = CharacterData['items'][number];

const item = (
  kind: 'gear' | 'weapon',
  name: string,
  extra: Partial<Pick<Item, 'equipped' | 'quantity'>> = {},
  inert = false,
): Item => ({
  id: crypto.randomUUID(),
  // The fixture builder is looser than the schema's union; the schema parse in the component is what is under test.
  entry: entry(kind, name, inert) as Item['entry'],
  equipped: false,
  quantity: 1,
  ...extra,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(true);
  vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([]);
});

describe('items list', () => {
  it('says so when carrying nothing', () => {
    const wrapper = mount(InventoryPanel, { props: { actor: actorWith([]) } });
    expect(wrapper.text()).toContain('Carrying nothing');
  });

  it('shows each item with its kind, and equipped state and quantity in words when read-only', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([
          item('weapon', 'Invented Sword', { equipped: true }),
          item('gear', 'Invented Rope', { quantity: 3 }),
        ]),
      },
    });
    const [sword, rope] = wrapper.findAll('.item');
    expect(sword?.text()).toContain('Invented Sword');
    expect(sword?.text()).toContain('Weapon');
    expect(sword?.text()).toContain('Equipped');
    expect(rope?.text()).toContain('×3');
    expect(rope?.text()).toContain('Not equipped');
    expect(wrapper.find('button, input').exists()).toBe(false);
  });

  it('flags an item whose automation was not applied, with how many effects to apply by hand', () => {
    const wrapper = mount(InventoryPanel, {
      props: { actor: actorWith([item('gear', 'Odd Trinket', {}, true)]) },
    });
    const flag = wrapper.find('.inert-flag');
    expect(flag.text()).toContain('Automation not applied');
    expect(flag.text()).toContain('1 effect to apply by hand');
  });
});

describe('editing', () => {
  const editable = (items: CharacterData['items']) =>
    mount(InventoryPanel, { props: { actor: actorWith(items), editable: true } });

  it('emits equip, quantity, and remove for the right item', async () => {
    const sword = item('weapon', 'Invented Sword');
    const rope = item('gear', 'Invented Rope');
    const wrapper = editable([sword, rope]);

    await wrapper.findAll('.equip input')[0]?.setValue(true);
    expect(wrapper.emitted('equip')).toEqual([[sword.id, true]]);

    const quantity = wrapper.find('input[type="number"]');
    await quantity.setValue('4');
    expect(wrapper.emitted('quantity')).toEqual([[sword.id, 4]]);

    await wrapper.findAll('.item button')[1]?.trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[rope.id]]);
  });

  it('gives each control a name that says which item it acts on', () => {
    const wrapper = editable([item('gear', 'Invented Rope')]);
    expect(wrapper.find('.item button').attributes('aria-label')).toBe(
      'Remove Invented Rope',
    );

    expect(wrapper.find('label[for]').text()).toContain('Quantity of Invented Rope');
  });
});

describe('compendium picker', () => {
  const open = async (wrapper: ReturnType<typeof mount>) => {
    const details = wrapper.find('details.picker');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();
  };

  it('is offered only to someone who may edit', () => {
    const readOnly = mount(InventoryPanel, { props: { actor: actorWith([]) } });
    expect(readOnly.find('details.picker').exists()).toBe(false);
  });

  it('says nothing has been imported, and does not search, when the compendium is empty', async () => {
    vi.mocked(compendiumApi.isCompendiumAvailable).mockResolvedValue(false);
    const wrapper = mount(InventoryPanel, {
      props: { actor: actorWith([]), editable: true },
    });
    await open(wrapper);
    expect(wrapper.find('.picker').text()).toContain('No content has been imported');
    expect(wrapper.find('form.search').exists()).toBe(false);
    expect(compendiumApi.searchCompendium).not.toHaveBeenCalled();
  });

  it('lists results on opening, searches by name and kind, and adds the chosen entry', async () => {
    vi.mocked(compendiumApi.searchCompendium).mockResolvedValue([
      {
        packId: 'equipment',
        slug: 'invented-sword',
        name: 'Invented Sword',
        kind: 'weapon',
        traits: [],
      },
    ]);
    const wrapper = mount(InventoryPanel, {
      props: { actor: actorWith([]), editable: true },
    });
    await open(wrapper);
    expect(compendiumApi.searchCompendium).toHaveBeenLastCalledWith({ q: '', kind: '' });
    expect(wrapper.find('.results').text()).toContain('Invented Sword');

    await wrapper.find('#compendium-q').setValue('  sword ');
    await wrapper.find('#compendium-kind').setValue('weapon');
    await flushPromises();
    expect(compendiumApi.searchCompendium).toHaveBeenLastCalledWith({
      q: 'sword',
      kind: 'weapon',
    });

    await wrapper.find('.results button').trigger('click');
    expect(wrapper.emitted('add')).toEqual([['equipment', 'invented-sword']]);
  });

  it('says when nothing matches, and shows a failure instead of hiding it', async () => {
    const wrapper = mount(InventoryPanel, {
      props: { actor: actorWith([]), editable: true },
    });
    await open(wrapper);
    expect(wrapper.find('.picker').text()).toContain('Nothing matches');

    vi.mocked(compendiumApi.searchCompendium).mockRejectedValue(new Error('offline'));
    await wrapper.find('form.search').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe('offline');
  });
});
