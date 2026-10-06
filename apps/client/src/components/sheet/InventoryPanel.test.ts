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

function entry(
  kind: 'gear' | 'weapon',
  name: string,
  inert = false,
  economy: { priceInCopper?: number; bulk?: number } = {},
) {
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
    ...economy,
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
  economy: { priceInCopper?: number; bulk?: number } = {},
): Item => ({
  id: crypto.randomUUID(),
  // The fixture builder is looser than the schema's union; the schema parse in the component is what is under test.
  entry: entry(kind, name, inert, economy) as Item['entry'],
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

describe('price, Bulk, and encumbrance', () => {
  it('shows price and Bulk on a weapon, armor, or gear item, Bulk 0.1 as "L"', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([
          item('weapon', 'Invented Sword', {}, false, { priceInCopper: 150, bulk: 1 }),
          item('gear', 'Invented Rope', {}, false, { priceInCopper: 5, bulk: 0.1 }),
        ]),
      },
    });
    const [sword, rope] = wrapper.findAll('.item');
    expect(sword?.text()).toContain('1 gp, 5 sp');
    expect(sword?.text()).toContain('1 Bulk');
    expect(rope?.text()).toContain('5 cp');
    expect(rope?.text()).toContain('L Bulk');
  });

  it('says nothing about price or Bulk for a kind that never has them, like a feat', () => {
    const feat = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
      packId: 'feats',
      slug: 'invented-feat',
      name: 'Invented Feat',
      provenance,
      traits: [],
      ruleElements: [],
      description: '',
      kind: 'feat' as const,
      level: 1,
      category: 'general' as const,
      prerequisites: [],
    };
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([
          { id: crypto.randomUUID(), entry: feat, equipped: false, quantity: 1 },
        ]),
      },
    });
    const row = wrapper.find('.item');
    expect(row.text()).toContain('Invented Feat');
    expect(row.find('.item-price').exists()).toBe(false);
    expect(row.find('.item-bulk').exists()).toBe(false);
  });

  it('totals carried value and Bulk across every item', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([
          item('weapon', 'Sword', {}, false, { priceInCopper: 200, bulk: 1 }),
          item('gear', 'Potion', { quantity: 2 }, false, {
            priceInCopper: 50,
            bulk: 0.1,
          }),
        ]),
      },
    });
    const totals = wrapper.find('.totals');
    expect(totals.text()).toContain('1.2 Bulk carried');
    expect(totals.text()).toContain('3 gp total value');
  });

  it('flags encumbered once carried Bulk exceeds 5 + Strength, in words and with a marker', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([item('gear', 'Boulder', {}, false, { bulk: 6 })]),
      },
    });
    const flag = wrapper.find('.encumbrance-flag');
    expect(flag.text()).toContain('Encumbered');
    expect(flag.text()).toContain('6 of 5 Bulk');
    expect(flag.classes()).not.toContain('encumbrance-max');
  });

  it('flags over carrying capacity once Bulk exceeds 10 + Strength', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([item('gear', 'Boulder', {}, false, { bulk: 11 })]),
      },
    });
    const flag = wrapper.find('.encumbrance-flag');
    expect(flag.text()).toContain('Over carrying capacity');
    expect(flag.text()).toContain('11 of 10 Bulk');
    expect(flag.classes()).toContain('encumbrance-max');
  });

  it('shows no encumbrance flag while under the threshold', () => {
    const wrapper = mount(InventoryPanel, {
      props: {
        actor: actorWith([item('gear', 'Rope', {}, false, { bulk: 1 })]),
      },
    });
    expect(wrapper.find('.encumbrance-flag').exists()).toBe(false);
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
    expect(wrapper.find('.picker').text()).toContain('No game content has been imported');
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

describe('compendium picker after an import', () => {
  it('looks again when reopened, if it last found nothing', async () => {
    let imported = false;
    vi.mocked(compendiumApi.isCompendiumAvailable).mockImplementation(() =>
      Promise.resolve(imported),
    );
    const wrapper = mount(InventoryPanel, {
      props: { actor: actorWith([]), editable: true },
    });
    const details = wrapper.find('details.picker');
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger('toggle');
    await flushPromises();
    expect(wrapper.find('.picker').text()).toContain('No game content');

    // The GM imports; the player opens the picker again.
    imported = true;
    await details.trigger('toggle');
    await flushPromises();
    expect(wrapper.find('form.search').exists()).toBe(true);
  });
});
