import { describe, expect, it } from 'vitest';

import { parse } from './index.js';

describe('@hearthtable/dice public API', () => {
  it('parses a simple expression via the package entry point', () => {
    const result = parse('1d20+7');
    expect(result.ok).toBe(true);
  });
});
