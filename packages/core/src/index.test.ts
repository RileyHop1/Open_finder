import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@hearthtable/core', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@hearthtable/core');
  });
});
