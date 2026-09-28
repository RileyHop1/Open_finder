import { describe, expect, it } from 'vitest';

import { PACKAGE_NAME } from './index.js';

describe('@hearthtable/server', () => {
  it('exposes its package name', () => {
    expect(PACKAGE_NAME).toBe('@hearthtable/server');
  });
});
