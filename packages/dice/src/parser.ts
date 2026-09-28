/**
 * Recursive-descent parser for the grammar in docs/dice.md. Turns a token
 * stream from `tokenize()` into an `Expression` AST.
 *
 * Never throws -- malformed input produces a typed `ParseError` result. This
 * is the "never throws" contract the evaluator and every caller above it
 * depends on.
 */

import type {
  Comparator,
  DiceExpr,
  DiceModifier,
  Expression,
  ReferenceExpr,
  Sign,
  SignedTerm,
  Term,
} from './ast.js';
import type { Token, TokenType } from './tokenizer.js';
import { tokenize } from './tokenizer.js';

export type ParseErrorCode = 'syntax' | 'unsupported-feature';

export interface ParseError {
  readonly code: ParseErrorCode;
  readonly message: string;
  readonly position: number;
}

export type ParseResult =
  | { readonly ok: true; readonly expression: Expression }
  | { readonly ok: false; readonly error: ParseError };

function isParseError(value: unknown): value is ParseError {
  return typeof value === 'object' && value !== null && 'code' in value;
}

/** A read-only, never-out-of-bounds cursor over a token stream. */
class Cursor {
  private index = 0;
  private readonly tokens: readonly Token[];
  private readonly eof: Token;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
    const last = tokens.at(-1);
    this.eof = last?.type === 'eof' ? last : { type: 'eof', text: '', position: 0 };
  }

  peek(): Token {
    return this.tokens[this.index] ?? this.eof;
  }

  advance(): Token {
    const token = this.peek();
    if (token.type !== 'eof') {
      this.index += 1;
    }
    return token;
  }
}

function expect(cursor: Cursor, type: TokenType, message: string): Token | ParseError {
  const token = cursor.peek();
  if (token.type !== type) {
    return { code: 'syntax', message, position: token.position };
  }
  return cursor.advance();
}

function parseComparator(cursor: Cursor): Comparator | ParseError {
  const token = cursor.peek();
  switch (token.type) {
    case 'lt':
      cursor.advance();
      return '<';
    case 'lte':
      cursor.advance();
      return '<=';
    case 'eq':
      cursor.advance();
      return '=';
    case 'gte':
      cursor.advance();
      return '>=';
    case 'gt':
      cursor.advance();
      return '>';
    default:
      return {
        code: 'syntax',
        message: "expected a comparator ('<', '<=', '=', '>=', '>')",
        position: token.position,
      };
  }
}

/** Parses the optional integer after kh/kl/dh/dl, defaulting to 1. */
function parseKeepOrDropCount(cursor: Cursor): number {
  const token = cursor.peek();
  if (token.type === 'integer') {
    cursor.advance();
    return token.value ?? 1;
  }
  return 1;
}

function parseModifiers(cursor: Cursor): readonly DiceModifier[] | ParseError {
  const modifiers: DiceModifier[] = [];

  for (;;) {
    const token = cursor.peek();

    if (token.type === 'kh' || token.type === 'kl') {
      const which = token.type;
      cursor.advance();
      const count = parseKeepOrDropCount(cursor);
      modifiers.push({ kind: 'keep', which, count });
      continue;
    }

    if (token.type === 'dh' || token.type === 'dl') {
      const which = token.type;
      cursor.advance();
      const count = parseKeepOrDropCount(cursor);
      modifiers.push({ kind: 'drop', which, count });
      continue;
    }

    if (token.type === 'rr') {
      cursor.advance();
      const comparator = parseComparator(cursor);
      if (isParseError(comparator)) return comparator;
      const valueToken = expect(
        cursor,
        'integer',
        'expected an integer after the reroll comparator',
      );
      if (isParseError(valueToken)) return valueToken;
      modifiers.push({ kind: 'reroll', comparator, value: valueToken.value ?? 0 });
      continue;
    }

    if (token.type === 'explode') {
      cursor.advance();
      modifiers.push({ kind: 'explode', position: token.position });
      continue;
    }

    break;
  }

  return modifiers;
}

/** Parses "d" faces modifiers*; count is the already-consumed leading dice count. */
function parseDice(cursor: Cursor, count: number): DiceExpr | ParseError {
  const dToken = expect(cursor, 'd', "expected 'd' after the dice count");
  if (isParseError(dToken)) return dToken;

  const facesToken = expect(cursor, 'integer', "expected the number of faces after 'd'");
  if (isParseError(facesToken)) return facesToken;
  const faces = facesToken.value ?? 0;
  if (faces < 1) {
    return {
      code: 'syntax',
      message: 'a die must have at least 1 face',
      position: facesToken.position,
    };
  }

  const modifiers = parseModifiers(cursor);
  if (isParseError(modifiers)) return modifiers;

  return { kind: 'dice', count, faces, modifiers };
}

function parseTerm(cursor: Cursor): Term | ParseError {
  const token = cursor.peek();

  if (token.type === 'at') {
    cursor.advance();
    const identifierToken = expect(cursor, 'identifier', "expected a name after '@'");
    if (isParseError(identifierToken)) return identifierToken;
    const reference: ReferenceExpr = { kind: 'reference', name: identifierToken.text };
    return reference;
  }

  if (token.type === 'd') {
    // A bare "d20" with an implicit count of 1.
    return parseDice(cursor, 1);
  }

  if (token.type === 'integer') {
    cursor.advance();
    const value = token.value ?? 0;
    if (cursor.peek().type === 'd') {
      return parseDice(cursor, value);
    }
    return { kind: 'integer', value };
  }

  return {
    code: 'syntax',
    message: 'expected a number, a dice roll, or an @reference',
    position: token.position,
  };
}

function parseExpression(cursor: Cursor): Expression | ParseError {
  const firstTerm = parseTerm(cursor);
  if (isParseError(firstTerm)) return firstTerm;

  const terms: SignedTerm[] = [{ sign: '+', term: firstTerm }];

  for (;;) {
    const token = cursor.peek();
    if (token.type !== 'plus' && token.type !== 'minus') {
      break;
    }
    const sign: Sign = token.type === 'plus' ? '+' : '-';
    cursor.advance();
    const term = parseTerm(cursor);
    if (isParseError(term)) return term;
    terms.push({ sign, term });
  }

  return { kind: 'expression', terms };
}

/** Finds the first exploding-dice modifier anywhere in the expression, if any. */
function findExplodeModifier(
  expression: Expression,
): { readonly position: number } | undefined {
  for (const { term } of expression.terms) {
    if (term.kind === 'dice') {
      const explode = term.modifiers.find((m) => m.kind === 'explode');
      if (explode) return explode;
    }
  }
  return undefined;
}

/**
 * Parses a roll expression per the grammar in docs/dice.md. Never throws:
 * malformed input, and exploding dice (recognized but unsupported in v1),
 * both come back as { ok: false, error }.
 */
export function parse(source: string): ParseResult {
  const tokenized = tokenize(source);
  if (!tokenized.ok) {
    return {
      ok: false,
      error: {
        code: 'syntax',
        message: tokenized.error.message,
        position: tokenized.error.position,
      },
    };
  }

  const cursor = new Cursor(tokenized.tokens);

  if (cursor.peek().type === 'eof') {
    return {
      ok: false,
      error: { code: 'syntax', message: 'expected an expression', position: 0 },
    };
  }

  const expression = parseExpression(cursor);
  if (isParseError(expression)) {
    return { ok: false, error: expression };
  }

  const trailing = cursor.peek();
  if (trailing.type !== 'eof') {
    return {
      ok: false,
      error: {
        code: 'syntax',
        message: `unexpected '${trailing.text}' after the expression`,
        position: trailing.position,
      },
    };
  }

  const explodeModifier = findExplodeModifier(expression);
  if (explodeModifier) {
    return {
      ok: false,
      error: {
        code: 'unsupported-feature',
        message:
          "exploding dice ('!') are not supported in v1 -- PF2e has no exploding dice; see docs/dice.md",
        position: explodeModifier.position,
      },
    };
  }

  return { ok: true, expression };
}
