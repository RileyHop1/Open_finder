import { describe, expect, it } from 'vitest';

import { evaluate, parse } from './index.js';

describe('@hearthtable/dice public API', () => {
  it('parses a simple expression via the package entry point', () => {
    const result = parse('1d20+7');
    expect(result.ok).toBe(true);
  });

  it('evaluates a parsed expression via the package entry point', () => {
    const parsed = parse('1d20+7');
    if (!parsed.ok) {
      throw new Error('expected "1d20+7" to parse');
    }
    const outcome = evaluate('1d20+7', parsed.expression, { rng: () => 12 });
    expect(outcome).toEqual({
      ok: true,
      result: {
        expression: '1d20+7',
        total: 19,
        terms: [
          { kind: 'die', faces: 20, result: 12, kept: true, value: 12 },
          { kind: 'constant', value: 7 },
        ],
      },
    });
  });
});
