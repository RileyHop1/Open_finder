// @vitest-environment jsdom
import type { SpellcastingEntry } from '@hearthtable/pf2e';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import type { SpellOption } from './spellEdits.js';
import SpellListEditor from './SpellListEditor.vue';

const options: SpellOption[] = [
  { itemId: 'zap', name: 'Zap', rank: 1, cantrip: true },
  { itemId: 'heal', name: 'Heal', rank: 1, cantrip: false },
  { itemId: 'blast', name: 'Blast', rank: 3, cantrip: false },
];

const base = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Cleric spellcasting',
  tradition: 'divine' as const,
  attribute: 'wis' as const,
  rank: 'trained' as const,
  cantrips: [] as string[],
};

const prepared: SpellcastingEntry = {
  ...base,
  kind: 'prepared',
  slots: { '1': 2 },
  prepared: [{ rank: 1, itemId: 'gone', expended: false }],
};

const spontaneous: SpellcastingEntry = {
  ...base,
  kind: 'spontaneous',
  slots: { '1': { max: 3, used: 0 } },
  repertoire: [],
  signature: [],
};

function mountEditor(entry: SpellcastingEntry) {
  return mount(SpellListEditor, { props: { entry, options } });
}

const changed = (wrapper: ReturnType<typeof mountEditor>) =>
  wrapper.emitted('change')?.at(-1)?.[0] as SpellcastingEntry;

describe('SpellListEditor', () => {
  it('offers a slot field per rank with slots, and one above the highest', () => {
    const wrapper = mountEditor(prepared);
    const labels = wrapper
      .findAll('fieldset')[0]
      ?.findAll('label')
      .map((l) => l.text());
    expect(labels).toEqual(['Rank 1', 'Rank 2']);
  });

  it('sets a rank’s slots by hand', async () => {
    const wrapper = mountEditor(prepared);
    await wrapper.find('input[type="number"]').setValue('4');
    expect(changed(wrapper).slots).toEqual({ '1': 4 });
  });

  it('adds a cantrip from the character’s cantrips only', async () => {
    const wrapper = mountEditor(prepared);
    const select = wrapper.find('select');
    expect(select.findAll('option').map((o) => o.text())).toEqual(['Choose…', 'Zap']);
    await select.setValue('zap');
    await wrapper.findAll('form')[0]?.trigger('submit');
    expect(changed(wrapper).cantrips).toEqual(['zap']);
  });

  it('prepares a spell in a slot of its own rank by default', async () => {
    const wrapper = mountEditor(prepared);
    const [, spellSelect] = wrapper.findAll('select');
    await spellSelect?.setValue('heal');
    await wrapper.findAll('form')[1]?.trigger('submit');
    const next = changed(wrapper);
    expect(next.kind === 'prepared' ? next.prepared.at(-1) : undefined).toEqual({
      rank: 1,
      itemId: 'heal',
      expended: false,
    });
  });

  it('warns in words, and still prepares, a spell above the slot’s rank', async () => {
    const wrapper = mountEditor(prepared);
    const [, spellSelect, rankSelect] = wrapper.findAll('select');
    await spellSelect?.setValue('blast');
    await rankSelect?.setValue('1');
    expect(wrapper.text()).toContain('higher than the slot');
    await wrapper.findAll('form')[1]?.trigger('submit');
    const next = changed(wrapper);
    expect(next.kind === 'prepared' ? next.prepared.at(-1) : undefined).toMatchObject({
      rank: 1,
      itemId: 'blast',
    });
  });

  it('lists a spell the character no longer has as missing, and removes it', async () => {
    const wrapper = mountEditor(prepared);
    expect(wrapper.text()).toContain('Rank 1: (missing spell)');
    await wrapper
      .find('button[aria-label="Unprepare (missing spell) from rank 1"]')
      .trigger('click');
    const next = changed(wrapper);
    expect(next.kind === 'prepared' ? next.prepared : undefined).toEqual([]);
  });

  it('learns and forgets for a spontaneous caster', async () => {
    const wrapper = mountEditor(spontaneous);
    expect(wrapper.text()).toContain('Known spells');
    const [, learn] = wrapper.findAll('select');
    await learn?.setValue('blast');
    await wrapper.findAll('form')[1]?.trigger('submit');
    const next = changed(wrapper);
    expect(next.kind === 'spontaneous' ? next.repertoire : undefined).toEqual(['blast']);

    await wrapper.setProps({ entry: next });
    await wrapper.find('button[aria-label="Forget Blast"]').trigger('click');
    const forgot = changed(wrapper);
    expect(forgot.kind === 'spontaneous' ? forgot.repertoire : undefined).toEqual([]);
  });
});
