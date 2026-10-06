import type { RandomSource } from '@hearthtable/dice/pure';
import { evaluate, parse } from '@hearthtable/dice/pure';
import { describe, expect, it } from 'vitest';

import { chatItemUseMessageSchema, chatMessageSchema } from './chatMessage.js';

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
    actorId: crypto.randomUUID(),
    actorName: 'Valeria',
    itemName: 'Minor Healing Potion',
  };
}

function evaluateExpression(expression: string) {
  const parsed = parse(expression);
  if (!parsed.ok) {
    throw new Error(`test setup failed to parse "${expression}"`);
  }
  const evaluated = evaluate(expression, parsed.expression, { rng: testRng });
  if (!evaluated.ok) {
    throw new Error(`test setup failed to evaluate "${expression}"`);
  }
  return evaluated.result;
}

describe('chatItemUseMessageSchema', () => {
  it('accepts a card with just text, no roll', () => {
    const message = {
      ...baseFields(),
      kind: 'itemUse' as const,
      text: 'A dose of rope, chewed thoughtfully.',
    };
    expect(chatItemUseMessageSchema.safeParse(message).success).toBe(true);
  });

  it('accepts a card whose text contained a dice expression, carrying the roll', () => {
    const message = {
      ...baseFields(),
      kind: 'itemUse' as const,
      text: 'Drink this to regain 1d8+5 Hit Points.',
      roll: evaluateExpression('1d8+5'),
    };
    expect(chatItemUseMessageSchema.safeParse(message).success).toBe(true);
  });

  it('accepts empty text -- an item with no rules text still posts a card', () => {
    const message = { ...baseFields(), kind: 'itemUse' as const, text: '' };
    expect(chatItemUseMessageSchema.safeParse(message).success).toBe(true);
  });

  it('rejects a missing itemName or actorId', () => {
    const { itemName: _itemName, ...withoutItemName } = baseFields();
    expect(
      chatItemUseMessageSchema.safeParse({
        ...withoutItemName,
        kind: 'itemUse',
        text: 'x',
      }).success,
    ).toBe(false);
    const { actorId: _actorId, ...withoutActorId } = baseFields();
    expect(
      chatItemUseMessageSchema.safeParse({
        ...withoutActorId,
        kind: 'itemUse',
        text: 'x',
      }).success,
    ).toBe(false);
  });

  it('is a member of the chatMessage discriminated union', () => {
    const message = { ...baseFields(), kind: 'itemUse' as const, text: 'Used.' };
    expect(chatMessageSchema.safeParse(message).success).toBe(true);
  });
});
