// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as compendiumApi from '../../api/compendium.js';
import EquipmentStep from './EquipmentStep.vue';

vi.mock('../../api/compendium.js');

// Everything below is invented (ADR 0013).
const item = (slug: string, kind: string, priceInCopper?: number) => ({
  packId: 'equipment',
  slug,
  name: slug,
  kind,
  traits: [],
  ...(priceInCopper === undefined ? {} : { priceInCopper }),
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(compendiumApi.searchCompendium).mockImplementation((params) =>
    Promise.resolve(
      params?.kind === 'weapon'
        ? [item('invented-sword', 'weapon', 100), item('odd-blade', 'weapon')]
        : [item('invented-rope', 'gear', 10)],
    ),
  );
});

const mountStep = async (lines: unknown[] = []) => {
  const wrapper = mount(EquipmentStep, { props: { lines } as never });
  await flushPromises();
  return wrapper;
};

const line = (slug: string, priceInCopper: number | undefined, quantity = 1) => ({
  packId: 'equipment',
  slug,
  name: slug,
  quantity,
  ...(priceInCopper === undefined ? {} : { priceInCopper }),
});

describe('EquipmentStep', () => {
  it('lists weapons first with their prices, and emits an add', async () => {
    const wrapper = await mountStep();
    expect(wrapper.findAll('.results .name').map((n) => n.text())).toEqual([
      'invented-sword',
      'odd-blade',
    ]);
    expect(wrapper.text()).toContain('1 gp');
    expect(wrapper.text()).toContain('price unknown');

    await wrapper.get('button[aria-label="Add invented-sword"]').trigger('click');
    expect(wrapper.emitted('add')).toEqual([
      [
        {
          packId: 'equipment',
          slug: 'invented-sword',
          name: 'invented-sword',
          priceInCopper: 100,
        },
      ],
    ]);
  });

  it('switches kind and searches by name', async () => {
    const wrapper = await mountStep();
    await wrapper.findAll('.kinds button')[2]?.trigger('click');
    await flushPromises();
    expect(
      vi.mocked(compendiumApi.searchCompendium).mock.calls.at(-1)?.[0],
    ).toMatchObject({
      kind: 'gear',
    });
    expect(wrapper.findAll('.results .name').map((n) => n.text())).toEqual([
      'invented-rope',
    ]);

    await wrapper.get('input[type="search"]').setValue('rop');
    await flushPromises();
    expect(
      vi.mocked(compendiumApi.searchCompendium).mock.calls.at(-1)?.[0],
    ).toMatchObject({
      kind: 'gear',
      q: 'rop',
    });
  });

  it('shows the running total against the purse, and what is left', async () => {
    const wrapper = await mountStep([
      line('invented-sword', 100),
      line('invented-rope', 10, 2),
    ]);
    expect(wrapper.get('.budget').text()).toContain('Spent 1 gp 2 sp of 15 gp');
    expect(wrapper.get('.budget').text()).toContain('You keep 13 gp 8 sp');
    expect(wrapper.find('.warning').exists()).toBe(false);
  });

  it('warns when over the purse and when a price is unknown, and blocks nothing', async () => {
    const wrapper = await mountStep([
      line('invented-sword', 100, 16),
      line('odd-blade', undefined),
    ]);
    const warnings = wrapper.findAll('.warning').map((w) => w.text());
    expect(warnings[0]).toContain('1 gp over the starting purse');
    expect(warnings[1]).toContain('No price is known for odd-blade');
    expect(
      wrapper.get('button[aria-label="Add invented-sword"]').attributes('disabled'),
    ).toBeUndefined();
  });

  it('emits quantity changes and removal from the shopping list', async () => {
    const wrapper = await mountStep([line('invented-rope', 10, 2)]);
    await wrapper.get('button[aria-label="One more invented-rope"]').trigger('click');
    await wrapper.get('button[aria-label="One fewer invented-rope"]').trigger('click');
    await wrapper.get('button[aria-label="Remove invented-rope"]').trigger('click');
    expect(wrapper.emitted('quantity')).toEqual([
      ['equipment', 'invented-rope', 3],
      ['equipment', 'invented-rope', 1],
      ['equipment', 'invented-rope', 0],
    ]);
  });
});
