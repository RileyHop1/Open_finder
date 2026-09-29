import { describe, expect, it } from 'vitest';

import { raritySchema } from './index.js';

describe('@hearthtable/pf2e public API', () => {
  it('exposes a content primitive via the package entry point', () => {
    expect(raritySchema.safeParse('uncommon').success).toBe(true);
  });
});
