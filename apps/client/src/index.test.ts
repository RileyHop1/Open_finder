import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@hearthtable/client', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@hearthtable/client');
  });
});
