import { describe, expect, it } from 'vitest';

import type { Expression } from './ast.js';
import { evaluate } from './evaluator.js';
import { parse } from './parser.js';
import type { RandomSource } from './rng.js';

function parseOk(source: string): Expression {
  const result = parse(source);
  if (!result.ok) {
    throw new Error(`expected "${source}" to parse, got: ${result.error.message}`);
  }
  return result.expression;
}

/**
 * A small deterministic PRNG (mulberry32) for tests only. Production uses
 * `cryptoRandomSource` from rng.ts; this exists purely so a fixed seed
 * reproduces the same roll sequence across runs, per docs/dice.md.
 */
function seededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  return (faces: number) => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(value * faces) + 1;
  };
}

function neverRoll(): number {
  throw new Error('rng should not have been called for a dice-free expression');
}

describe('evaluate -- arithmetic and constants', () => {
  it('evaluates a flat integer without rolling', () => {
    const outcome = evaluate('7', parseOk('7'), { rng: neverRoll });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(7);
      expect(outcome.result.terms).toEqual([{ kind: 'constant', value: 7 }]);
    }
  });

  it('applies a minus sign to a later constant term', () => {
    const outcome = evaluate('10-3', parseOk('10-3'), { rng: neverRoll });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(7);
      expect(outcome.result.terms[1]).toEqual({ kind: 'constant', value: -3 });
    }
  });

  it('echoes the original expression text verbatim', () => {
    const outcome = evaluate('1D20 + 7', parseOk('1D20 + 7'), { rng: () => 15 });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.expression).toBe('1D20 + 7');
    }
  });
});

describe('evaluate -- dice', () => {
  it('rolls the requested count of dice and sums them', () => {
    const rng: RandomSource = (faces) => {
      expect(faces).toBe(6);
      return 4;
    };
    const outcome = evaluate('3d6', parseOk('3d6'), { rng });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(12);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 6, result: 4, kept: true, value: 4 },
        { kind: 'die', faces: 6, result: 4, kept: true, value: 4 },
        { kind: 'die', faces: 6, result: 4, kept: true, value: 4 },
      ]);
    }
  });

  it('negates a subtracted dice term without reporting a negative face', () => {
    const outcome = evaluate('1d6-1d4', parseOk('1d6-1d4'), { rng: () => 3 });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(0); // 3 - 3
      const [d6, d4] = outcome.result.terms;
      expect(d6).toEqual({ kind: 'die', faces: 6, result: 3, kept: true, value: 3 });
      // The die still shows the positive face it rolled; only its contribution is negative.
      expect(d4).toEqual({ kind: 'die', faces: 4, result: 3, kept: true, value: -3 });
    }
  });
});

describe('evaluate -- @references', () => {
  it('resolves a reference against the supplied context', () => {
    const outcome = evaluate('@perception', parseOk('@perception'), {
      rng: neverRoll,
      resolveReference: (name) => (name === 'perception' ? 5 : undefined),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(5);
      expect(outcome.result.terms).toEqual([
        { kind: 'reference', name: 'perception', value: 5 },
      ]);
    }
  });

  it('applies sign to a resolved reference', () => {
    const outcome = evaluate('10-@perception', parseOk('10-@perception'), {
      rng: neverRoll,
      resolveReference: () => 5,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(5);
      expect(outcome.result.terms[1]).toEqual({
        kind: 'reference',
        name: 'perception',
        value: -5,
      });
    }
  });

  it('returns unknown-reference when no resolver is supplied', () => {
    const outcome = evaluate('@perception', parseOk('@perception'), { rng: neverRoll });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('unknown-reference');
    }
  });

  it("returns unknown-reference when the resolver doesn't know the name", () => {
    const outcome = evaluate('@perception', parseOk('@perception'), {
      rng: neverRoll,
      resolveReference: () => undefined,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('unknown-reference');
    }
  });
});

describe('evaluate -- deferred modifiers', () => {
  it.each(['2d20kh1', '4d6dl1', '1d6rr<2'])(
    'rejects %s as unsupported until keep/drop/reroll land',
    (source) => {
      const outcome = evaluate(source, parseOk(source), { rng: () => 1 });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.error.code).toBe('unsupported-modifiers');
      }
    },
  );
});

describe('evaluate -- determinism', () => {
  it('produces identical results from two independent runs with the same seed', () => {
    const first = evaluate('4d6+2d8', parseOk('4d6+2d8'), {
      rng: seededRandomSource(42),
    });
    const second = evaluate('4d6+2d8', parseOk('4d6+2d8'), {
      rng: seededRandomSource(42),
    });
    expect(first).toEqual(second);
  });

  it('produces different results from two different seeds (sanity check on the test helper)', () => {
    const first = evaluate('10d6', parseOk('10d6'), { rng: seededRandomSource(1) });
    const second = evaluate('10d6', parseOk('10d6'), { rng: seededRandomSource(2) });
    expect(first).not.toEqual(second);
  });

  it('echoes an explicit seed label into the result', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), {
      rng: seededRandomSource(7),
      seed: 'golden-fighter-1',
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.seed).toBe('golden-fighter-1');
    }
  });

  it('omits the seed key entirely when none is provided', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), { rng: seededRandomSource(7) });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(Object.hasOwn(outcome.result, 'seed')).toBe(false);
    }
  });
});

describe('evaluate -- never throws on well-formed input', () => {
  it('does not throw for a complex expression', () => {
    expect(() =>
      evaluate('1d20+2d6+@strength-1', parseOk('1d20+2d6+@strength-1'), {
        rng: seededRandomSource(3),
        resolveReference: () => 2,
      }),
    ).not.toThrow();
  });
});
