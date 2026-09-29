// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { getDeviceToken } from './deviceToken.js';

beforeEach(() => {
  localStorage.clear();
});

describe('getDeviceToken', () => {
  it('generates a token and persists it in localStorage', () => {
    const token = getDeviceToken();
    expect(token.length).toBeGreaterThan(0);
    expect(localStorage.getItem('hearthtable:deviceToken')).toBe(token);
  });

  it('returns the same token on every call', () => {
    const first = getDeviceToken();
    const second = getDeviceToken();
    expect(second).toBe(first);
  });

  it('returns the token already in localStorage rather than generating a new one', () => {
    localStorage.setItem('hearthtable:deviceToken', 'existing-token');
    expect(getDeviceToken()).toBe('existing-token');
  });
});
