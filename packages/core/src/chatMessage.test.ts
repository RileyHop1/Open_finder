import type { RandomSource } from '@hearthtable/dice/pure';
import { evaluate, evaluateDamage, parse } from '@hearthtable/dice/pure';
import { describe, expect, it } from 'vitest';

import {
  type ChatMessage,
  chatMessageSchema,
  chatRollMessageSchema,
  chatTextMessageSchema,
  rollResultSchema,
} from './chatMessage.js';

/**
 * A plain, non-cryptographic RNG for these tests -- not `cryptoRandomSource`,
 * which lives at the package root (not `/pure`) precisely because it needs
 * `node:crypto`. These tests only need a schema to validate against real
 * `@hearthtable/dice` output, not a production-quality random source.
 */
const testRng: RandomSource = (faces) => Math.floor(Math.random() * faces) + 1;

function baseFields() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    worldId: crypto.randomUUID(),
    type: 'chatMessage' as const,
    seatId: crypto.randomUUID(),
    permissions: { default: 'observer' as const },
  };
}

function evaluateExpression(expression: string) {
  const parsed = parse(expression);
  if (!parsed.ok) {
    throw new Error(
      `test setup failed to parse "${expression}": ${parsed.error.message}`,
    );
  }
  const evaluated = evaluate(expression, parsed.expression, { rng: testRng });
  if (!evaluated.ok) {
    throw new Error(`test setup failed to evaluate "${expression}"`);
  }
  return evaluated.result;
}

describe('chatTextMessageSchema', () => {
  it('accepts a well-formed text message', () => {
    const message = {
      ...baseFields(),
      kind: 'text' as const,
      text: 'Rolling for initiative.',
    };
    expect(chatTextMessageSchema.safeParse(message).success).toBe(true);
  });

  it('rejects an empty text body', () => {
    const message = { ...baseFields(), kind: 'text' as const, text: '' };
    expect(chatTextMessageSchema.safeParse(message).success).toBe(false);
  });

  it('requires a seatId', () => {
    const { seatId: _seatId, ...withoutSeatId } = baseFields();
    const message = { ...withoutSeatId, kind: 'text' as const, text: 'hello' };
    expect(chatTextMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('chatRollMessageSchema', () => {
  it('accepts a roll message wrapping a real evaluated RollResult', () => {
    const roll = evaluateExpression('2d6+4');
    const message = { ...baseFields(), kind: 'roll' as const, roll };
    expect(chatRollMessageSchema.safeParse(message).success).toBe(true);
  });

  it('carries an optional label, absent for a bare roll', () => {
    const roll = evaluateExpression('1d20+9');
    const labelled = {
      ...baseFields(),
      kind: 'roll' as const,
      roll,
      label: 'Pries it open',
    };
    const parsed = chatRollMessageSchema.parse(labelled);
    expect(parsed.label).toBe('Pries it open');
    expect(
      chatRollMessageSchema.parse({ ...baseFields(), kind: 'roll' as const, roll }).label,
    ).toBeUndefined();
    expect(chatRollMessageSchema.safeParse({ ...labelled, label: '' }).success).toBe(
      false,
    );
  });

  it('rejects a roll message with no `roll` field', () => {
    const message = { ...baseFields(), kind: 'roll' as const };
    expect(chatRollMessageSchema.safeParse(message).success).toBe(false);
  });

  it('rejects a roll message carrying free text instead of a roll', () => {
    const message = { ...baseFields(), kind: 'roll' as const, text: 'not a roll' };
    expect(chatRollMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('chatMessageSchema (the discriminated union)', () => {
  it('discriminates on `kind`, not `type` -- both variants share the same `type` literal', () => {
    const text = { ...baseFields(), kind: 'text' as const, text: 'hi' };
    const roll = {
      ...baseFields(),
      kind: 'roll' as const,
      roll: evaluateExpression('1d20'),
    };
    expect(chatMessageSchema.safeParse(text).success).toBe(true);
    expect(chatMessageSchema.safeParse(roll).success).toBe(true);
  });

  it('rejects a `kind` that is neither `text` nor `roll`', () => {
    const message = { ...baseFields(), kind: 'emote', text: 'waves' };
    expect(chatMessageSchema.safeParse(message).success).toBe(false);
  });

  it('rejects a `type` other than `chatMessage`', () => {
    const message = { ...baseFields(), type: 'journalEntry', kind: 'text', text: 'hi' };
    expect(chatMessageSchema.safeParse(message).success).toBe(false);
  });

  it('a parsed text message has no `roll` key at all', () => {
    const parsed: ChatMessage = chatMessageSchema.parse({
      ...baseFields(),
      kind: 'text',
      text: 'hi',
    });
    expect('roll' in parsed).toBe(false);
  });

  it('a parsed roll message has no `text` key at all', () => {
    const parsed: ChatMessage = chatMessageSchema.parse({
      ...baseFields(),
      kind: 'roll',
      roll: evaluateExpression('1d20'),
    });
    expect('text' in parsed).toBe(false);
  });
});

/**
 * `rollResultSchema` claims to mirror `@hearthtable/dice`'s `RollResult`
 * exactly. These tests prove that against real output from that package,
 * not just against hand-written fixtures shaped to fit -- the same kind of
 * empirical check this project has used for `.loose()` and WAL snapshotting
 * elsewhere.
 */
describe('rollResultSchema against real @hearthtable/dice output', () => {
  it('round-trips a plain arithmetic-and-dice roll with no optional fields', () => {
    const roll = evaluateExpression('2d6+4');
    const parsed = rollResultSchema.parse(roll);
    expect(parsed).toEqual(roll);
    expect('degree' in parsed).toBe(false);
    expect('natural' in parsed).toBe(false);
    expect('damage' in parsed).toBe(false);
  });

  it('round-trips a roll carrying a seed', () => {
    const parsedExpr = parse('1d20');
    if (!parsedExpr.ok) {
      throw new Error('test setup failed to parse');
    }
    const evaluated = evaluate('1d20', parsedExpr.expression, {
      rng: testRng,
      seed: 'test-seed',
    });
    if (!evaluated.ok) {
      throw new Error('test setup failed to evaluate');
    }
    expect(rollResultSchema.parse(evaluated.result)).toEqual(evaluated.result);
  });

  it('round-trips a check roll with degree and natural set', () => {
    const roll = evaluateExpression('1d20+7');
    // degreeOfSuccess()/natural aren't produced by evaluate() itself -- a
    // check-rolling caller (the future chat.sendRoll handler) composes them
    // onto the base RollResult. Simulated here the same way.
    const withDegree = { ...roll, degree: 'success' as const, natural: 15 };
    expect(rollResultSchema.parse(withDegree)).toEqual(withDegree);
  });

  it('round-trips a real damage roll, including its `damage` field', () => {
    const result = evaluateDamage(
      [{ expression: '2d8+4', damageType: 'piercing' }],
      false,
      { rng: testRng },
    );
    if (!result.ok) {
      throw new Error('test setup failed to evaluate damage');
    }
    const parsed = rollResultSchema.parse(result.result);
    expect(parsed).toEqual(result.result);
    expect(typeof parsed.damage?.['piercing']).toBe('number');
  });

  it('retains a dropped die in `terms`, marked kept: false, on the way through', () => {
    const roll = evaluateExpression('4d6dl1');
    const parsed = rollResultSchema.parse(roll);
    expect(parsed.terms.some((term) => term.kind === 'die' && !term.kept)).toBe(true);
  });
});

describe('chatCheckMessageSchema', () => {
  const base = {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'chatMessage' as const,
    schemaVersion: 1,
    permissions: { default: 'observer' as const, seats: {} },
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    seatId: crypto.randomUUID(),
    kind: 'check' as const,
    actorId: crypto.randomUUID(),
    actorName: 'Hero',
    statistic: 'skill:athletics',
    label: 'Athletics',
    breakdown: {
      total: 7,
      modifiers: [
        {
          slug: 'str',
          label: 'Strength',
          type: 'ability' as const,
          value: 4,
          source: 'Strength',
          enabled: true,
          applied: true,
        },
      ],
    },
    roll: { ...evaluateExpression('1d20+7'), natural: 12 },
  };

  it('round-trips through the ChatMessage union with its breakdown and roll', () => {
    expect(chatMessageSchema.parse(base)).toEqual(base);
  });

  it('accepts a DC and a degree, and rejects a message with no breakdown or label', () => {
    expect(
      chatMessageSchema.safeParse({
        ...base,
        dc: 20,
        roll: { ...base.roll, degree: 'success' },
      }).success,
    ).toBe(true);
    const { breakdown: _breakdown, ...noBreakdown } = base;
    expect(chatMessageSchema.safeParse(noBreakdown).success).toBe(false);
    expect(chatMessageSchema.safeParse({ ...base, label: '' }).success).toBe(false);
  });
});

describe('strike chat messages', () => {
  const base = {
    id: crypto.randomUUID(),
    worldId: crypto.randomUUID(),
    type: 'chatMessage' as const,
    schemaVersion: 1,
    permissions: { default: 'observer' as const, seats: {} },
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    seatId: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    actorName: 'Hero',
    itemId: crypto.randomUUID(),
    weaponName: 'Invented Sword',
    breakdown: { total: 7, modifiers: [] },
    roll: evaluateExpression('1d20+7'),
  };

  it('round-trips an attack and a damage message through the union', () => {
    const attack = { ...base, kind: 'strikeAttack' as const, attackNumber: 2 as const };
    const damage = { ...base, kind: 'strikeDamage' as const, critical: true };
    expect(chatMessageSchema.parse(attack)).toEqual(attack);
    expect(chatMessageSchema.parse(damage)).toEqual(damage);
  });

  it('rejects an attack number outside 1 to 3 and a damage message with no critical flag', () => {
    expect(
      chatMessageSchema.safeParse({ ...base, kind: 'strikeAttack', attackNumber: 4 })
        .success,
    ).toBe(false);
    expect(chatMessageSchema.safeParse({ ...base, kind: 'strikeDamage' }).success).toBe(
      false,
    );
  });
});
