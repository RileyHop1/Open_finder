import { describe, expect, it } from 'vitest';

import type { DiceExpr, Expression } from './ast.js';
import { MAX_DICE_COUNT, MAX_DIE_FACES, parse } from './parser.js';

function parseOk(source: string): Expression {
  const result = parse(source);
  if (!result.ok) {
    throw new Error(`expected "${source}" to parse, got: ${result.error.message}`);
  }
  return result.expression;
}

function firstDice(expression: Expression): DiceExpr {
  const term = expression.terms[0]?.term;
  if (term?.kind !== 'dice') {
    throw new Error('expected the first term to be a dice expression');
  }
  return term;
}

describe('parse -- grammar productions', () => {
  // expression := term (("+" | "-") term)*
  it('parses a single term', () => {
    const expr = parseOk('7');
    expect(expr.terms).toHaveLength(1);
  });

  it('parses a chain of + and - terms', () => {
    const expr = parseOk('1d20+7-2+3');
    expect(expr.terms.map((t) => t.sign)).toEqual(['+', '+', '-', '+']);
  });

  // term := dice | integer | reference
  it('parses an integer term', () => {
    const expr = parseOk('7');
    expect(expr.terms[0]?.term).toEqual({ kind: 'integer', value: 7 });
  });

  it('parses a reference term', () => {
    const expr = parseOk('@perception');
    expect(expr.terms[0]?.term).toEqual({ kind: 'reference', name: 'perception' });
  });

  // dice := count? "d" faces modifiers*
  it('parses dice with an explicit count', () => {
    const dice = firstDice(parseOk('2d6'));
    expect(dice).toMatchObject({ kind: 'dice', count: 2, faces: 6, modifiers: [] });
  });

  it('defaults count to 1 when omitted', () => {
    const dice = firstDice(parseOk('d20'));
    expect(dice.count).toBe(1);
    expect(dice.faces).toBe(20);
  });

  // keep := ("kh" | "kl") count?
  it('parses keep-highest and keep-lowest, with and without an explicit count', () => {
    expect(firstDice(parseOk('2d20kh1')).modifiers).toEqual([
      { kind: 'keep', which: 'kh', count: 1 },
    ]);
    expect(firstDice(parseOk('2d20kl1')).modifiers).toEqual([
      { kind: 'keep', which: 'kl', count: 1 },
    ]);
    expect(firstDice(parseOk('4d6kh')).modifiers).toEqual([
      { kind: 'keep', which: 'kh', count: 1 },
    ]);
  });

  // drop := ("dh" | "dl") count?
  it('parses drop-highest and drop-lowest, with and without an explicit count', () => {
    expect(firstDice(parseOk('4d6dl1')).modifiers).toEqual([
      { kind: 'drop', which: 'dl', count: 1 },
    ]);
    expect(firstDice(parseOk('4d6dh1')).modifiers).toEqual([
      { kind: 'drop', which: 'dh', count: 1 },
    ]);
    expect(firstDice(parseOk('4d6dl')).modifiers).toEqual([
      { kind: 'drop', which: 'dl', count: 1 },
    ]);
  });

  // reroll := "rr" comparison ; comparison := ("<" | "<=" | "=" | ">=" | ">") integer
  it('parses reroll with each comparator', () => {
    expect(firstDice(parseOk('1d6rr<2')).modifiers).toEqual([
      { kind: 'reroll', comparator: '<', value: 2 },
    ]);
    expect(firstDice(parseOk('1d6rr<=2')).modifiers).toEqual([
      { kind: 'reroll', comparator: '<=', value: 2 },
    ]);
    expect(firstDice(parseOk('1d6rr=1')).modifiers).toEqual([
      { kind: 'reroll', comparator: '=', value: 1 },
    ]);
    expect(firstDice(parseOk('1d6rr>=5')).modifiers).toEqual([
      { kind: 'reroll', comparator: '>=', value: 5 },
    ]);
    expect(firstDice(parseOk('1d6rr>5')).modifiers).toEqual([
      { kind: 'reroll', comparator: '>', value: 5 },
    ]);
  });

  it('parses multiple modifiers on one dice term', () => {
    const dice = firstDice(parseOk('4d6dl1rr<2'));
    expect(dice.modifiers).toEqual([
      { kind: 'drop', which: 'dl', count: 1 },
      { kind: 'reroll', comparator: '<', value: 2 },
    ]);
  });
});

describe('parse -- the examples from docs/dice.md', () => {
  it.each([
    '1d20+7',
    '2d6+4',
    '1d20+@perception',
    '2d20kh1', // fortune
    '2d20kl1', // misfortune
    '1d6rr<2',
  ])('parses %s', (source) => {
    const result = parse(source);
    expect(result.ok).toBe(true);
  });
});

describe('parse -- exploding dice: recognized, then rejected', () => {
  it('parses the ! syntax structurally but rejects it as unsupported', () => {
    const result = parse('1d6!');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported-feature');
    }
  });

  it('rejects explode even buried in a larger expression', () => {
    const result = parse('1d20+2d6!+4');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unsupported-feature');
    }
  });
});

describe('parse -- malformed input never throws', () => {
  it.each([
    '',
    '   ',
    '1d20+',
    '+1d20',
    '1d',
    '1d20$',
    '@',
    '1d20rr',
    '1d6rr<',
    '1d0',
    '1d20 1d6',
    '1d20kh1kh1x',
  ])('returns a syntax error for %j instead of throwing', (source) => {
    expect(() => parse(source)).not.toThrow();
    const result = parse(source);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('syntax');
      expect(typeof result.error.message).toBe('string');
      expect(typeof result.error.position).toBe('number');
    }
  });
});

describe('parse -- dice count and face caps', () => {
  it(`allows exactly ${MAX_DICE_COUNT} dice`, () => {
    const dice = firstDice(parseOk(`${MAX_DICE_COUNT}d6`));
    expect(dice.count).toBe(MAX_DICE_COUNT);
  });

  it('rejects a dice count over the cap', () => {
    const result = parse(`${MAX_DICE_COUNT + 1}d6`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(`${MAX_DICE_COUNT} dice`);
    }
  });

  it('rejects an extremely long dice count (would otherwise overflow to Infinity)', () => {
    const result = parse(`${'9'.repeat(400)}d6`);
    expect(result.ok).toBe(false);
  });

  it(`allows exactly ${MAX_DIE_FACES} faces`, () => {
    const dice = firstDice(parseOk(`1d${MAX_DIE_FACES}`));
    expect(dice.faces).toBe(MAX_DIE_FACES);
  });

  it('rejects a face count over the cap', () => {
    const result = parse(`1d${MAX_DIE_FACES + 1}`);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(`${MAX_DIE_FACES} faces`);
    }
  });

  it('rejects a dice count of 0', () => {
    const result = parse('0d6');
    expect(result.ok).toBe(false);
  });
});
