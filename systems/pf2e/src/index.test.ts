import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@hearthtable/pf2e', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@hearthtable/pf2e');
  });
});
