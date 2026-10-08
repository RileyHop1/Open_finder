// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import SheetTabs from './SheetTabs.vue';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'skills', label: 'Skills' },
  { id: 'inventory', label: 'Inventory' },
];

function mountTabs(modelValue = 'overview') {
  return mount(SheetTabs, {
    attachTo: document.body,
    props: { tabs: TABS, modelValue, idPrefix: 'sheet-1' },
  });
}

describe('SheetTabs', () => {
  it('marks the selected tab and keeps only it in the Tab order', () => {
    const tabs = mountTabs('skills').findAll('[role="tab"]');
    expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual([
      'false',
      'true',
      'false',
    ]);
    expect(tabs.map((t) => t.attributes('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(tabs[1]?.attributes('aria-controls')).toBe('sheet-1-panel-skills');
  });

  it('selects a clicked tab', async () => {
    const wrapper = mountTabs();
    await wrapper.findAll('[role="tab"]')[2]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')).toEqual([['inventory']]);
  });

  it('moves with the arrow keys, wrapping at both ends, and jumps with Home and End', async () => {
    const wrapper = mountTabs('inventory');
    const tabs = wrapper.findAll('[role="tab"]');
    await tabs[2]?.trigger('keydown', { key: 'ArrowRight' });
    await tabs[2]?.trigger('keydown', { key: 'Home' });
    await tabs[0]?.trigger('keydown', { key: 'ArrowLeft' });
    await tabs[0]?.trigger('keydown', { key: 'End' });
    expect(wrapper.emitted('update:modelValue')).toEqual([
      ['overview'],
      ['overview'],
      ['inventory'],
      ['inventory'],
    ]);
  });

  it('ignores other keys', async () => {
    const wrapper = mountTabs();
    await wrapper.findAll('[role="tab"]')[0]?.trigger('keydown', { key: 'a' });
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
