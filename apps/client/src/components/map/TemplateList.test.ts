// @vitest-environment jsdom
import type { Template } from '@hearthtable/core';
import { templateSchema } from '@hearthtable/core';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import TemplateList from './TemplateList.vue';

const NOW = '2026-10-01T00:00:00.000Z';

function makeTemplate(overrides: Record<string, unknown> = {}): Template {
  return templateSchema.parse({
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'template',
    schemaVersion: 1,
    permissions: { default: 'observer', seats: {} },
    createdAt: NOW,
    updatedAt: NOW,
    sceneId: crypto.randomUUID(),
    shape: 'burst',
    x: 250,
    y: 250,
    feet: 20,
    placedBy: crypto.randomUUID(),
    ...overrides,
  });
}

describe('TemplateList', () => {
  it('renders nothing with no templates on the scene', () => {
    const wrapper = mount(TemplateList, { props: { templates: [] } });
    expect(wrapper.find('.template-list').exists()).toBe(false);
  });

  it('names each template by shape, feet, and its label when it has one', () => {
    const wrapper = mount(TemplateList, {
      props: {
        templates: [
          makeTemplate({ shape: 'burst', feet: 20 }),
          makeTemplate({ shape: 'cone', feet: 15, label: 'Fireball' }),
        ],
      },
    });
    const labels = wrapper.findAll('.label').map((l) => l.text());
    expect(labels).toEqual(['Burst 20 ft', 'Fireball (Cone 15 ft)']);
  });

  it('offers Remove to the GM for any template, and to the placing seat only', () => {
    const seatId = crypto.randomUUID();
    const mine = makeTemplate({ placedBy: seatId });
    const theirs = makeTemplate({ placedBy: crypto.randomUUID() });

    const asPlacer = mount(TemplateList, {
      props: { templates: [mine, theirs], mySeatId: seatId, isGm: false },
    });
    expect(asPlacer.findAll('button')).toHaveLength(1);

    const asGm = mount(TemplateList, {
      props: { templates: [mine, theirs], mySeatId: seatId, isGm: true },
    });
    expect(asGm.findAll('button')).toHaveLength(2);
  });

  it('emits remove with the template id', async () => {
    const seatId = crypto.randomUUID();
    const template = makeTemplate({ placedBy: seatId });
    const wrapper = mount(TemplateList, {
      props: { templates: [template], mySeatId: seatId },
    });

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[template.id]]);
  });
});
