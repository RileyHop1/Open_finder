// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ExitMenu from './ExitMenu.vue';
import type { ExitView } from './exitModel.js';

const keep = { id: 'keep', name: 'Keep' };
const cellar = { id: 'cellar', name: 'Cellar' };

const exit: ExitView = {
  id: 'e1',
  label: 'Gate',
  x: 10,
  y: 20,
  targetSceneId: 'keep',
  targetName: 'Keep',
};

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) {
    wrapper.unmount();
  }
});

function mountMenu(props: Record<string, unknown>) {
  const wrapper = mount(ExitMenu, {
    props: { mode: 'add', x: 5, y: 6, targets: [keep, cellar], ...props },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return wrapper;
}

describe('adding an exit', () => {
  it('opens on the label, a labelled group', async () => {
    const wrapper = mountMenu({});
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe(
      'Add an exit here',
    );
    expect(document.activeElement).toBe(wrapper.get('#exit-label').element);
  });

  it('offers the other scenes, and sends the label and the one chosen', async () => {
    const wrapper = mountMenu({});
    expect(wrapper.findAll('option').map((o) => o.text())).toEqual(['Keep', 'Cellar']);
    await wrapper.get('#exit-label').setValue('  Trapdoor ');
    await wrapper.get('#exit-target').setValue('cellar');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['Trapdoor', 'cellar']]);
  });

  it('starts on the first scene when none is picked', async () => {
    const wrapper = mountMenu({});
    await wrapper.get('#exit-label').setValue('Gate');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('add')).toEqual([['Gate', 'keep']]);
  });

  it('sends nothing for a blank label', async () => {
    const wrapper = mountMenu({});
    await wrapper.get('#exit-label').setValue('   ');
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('add')).toBeUndefined();
  });

  it('says to make another scene first when there is none to lead to', () => {
    const wrapper = mountMenu({ targets: [] });
    expect(wrapper.text()).toContain('Make another scene first');
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('closes on Cancel and on Escape', async () => {
    const wrapper = mountMenu({});
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancel')
      ?.trigger('click');
    await wrapper.get('[role="group"]').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('close')).toHaveLength(2);
  });
});

describe('removing an exit', () => {
  it('says which exit and where it leads, and asks to remove it', async () => {
    const wrapper = mountMenu({ mode: 'remove', exit });
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Exit: Gate');
    expect(wrapper.text()).toContain('Gate leads to Keep');
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Remove exit')
      ?.trigger('click');
    expect(wrapper.emitted('remove')).toHaveLength(1);
  });

  it('admits when the exit leads to a scene that is gone', () => {
    const wrapper = mountMenu({
      mode: 'remove',
      exit: { ...exit, targetName: undefined },
    });
    expect(wrapper.text()).toContain('a scene that is gone');
  });
});
