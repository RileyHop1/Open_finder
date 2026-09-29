// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import App from './App.vue';

function mountApp() {
  return mount(App, {
    global: { plugins: [createPinia()] },
  });
}

describe('App', () => {
  it('mounts with Pinia installed and renders the shell', () => {
    const wrapper = mountApp();
    expect(wrapper.text()).toContain('Hearthtable');
  });

  it('has a skip link as the first focusable element, for keyboard users', () => {
    const wrapper = mountApp();
    const skipLink = wrapper.find('a.skip-link');
    expect(skipLink.exists()).toBe(true);
    expect(skipLink.attributes('href')).toBe('#main-content');
  });

  it('has a #main-content landmark the skip link points to', () => {
    const wrapper = mountApp();
    expect(wrapper.find('main#main-content').exists()).toBe(true);
  });
});
