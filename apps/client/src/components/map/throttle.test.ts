import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createThrottle } from './throttle.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createThrottle', () => {
  it('sends the first call at once', () => {
    const send = vi.fn();
    createThrottle(send, 50)(1);
    expect(send).toHaveBeenCalledWith(1);
  });

  it('holds calls inside the interval and sends only the latest when it ends', () => {
    const send = vi.fn();
    const throttled = createThrottle(send, 50);
    throttled(1);
    throttled(2);
    throttled(3);
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(49);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(3);
  });

  it('keeps a steady rate under a steady stream', () => {
    const send = vi.fn();
    const throttled = createThrottle(send, 50);
    for (let t = 0; t < 1000; t += 10) {
      throttled(t);
      vi.advanceTimersByTime(10);
    }
    // About one per 50 ms: 1000 / 50 = 20, give or take the ends.
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(19);
    expect(send.mock.calls.length).toBeLessThanOrEqual(21);
  });

  it('sends a call that comes after a quiet spell at once again', () => {
    const send = vi.fn();
    const throttled = createThrottle(send, 50);
    throttled(1);
    vi.advanceTimersByTime(200);
    throttled(2);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(2);
  });

  it('drops a held call when cancelled', () => {
    const send = vi.fn();
    const throttled = createThrottle(send, 50);
    throttled(1);
    throttled(2);
    throttled.cancel();
    vi.advanceTimersByTime(500);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('works again after a cancel', () => {
    const send = vi.fn();
    const throttled = createThrottle(send, 50);
    throttled(1);
    throttled(2);
    throttled.cancel();
    vi.advanceTimersByTime(60);
    throttled(3);
    expect(send).toHaveBeenLastCalledWith(3);
  });
});
