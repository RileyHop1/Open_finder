/**
 * Scans a roll expression source string into a flat token stream for the
 * parser. Never throws -- a lexical error is returned as a `TokenizeResult`
 * with `ok: false`.
 */

export type TokenType =
  | 'integer'
  | 'd'
  | 'plus'
  | 'minus'
  | 'kh'
  | 'kl'
  | 'dh'
  | 'dl'
  | 'rr'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'gte'
  | 'gt'
  | 'at'
  | 'identifier'
  | 'explode'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly text: string;
  /** Offset into the source where this token starts. */
  readonly position: number;
  /** Present only on `integer` tokens. */
  readonly value?: number;
}

export interface TokenizeError {
  readonly message: string;
  readonly position: number;
}

export type TokenizeResult =
  | { readonly ok: true; readonly tokens: readonly Token[] }
  | { readonly ok: false; readonly error: TokenizeError };

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}

function isIdentifierChar(ch: string): boolean {
  return isIdentifierStart(ch) || isDigit(ch);
}

export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    const ch = source[i] ?? '';

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }

    const start = i;

    if (isDigit(ch)) {
      let j = i;
      while (j < len && isDigit(source[j] ?? '')) {
        j += 1;
      }
      const text = source.slice(i, j);
      tokens.push({ type: 'integer', text, position: start, value: Number(text) });
      i = j;
      continue;
    }

    if (ch === '+') {
      tokens.push({ type: 'plus', text: '+', position: start });
      i += 1;
      continue;
    }

    if (ch === '-') {
      tokens.push({ type: 'minus', text: '-', position: start });
      i += 1;
      continue;
    }

    if (ch === '!') {
      tokens.push({ type: 'explode', text: '!', position: start });
      i += 1;
      continue;
    }

    if (ch === '@') {
      let j = i + 1;
      const first = source[j] ?? '';
      if (!isIdentifierStart(first)) {
        return {
          ok: false,
          error: { message: "expected an identifier after '@'", position: start },
        };
      }
      while (j < len && isIdentifierChar(source[j] ?? '')) {
        j += 1;
      }
      tokens.push({ type: 'at', text: '@', position: start });
      tokens.push({
        type: 'identifier',
        text: source.slice(i + 1, j),
        position: start + 1,
      });
      i = j;
      continue;
    }

    if (ch === '<') {
      if (source[i + 1] === '=') {
        tokens.push({ type: 'lte', text: '<=', position: start });
        i += 2;
      } else {
        tokens.push({ type: 'lt', text: '<', position: start });
        i += 1;
      }
      continue;
    }

    if (ch === '>') {
      if (source[i + 1] === '=') {
        tokens.push({ type: 'gte', text: '>=', position: start });
        i += 2;
      } else {
        tokens.push({ type: 'gt', text: '>', position: start });
        i += 1;
      }
      continue;
    }

    if (ch === '=') {
      tokens.push({ type: 'eq', text: '=', position: start });
      i += 1;
      continue;
    }

    // 'd' is ambiguous: "2d6" (dice separator, followed by faces) vs. "2d6dh1"
    // (drop-highest, followed by 'h'/'l'). Disambiguate with one-char lookahead.
    if (ch === 'd' || ch === 'D') {
      const next = source[i + 1] ?? '';
      if (next === 'h' || next === 'H') {
        tokens.push({ type: 'dh', text: source.slice(i, i + 2), position: start });
        i += 2;
        continue;
      }
      if (next === 'l' || next === 'L') {
        tokens.push({ type: 'dl', text: source.slice(i, i + 2), position: start });
        i += 2;
        continue;
      }
      tokens.push({ type: 'd', text: source[i] ?? 'd', position: start });
      i += 1;
      continue;
    }

    if (ch === 'k' || ch === 'K') {
      const next = source[i + 1] ?? '';
      if (next === 'h' || next === 'H') {
        tokens.push({ type: 'kh', text: source.slice(i, i + 2), position: start });
        i += 2;
        continue;
      }
      if (next === 'l' || next === 'L') {
        tokens.push({ type: 'kl', text: source.slice(i, i + 2), position: start });
        i += 2;
        continue;
      }
      return {
        ok: false,
        error: { message: "expected 'kh' or 'kl'", position: start },
      };
    }

    if (ch === 'r' || ch === 'R') {
      const next = source[i + 1] ?? '';
      if (next === 'r' || next === 'R') {
        tokens.push({ type: 'rr', text: source.slice(i, i + 2), position: start });
        i += 2;
        continue;
      }
      return {
        ok: false,
        error: { message: "expected 'rr'", position: start },
      };
    }

    return {
      ok: false,
      error: { message: `unexpected character '${ch}'`, position: start },
    };
  }

  tokens.push({ type: 'eof', text: '', position: len });
  return { ok: true, tokens };
}
