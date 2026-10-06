// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ToastNotice from './ToastNotice.vue';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastNotice', () => {
  it('shows the message as an alert by default', () => {
    const wrapper = mount(ToastNotice, { props: { message: 'Something went wrong.' } });
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Something went wrong.');
    expect(alert.classes()).toContain('toast-notice--error');
  });

  it('renders as a status note when kind is status', () => {
    const wrapper = mount(ToastNotice, {
      props: { message: 'FYI.', kind: 'status' },
    });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.get('[role="status"]').classes()).toContain('toast-notice--status');
  });

  it('emits dismiss when the close button is clicked', async () => {
    const wrapper = mount(ToastNotice, { props: { message: 'Oops.' } });
    await wrapper.get('.toast-dismiss').trigger('click');
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });

  it('emits dismiss on its own after autoDismissMs', () => {
    const wrapper = mount(ToastNotice, {
      props: { message: 'Oops.', autoDismissMs: 1000 },
    });
    vi.advanceTimersByTime(999);
    expect(wrapper.emitted('dismiss')).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });

  it('never auto-dismisses when autoDismissMs is 0', () => {
    const wrapper = mount(ToastNotice, {
      props: { message: 'Stays until cleared.', autoDismissMs: 0 },
    });
    vi.advanceTimersByTime(60_000);
    expect(wrapper.emitted('dismiss')).toBeUndefined();
  });

  it('restarts the timer when the message changes, instead of firing on the old schedule', async () => {
    const wrapper = mount(ToastNotice, {
      props: { message: 'First.', autoDismissMs: 1000 },
    });
    vi.advanceTimersByTime(800);
    await wrapper.setProps({ message: 'Second.' });
    vi.advanceTimersByTime(800);
    expect(wrapper.emitted('dismiss')).toBeUndefined();

    vi.advanceTimersByTime(200);
    expect(wrapper.emitted('dismiss')).toHaveLength(1);
  });
});
