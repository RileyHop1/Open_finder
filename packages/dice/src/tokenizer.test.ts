import { describe, expect, it } from 'vitest';

import { tokenize } from './tokenizer.js';

function tokenTypes(source: string): readonly string[] {
  const result = tokenize(source);
  if (!result.ok) {
    throw new Error(`expected ${source} to tokenize, got: ${result.error.message}`);
  }
  return result.tokens.map((t) => t.type);
}

describe('tokenize', () => {
  it('tokenizes an integer', () => {
    const result = tokenize('42');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens[0]).toMatchObject({ type: 'integer', value: 42 });
    }
  });

  it('tokenizes + and -', () => {
    expect(tokenTypes('1+2-3')).toEqual([
      'integer',
      'plus',
      'integer',
      'minus',
      'integer',
      'eof',
    ]);
  });

  it('tokenizes ! as explode', () => {
    expect(tokenTypes('1d6!')).toEqual(['integer', 'd', 'integer', 'explode', 'eof']);
  });

  it('disambiguates the dice separator from dh/dl by lookahead', () => {
    expect(tokenTypes('2d6')).toEqual(['integer', 'd', 'integer', 'eof']);
    expect(tokenTypes('2d6dh1')).toEqual([
      'integer',
      'd',
      'integer',
      'dh',
      'integer',
      'eof',
    ]);
    expect(tokenTypes('2d6dl1')).toEqual([
      'integer',
      'd',
      'integer',
      'dl',
      'integer',
      'eof',
    ]);
  });

  it('tokenizes kh and kl', () => {
    expect(tokenTypes('2d20kh1')).toEqual([
      'integer',
      'd',
      'integer',
      'kh',
      'integer',
      'eof',
    ]);
    expect(tokenTypes('2d20kl1')).toEqual([
      'integer',
      'd',
      'integer',
      'kl',
      'integer',
      'eof',
    ]);
  });

  it('tokenizes rr and each comparator', () => {
    expect(tokenTypes('1d6rr<2')).toEqual([
      'integer',
      'd',
      'integer',
      'rr',
      'lt',
      'integer',
      'eof',
    ]);
    expect(tokenTypes('1d6rr<=2')).toContain('lte');
    expect(tokenTypes('1d6rr=2')).toContain('eq');
    expect(tokenTypes('1d6rr>=2')).toContain('gte');
    expect(tokenTypes('1d6rr>2')).toContain('gt');
  });

  it('tokenizes an @reference as at + identifier', () => {
    const result = tokenize('@perception');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tokens).toMatchObject([
        { type: 'at' },
        { type: 'identifier', text: 'perception' },
        { type: 'eof' },
      ]);
    }
  });

  it('skips whitespace between tokens', () => {
    expect(tokenTypes('1d20 + 7')).toEqual([
      'integer',
      'd',
      'integer',
      'plus',
      'integer',
      'eof',
    ]);
  });

  it('always terminates with an eof token at the source length', () => {
    const result = tokenize('1d20');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const eof = result.tokens.at(-1);
      expect(eof).toMatchObject({ type: 'eof', position: 4 });
    }
  });

  it('rejects an unknown character', () => {
    const result = tokenize('1d20$');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.position).toBe(4);
    }
  });

  it('rejects a bare @ with nothing after it', () => {
    const result = tokenize('@');
    expect(result.ok).toBe(false);
  });

  it("rejects 'k' not followed by h or l", () => {
    const result = tokenize('1d20k');
    expect(result.ok).toBe(false);
  });

  it("rejects 'r' not followed by another r", () => {
    const result = tokenize('1d20r');
    expect(result.ok).toBe(false);
  });
});
