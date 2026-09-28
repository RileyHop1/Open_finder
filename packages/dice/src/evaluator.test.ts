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

/**
 * An RNG that returns a fixed, pre-scripted sequence of results, one per
 * call, in order. Lets a test pin exactly which dice come up which faces --
 * including for the *new* die a reroll produces -- rather than relying on a
 * seeded PRNG's opaque output.
 */
function sequenceRandomSource(values: readonly number[]): RandomSource {
  let index = 0;
  return () => {
    const value = values[index];
    if (value === undefined) {
      throw new Error(`sequenceRandomSource exhausted after ${index} call(s)`);
    }
    index += 1;
    return value;
  };
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

describe('evaluate -- keep and drop', () => {
  it('keeps the highest N with an explicit count (kh1 on 2d20, fortune)', () => {
    const outcome = evaluate('2d20kh1', parseOk('2d20kh1'), {
      rng: sequenceRandomSource([12, 17]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(17);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 12, kept: false, value: 0 },
        { kind: 'die', faces: 20, result: 17, kept: true, value: 17 },
      ]);
    }
  });

  it('keeps the lowest N with an explicit count (kl1 on 2d20, misfortune)', () => {
    const outcome = evaluate('2d20kl1', parseOk('2d20kl1'), {
      rng: sequenceRandomSource([12, 17]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(12);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 12, kept: true, value: 12 },
        { kind: 'die', faces: 20, result: 17, kept: false, value: 0 },
      ]);
    }
  });

  it('defaults kh to keeping 1 when no count is given', () => {
    const outcome = evaluate('4d6kh', parseOk('4d6kh'), {
      rng: sequenceRandomSource([2, 6, 4, 1]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(6);
      const kept = outcome.result.terms.filter((t) => t.kind === 'die' && t.kept);
      expect(kept).toEqual([{ kind: 'die', faces: 6, result: 6, kept: true, value: 6 }]);
    }
  });

  it('drops the lowest N with an explicit count (the classic 4d6dl1)', () => {
    const outcome = evaluate('4d6dl1', parseOk('4d6dl1'), {
      rng: sequenceRandomSource([2, 6, 4, 1]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // drops the 1; keeps 2 + 6 + 4 = 12
      expect(outcome.result.total).toBe(12);
      expect(outcome.result.terms.at(-1)).toEqual({
        kind: 'die',
        faces: 6,
        result: 1,
        kept: false,
        value: 0,
      });
    }
  });

  it('drops the highest N with an explicit count', () => {
    const outcome = evaluate('4d6dh1', parseOk('4d6dh1'), {
      rng: sequenceRandomSource([2, 6, 4, 1]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // drops the 6; keeps 2 + 4 + 1 = 7
      expect(outcome.result.total).toBe(7);
    }
  });

  it('defaults dl to dropping 1 when no count is given', () => {
    const outcome = evaluate('4d6dl', parseOk('4d6dl'), {
      rng: sequenceRandomSource([2, 6, 4, 1]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(12); // same as the explicit-count case above
    }
  });

  it('clamps a count larger than the dice pool instead of erroring', () => {
    const outcome = evaluate('2d6kh5', parseOk('2d6kh5'), {
      rng: sequenceRandomSource([3, 5]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(8); // both dice kept, nothing to drop
      expect(outcome.result.terms.every((t) => t.kind === 'die' && t.kept)).toBe(true);
    }
  });
});

describe('evaluate -- reroll', () => {
  it('rerolls a die matching the comparator exactly once', () => {
    // rr<2 rerolls a 1; the roll sequence gives a 1 first, then a 5 for the reroll.
    const outcome = evaluate('1d6rr<2', parseOk('1d6rr<2'), {
      rng: sequenceRandomSource([1, 5]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(5);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 6, result: 1, kept: false, value: 0 },
        { kind: 'die', faces: 6, result: 5, kept: true, value: 5 },
      ]);
    }
  });

  it('does not reroll a die that does not match the comparator', () => {
    const outcome = evaluate('1d6rr<2', parseOk('1d6rr<2'), {
      rng: sequenceRandomSource([4]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(4);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 6, result: 4, kept: true, value: 4 },
      ]);
    }
  });

  it('does not re-reroll the replacement even if it also matches', () => {
    // Both the original and the reroll come up a 1 -- only one reroll happens.
    const outcome = evaluate('1d6rr<2', parseOk('1d6rr<2'), {
      rng: sequenceRandomSource([1, 1]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(1);
      expect(outcome.result.terms).toHaveLength(2);
      expect(outcome.result.terms[1]).toEqual({
        kind: 'die',
        faces: 6,
        result: 1,
        kept: true,
        value: 1,
      });
    }
  });

  it.each([
    ['<', 2, 1, true],
    ['<=', 2, 2, true],
    ['=', 3, 3, true],
    ['>=', 5, 5, true],
    ['>', 5, 6, true],
    ['<', 2, 2, false],
  ] as const)(
    'comparator %s%d against a roll of %d rerolls: %s',
    (comparator, value, roll, shouldReroll) => {
      const source = `1d6rr${comparator}${value}`;
      const rng = shouldReroll
        ? sequenceRandomSource([roll, 3])
        : sequenceRandomSource([roll]);
      const outcome = evaluate(source, parseOk(source), { rng });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.result.terms).toHaveLength(shouldReroll ? 2 : 1);
      }
    },
  );
});

describe('evaluate -- chained modifiers', () => {
  it('applies modifiers left to right, drop then reroll on the survivors', () => {
    // 4d6dl1rr<2: drop the lowest of [2,6,4,1] -> drops the 1, leaving 2,6,4.
    // Then rr<2 checks the *survivors* only -- none of 2,6,4 match, so no reroll.
    const outcome = evaluate('4d6dl1rr<2', parseOk('4d6dl1rr<2'), {
      rng: sequenceRandomSource([2, 6, 4, 1]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(12);
      expect(outcome.result.terms).toHaveLength(4); // no reroll die appended
    }
  });

  it('a die dropped by an earlier modifier is not touched by a later reroll', () => {
    // 2d6dl1rr<2: rolls [1, 5]. dl1 drops the lower die (the 1) first. rr<2
    // would match that same 1 -- but it is no longer active, so it is never
    // rerolled. If dropped dice were still eligible, this would produce a
    // third term (the reroll); instead there are exactly 2.
    const outcome = evaluate('2d6dl1rr<2', parseOk('2d6dl1rr<2'), {
      rng: sequenceRandomSource([1, 5]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.terms).toHaveLength(2);
      expect(outcome.result.total).toBe(5);
    }
  });
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

describe('evaluate -- fortune and misfortune', () => {
  // The four combinations docs/dice.md calls out explicitly.
  it('plain roll: neither flag set -> a single roll, no discarded die', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), {
      rng: sequenceRandomSource([11]),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(11);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 11, kept: true, value: 11 },
      ]);
    }
  });

  it('fortune only: rolls twice and keeps the higher, retaining the discard', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), {
      rng: sequenceRandomSource([8, 15]),
      fortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(15);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 15, kept: true, value: 15 },
        { kind: 'die', faces: 20, result: 8, kept: false, value: 0 },
      ]);
    }
  });

  it('misfortune only: rolls twice and keeps the lower, retaining the discard', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), {
      rng: sequenceRandomSource([8, 15]),
      misfortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(8);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 8, kept: true, value: 8 },
        { kind: 'die', faces: 20, result: 15, kept: false, value: 0 },
      ]);
    }
  });

  it('fortune and misfortune together cancel: a single normal roll', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), {
      rng: sequenceRandomSource([11]),
      fortune: true,
      misfortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // Only one rng() call was consumed -- a second queued value would
      // never be reached, so this also proves it did NOT roll twice.
      expect(outcome.result.total).toBe(11);
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 11, kept: true, value: 11 },
      ]);
    }
  });

  it('a tie keeps the first roll, deterministically', () => {
    const outcome = evaluate('1d20', parseOk('1d20'), {
      rng: sequenceRandomSource([9, 9]),
      fortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.terms).toEqual([
        { kind: 'die', faces: 20, result: 9, kept: true, value: 9 },
        { kind: 'die', faces: 20, result: 9, kept: false, value: 0 },
      ]);
    }
  });

  it('applies uniformly across every die when an expression has more than one', () => {
    const outcome = evaluate('2d20', parseOk('2d20'), {
      rng: sequenceRandomSource([3, 12, 7, 19]),
      fortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      // Position 1: max(3, 12) = 12. Position 2: max(7, 19) = 19.
      expect(outcome.result.total).toBe(31);
      expect(outcome.result.terms).toHaveLength(4);
    }
  });

  it('a keep/drop/reroll modifier only sees the fortune-kept die, not the discard', () => {
    // fortune keeps the 15 and discards the 8; kh1 on a single die is a
    // no-op either way, but this pins that the discarded 8 was never
    // "active" for the modifier chain to begin with.
    const outcome = evaluate('1d20kh1', parseOk('1d20kh1'), {
      rng: sequenceRandomSource([8, 15]),
      fortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.total).toBe(15);
      expect(outcome.result.terms.filter((t) => t.kind === 'die' && t.kept)).toHaveLength(
        1,
      );
    }
  });

  it('a reroll replacement is a plain single roll, not itself fortune-doubled', () => {
    // misfortune rolls [1, 4] and keeps the lower (1), discarding the 4.
    // That kept 1 matches rr<2 and rerolls once, consuming exactly one more
    // rng() call (the 9). If the reroll were itself misfortune-doubled it
    // would need a second value here that this sequence doesn't supply, and
    // sequenceRandomSource would throw instead of the test passing.
    const outcome = evaluate('1d6rr<2', parseOk('1d6rr<2'), {
      rng: sequenceRandomSource([1, 4, 9]),
      misfortune: true,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.terms).toHaveLength(3);
    }
  });
});
